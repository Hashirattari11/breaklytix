"""Fresh GitHub repository re-scan core, shared by the daily scheduler.

Mirrors the behavior of ``routers.repos.scan_repo(...)`` so scheduled runs can
refresh stored ``api_detections`` from a live tree + blob fetch instead of only
re-checking stored snippets. Caps (max_files_scanned / max_file_bytes), the
detection upsert conflict key, and the plan-limit bookkeeping all come from the
same config + billing helpers the manual scan uses.

Anything that goes wrong is reported inside the returned dict — a rescan
failure never raises out of the daily run.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from .config import settings
from .detection import is_scannable_path, scan_file
from .db import db

logger = logging.getLogger(__name__)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rescan_repo_fresh(repo: dict, user_id: str, *, deadline: float | None = None) -> dict:
    """Re-scan one repository from GitHub live and refresh stored detections.

    Args mirror ``repos.scan_repo``'s helpers; ``deadline`` is a
    ``time.monotonic()`` point after which no further blobs are fetched (the
    daily cron shares one global time budget across repos).

    Returns:
      {
        "status": "ok" | "ok_partial" | "fallback",
        "reason": "" | <short reason code>,
        "files_scanned": int,          # files actually fetched + scanned
        "detections": int,             # detection rows produced this run
        "new_apis": int,               # APIs not stored before this run
        "plan_warning": str | None,
      }
    First run reports "not_attempted" style reasons through status="fallback".
    """
    repo_id = repo.get("id")
    full_name = repo.get("full_name") or ""
    branch = repo.get("default_branch") or "main"
    result: dict = {
        "status": "fallback",
        "reason": "not_attempted",
        "files_scanned": 0,
        "detections": 0,
        "new_apis": 0,
        "plan_warning": None,
    }
    if not repo_id or not full_name:
        result["reason"] = "missing_repo_identity"
        return result

    # Local imports keep the heavy router/billing modules out of the
    # scheduler's import path and dodge any import-cycle risk at module load.
    from .github_client import (
        GitHubAuthError,
        GitHubError,
        call_with_token_fallback,
        get_blob_text,
        list_repo_tree,
    )
    from .routers.repos import _record_scan_row, _repo_scan_tokens

    started_at = _utcnow_iso()
    try:
        tokens = _repo_scan_tokens(repo, user_id)
    except Exception as exc:  # noqa: BLE001 - token selection is best-effort
        logger.warning("[DAILY RESCAN] token selection failed for %s: %s", full_name, exc)
        tokens = []
    if not tokens:
        result["reason"] = "no_github_token"
        return result

    try:
        tree, token = call_with_token_fallback(
            tokens, lambda tok: list_repo_tree(tok, full_name, branch)
        )
    except GitHubAuthError as exc:
        logger.warning("[DAILY RESCAN] GitHub auth error for %s: %s", full_name, exc)
        _record_scan_row(
            repo_id, "FAILED",
            started_at=started_at, finished_at=_utcnow_iso(),
            error_message="GitHub authentication failed during daily rescan",
            stats={"daily_rescan": True},
        )
        result["reason"] = "github_auth"
        return result
    except GitHubError as exc:
        logger.warning("[DAILY RESCAN] GitHub error for %s: %s", full_name, exc)
        _record_scan_row(
            repo_id, "FAILED",
            started_at=started_at, finished_at=_utcnow_iso(),
            error_message="GitHub error during daily rescan",
            stats={"daily_rescan": True},
        )
        result["reason"] = "github_error"
        return result

    # Same filtering + cap as the manual scan: only scannable, reasonably-sized
    # source files, capped for free-tier safety.
    candidates = [
        e for e in tree
        if is_scannable_path(e.get("path", "")) and 0 < e.get("size", 0) <= settings.max_file_bytes
    ][: settings.max_files_scanned]

    detections: list[dict] = []
    files_scanned = 0
    timed_out = False
    for entry in candidates:
        if deadline is not None and time.monotonic() > deadline:
            timed_out = True
            break
        try:
            text = get_blob_text(token, full_name, entry["sha"])
        except GitHubError:
            continue
        if text is None:
            continue
        files_scanned += 1
        for d in scan_file(entry["path"], text):
            detections.append(
                {
                    "repo_id": repo_id,
                    "api_name": d.api_name,
                    "file_path": d.file_path,
                    "line_number": d.line_number,
                    "matched_snippet": d.matched_snippet,
                    "symbols": ",".join(d.symbols) if d.symbols else None,
                }
            )

    # Same plan-limit semantics as the manual scan: the limit gates *monitoring*
    # (alerts/fixes), never detection — all detections are stored regardless.
    plan_warning: str | None = None
    new_apis_count = 0
    monitored_to_add = 0
    if detections:
        new_apis = {d["api_name"] for d in detections}
        existing = (
            db().table("api_detections").select("api_name").eq("repo_id", repo_id).execute()
        )
        existing_apis = {d["api_name"] for d in (existing.data or [])}
        truly_new_apis = new_apis - existing_apis
        new_apis_count = len(truly_new_apis)
        monitored_to_add = len(truly_new_apis)
        if truly_new_apis:
            try:
                from .billing import check_plan_limit, get_user_plan_info

                allowed, _error = check_plan_limit(user_id, len(truly_new_apis))
                if not allowed:
                    plan_info = get_user_plan_info(user_id) or {}
                    plan_limit = plan_info.get("monitored_api_limit", 10)
                    current_used = plan_info.get("monitored_api_count", 0)
                    monitored_to_add = (
                        max(0, plan_limit - current_used)
                        if plan_limit != -1
                        else len(truly_new_apis)
                    )
                    plan_warning = (
                        f"Detected {len(truly_new_apis)} new provider(s), but your "
                        f"{plan_info.get('plan_status', 'trial')} plan monitors {plan_limit} API(s) "
                        f"({current_used} already used). All detections are stored; upgrade your plan "
                        f"to monitor & alert on every provider."
                    )
            except Exception as exc:  # noqa: BLE001 - billing must not break rescans
                logger.warning("[DAILY RESCAN] plan-limit check failed for repo=%s: %s", repo_id, exc)
                monitored_to_add = 0

    # Upsert (never delete — deleting would cascade and wipe alert history).
    for i in range(0, len(detections), 500):
        db().table("api_detections").upsert(
            detections[i : i + 500],
            on_conflict="repo_id,api_name,file_path,line_number",
        ).execute()
    if monitored_to_add > 0:
        try:
            from .billing import increment_api_count

            increment_api_count(user_id, monitored_to_add)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[DAILY RESCAN] usage increment failed for repo=%s: %s", repo_id, exc)

    now = _utcnow_iso()
    db().table("repos").update({"last_scanned_at": now}).eq("id", repo_id).execute()

    apis = sorted({d["api_name"] for d in detections})
    result.update(
        status="ok_partial" if timed_out else "ok",
        reason="time_budget" if timed_out else "",
        files_scanned=files_scanned,
        detections=len(detections),
        new_apis=new_apis_count,
        plan_warning=plan_warning,
    )
    _record_scan_row(
        repo_id, "COMPLETED",
        started_at=started_at, finished_at=now,
        stats={
            "files_scanned": files_scanned,
            "detections_found": len(detections),
            "apis_detected": apis,
            "plan_warning": plan_warning,
            "timed_out": timed_out,
            "daily_rescan": True,
        },
    )
    logger.info(
        "[DAILY RESCAN] %s — files=%d detections=%d apis=%s timed_out=%s",
        full_name, files_scanned, len(detections), ",".join(apis) or "none", timed_out,
    )
    return result
