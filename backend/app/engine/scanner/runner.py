"""Scan runner: executes a scan job (QUEUED -> SCANNING -> ANALYZING -> ...).

Runs in a daemon thread so the API returns immediately with the scan_id; the
frontend polls GET /repos/{id}/scans/{scan_id} for status.

Pipeline per scan:
  1. SCANNING  — fetch repo tree (Git trees API) + scannable blob texts.
  2. ANALYZING — structural scan (ast_scan) -> usage hits; rules engine (M3)
                 upgrades/provider-matches into breaking-change findings.
  3. COMPLETED — persist findings + api_detections + stats; or FAILED with error.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any

from ...config import settings
from ...db import db
from ...github_client import GitHubError, get_blob_text, list_repo_tree
from ...detection import is_scannable_path
from ...redact import redact_snippet
from .ast_scan import scan_content, ScanHit
from .project_detect import detect_project

logger = logging.getLogger("autofix.scanner")

SEVERITY_FOR_KIND = {"signature": "low", "import": "low", "call": "info"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_status(scan_id: str, status: str, **extra: Any) -> None:
    payload: dict[str, Any] = {"status": status, **extra}
    db().table("scans").update(payload).eq("id", scan_id).execute()


def _add_event(scan_id: str, event_type: str, message: str) -> None:
    try:
        db().table("scan_events").insert(
            {"scan_id": scan_id, "event_type": event_type, "message": message}
        ).execute()
    except Exception:
        pass  # events are best-effort; never fail the scan


def _persist_findings(rows: list[dict]) -> int:
    """Insert findings, de-duped in-memory by (file, line, message).

    Every persisted snippet/usage/message is passed through redact_snippet so a
    hardcoded secret on a matched line never lands in the database verbatim.
    """
    seen: set[tuple] = set()
    cleaned: list[dict] = []
    for r in rows:
        key = (r["file"], r.get("line"), r["message"])
        if key in seen:
            continue
        seen.add(key)
        cleaned_row = dict(r)
        cleaned_row["current_usage"] = redact_snippet(r.get("current_usage"))
        cleaned_row["message"] = redact_snippet(r.get("message"))
        cleaned.append(cleaned_row)
    for i in range(0, len(cleaned), 200):
        db().table("findings").insert(cleaned[i : i + 200]).execute()
    return len(cleaned)


def _persist_api_detections(repo_id: str, hits: list[ScanHit]) -> None:
    rows: list[dict] = []
    for h in hits:
        api_name = h.provider or (h.symbols[0] if h.symbols else None)
        if not api_name:
            continue
        rows.append({
            "repo_id": repo_id,
            "api_name": api_name,
            "file_path": h.file,
            "line_number": h.line,
            "matched_snippet": redact_snippet(h.snippet),
            "symbols": ",".join(h.symbols) if h.symbols else api_name,
        })
    for i in range(0, len(rows), 500):
        try:
            db().table("api_detections").upsert(
                rows[i : i + 500],
                on_conflict="repo_id,api_name,file_path,line_number",
            ).execute()
        except Exception as exc:
            logger.warning("api_detections upsert failed: %s", exc)


def run_scan(scan_id: str, repo_id: str, full_name: str, branch: str, token: str) -> None:
    """Execute the scan. Meant to run inside a daemon thread."""
    _set_status(scan_id, "SCANNING", started_at=_now())
    _add_event(scan_id, "SCANNING", f"Scanning {full_name}@{branch}")

    findings_rows: list[dict] = []
    files_scanned = 0
    files_skipped = 0
    try:
        tree, _truncated = list_repo_tree(token, full_name, branch)
    except GitHubError as exc:
        _set_status(scan_id, "FAILED", error_message=str(exc), finished_at=_now())
        _add_event(scan_id, "FAILED", str(exc))
        return

    tree_paths = [e["path"] for e in tree]
    project = detect_project(tree_paths)

    candidates = [
        e for e in tree
        if is_scannable_path(e["path"]) and 0 < e.get("size", 0) <= settings.max_file_bytes
    ][: settings.max_files_scanned]

    hits: list[ScanHit] = []
    for entry in candidates:
        try:
            text = get_blob_text(token, full_name, entry["sha"])
        except GitHubError:
            files_skipped += 1
            continue
        if text is None:
            files_skipped += 1
            continue
        files_scanned += 1
        hits.extend(scan_content(entry["path"], text))

    _set_status(scan_id, "ANALYZING")
    _add_event(scan_id, "ANALYZING", f"{files_scanned} files scanned, {len(hits)} usages found")

    # Usage findings (baseline): every structural hit is a potential breaking point.
    for h in hits:
        findings_rows.append({
            "scan_id": scan_id,
            "repo_id": repo_id,
            "severity": SEVERITY_FOR_KIND.get(h.kind, "info"),
            "type": "api_usage",
            "provider": h.provider,
            "file": h.file,
            "line": h.line,
            "message": h.message or f"Detected usage in {h.file}:{h.line}",
            "current_usage": h.snippet,
            "recommended_fix": None,
            "confidence": 0.9 if h.kind == "signature" else 0.75,
            "status": "open",
            "verification_status": "detected",
            "tech": project.get("language"),
        })

    # Rules engine (M3): enrich with breaking-change findings where a provider
    # rule matches the usage (deprecated/removed/renamed/breaking patterns).
    try:
        from ..rules.matcher import enrich_findings
        findings_rows = enrich_findings(findings_rows, tree_paths)
    except Exception as exc:  # rules engine must never sink a scan
        logger.warning("rules enrichment skipped: %s", exc)

    inserted = 0
    try:
        inserted = _persist_findings(findings_rows)
    except Exception as exc:
        _set_status(scan_id, "FAILED", error_message=f"findings persist failed: {exc}", finished_at=_now())
        _add_event(scan_id, "FAILED", f"findings persist failed: {exc}")
        return

    try:
        _persist_api_detections(repo_id, hits)
    except Exception as exc:
        logger.warning("api_detections persist failed: %s", exc)

    # Health bridge (idempotent): findings -> reliability_issues -> alerts,
    # and findings/usage/rate-limit -> health checks + scores + history.
    health_counts: dict[str, int] = {}
    try:
        from ..health.bridge import compute_and_store_health, sync_findings_to_issues
        health_counts["issues_created"] = sync_findings_to_issues(repo_id, findings_rows)
        health_counts["scores_stored"] = compute_and_store_health(repo_id, findings_rows)
    except Exception as exc:
        logger.warning("health bridge failed: %s", exc)

    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_provider: dict[str, int] = {}
    for r in findings_rows:
        by_severity[r["severity"]] = by_severity.get(r["severity"], 0) + 1
        by_type[r["type"]] = by_type.get(r["type"], 0) + 1
        if r.get("provider"):
            by_provider[r["provider"]] = by_provider.get(r["provider"], 0) + 1

    stats = {
        "files_scanned": files_scanned,
        "files_skipped": files_skipped,
        "findings_total": inserted,
        "by_severity": by_severity,
        "by_type": by_type,
        "by_provider": by_provider,
        "language": project.get("language"),
        "package_manager": project.get("package_manager"),
        "health": health_counts,
    }

    finished = _now()
    _set_status(scan_id, "COMPLETED", finished_at=finished, stats=stats)
    _add_event(scan_id, "COMPLETED", f"Scan complete: {inserted} findings")
    try:
        db().table("repos").update({"last_scanned_at": finished}).eq("id", repo_id).execute()
    except Exception as exc:
        logger.warning("last_scanned_at update failed: %s", exc)


def start_scan(repo_id: str, full_name: str, branch: str, token: str) -> str:
    """Create a QUEUED scan row and kick off the worker thread. Returns scan_id."""
    row = {
        "repo_id": repo_id,
        "status": "QUEUED",
        "scan_type": "full",
        "started_at": _now(),
    }
    res = db().table("scans").insert(row).execute()
    scan_id = res.data[0]["id"]
    _add_event(scan_id, "QUEUED", "Scan queued")
    t = threading.Thread(
        target=run_scan,
        args=(scan_id, repo_id, full_name, branch, token),
        daemon=True,
        name=f"scan-{scan_id[:8]}",
    )
    t.start()
    return scan_id