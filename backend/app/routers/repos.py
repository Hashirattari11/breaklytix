"""Repo routes: connect, list, scan, and read the detected API footprint."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger("autofix.repos")

from ..billing import check_plan_limit, get_user_plan_info, increment_api_count
from ..config import settings
from ..crypto import get_cipher
from ..db import db, fetch_one
from ..deps import get_current_user_id
from ..detection import scan_file
from ..github_app import get_installation_access_token
from ..github_client import (
    GitHubAuthError,
    GitHubError,
    call_with_token_fallback,
    get_blob_text,
    get_repo,
    list_repo_tree,
    list_user_repos,
)
from ..detection import is_scannable_path
from ..schemas import (
    ApiFootprintGroup,
    DetectionOut,
    DetectionsOut,
    GitHubRepoOut,
    RepoConnectIn,
    RepoOut,
    ScanResultOut,
    AlertOut,
    AlertWithRepoOut,
    AlertStatusUpdateIn,
    MarkAlertsReadIn,
    MarkAlertsReadOut,
    SimulateBreakingChangeOut,
    SimulatedAlertLocation,
)
from ..severity import severity_sort_key, score_severity
from ..alerts import detection_matches, event_tokens, render_alert_email
from ..email_service import send_alert_email
from ..mocks.mock_changelog_event import MOCK_BREAKING_CHANGES, get_mock_for_provider
from ..signatures import status_for_api, get_provider_category, PLANNED_APIS, API_SIGNATURES, MONITORED_APIS

router = APIRouter(prefix="/repos", tags=["repos"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _user_github_token(user_id: str) -> str:
    user = fetch_one("users", {"id": user_id})
    if not user or not user.get("github_access_token"):
        raise HTTPException(status_code=400, detail="No GitHub connection on file. Re-authenticate.")
    return get_cipher().decrypt(user["github_access_token"])


def _repo_scan_tokens(repo: dict, user_id: str) -> list[str]:
    """Ordered GitHub token candidates for calls on this repo.

    The per-repo snapshot comes first (it guarantees access for agency-managed
    client repos whose token lives on the repo row), then the user's freshest
    token. The snapshot is a copy taken at connect time, so it can go stale
    after re-auth — the fallback makes sure a refresh actually takes effect.
    Decryption failures are skipped, never fatal.
    """
    tokens: list[str] = []
    agency_client_id = repo.get("agency_client_id")
    if agency_client_id:
        client = fetch_one("agency_clients", {"id": agency_client_id})
        if not client or client.get("status") != "authorized":
            # Revoked/pending agency access must never fall back to the agency
            # owner's token, which may still have broad repo access.
            return []
        installation_id = client.get("github_installation_id")
        if installation_id:
            try:
                installation_token = get_installation_access_token(str(installation_id))
            except Exception:
                installation_token = None
            if installation_token:
                tokens.append(installation_token)

    raw = repo.get("access_token")
    if raw:
        try:
            token = get_cipher().decrypt(raw)
            if token and token not in tokens:
                tokens.append(token)
        except Exception:
            pass
    try:
        user_token = _user_github_token(user_id)
    except HTTPException:
        user_token = ""
    if user_token and user_token not in tokens:
        tokens.append(user_token)
    return tokens


def _owned_repo(user_id: str, repo_id: str) -> dict:
    repo = fetch_one("repos", {"id": repo_id})
    if not repo or repo["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Repo not found")
    return repo


def assert_repo_access_active(repo: dict) -> None:
    """Fail closed when an agency-managed repo's client has been revoked."""
    agency_client_id = repo.get("agency_client_id")
    if not agency_client_id:
        return
    client = fetch_one("agency_clients", {"id": agency_client_id})
    if not client or client.get("status") != "authorized":
        raise HTTPException(status_code=403, detail="Client repository access is not authorized")


def _repo_out(r: dict) -> RepoOut:
    return RepoOut(
        id=r["id"],
        github_repo_id=r["github_repo_id"],
        full_name=r["full_name"],
        default_branch=r.get("default_branch", "main"),
        connected_at=r.get("connected_at"),
        last_scanned_at=r.get("last_scanned_at"),
    )


# ---------------------------------------------------------------------------
# GitHub repo picker (list what the user could connect)
# ---------------------------------------------------------------------------
@router.get("/github", response_model=list[GitHubRepoOut])
def list_github_repos(user_id: str = Depends(get_current_user_id)) -> list[GitHubRepoOut]:
    token = _user_github_token(user_id)
    try:
        repos = list_user_repos(token)
    except GitHubError as exc:
        # A 401 from GitHub means the stored token is revoked/expired — the
        # user needs to re-authenticate. Distinguish it from infra failures so
        # the frontend can prompt a reconnection instead of showing a generic 502.
        detail = str(exc)
        if "401" in detail or "Bad credentials" in detail:
            logger.warning("GitHub token rejected for user=%s: %s", user_id, detail)
            raise HTTPException(
                status_code=401,
                detail="Your GitHub connection has expired. Please reconnect your account.",
            )
        logger.exception("Unexpected error listing GitHub repos for user=%s", user_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return [GitHubRepoOut(**r) for r in repos]


# ---------------------------------------------------------------------------
# Connected repos
# ---------------------------------------------------------------------------
@router.get("", response_model=list[RepoOut])
def list_connected(
    user_id: str = Depends(get_current_user_id),
    as_client: str | None = Query(None),
) -> list[RepoOut]:
    # Phase 5 §6: agency owners can view client repos. Agency repos are owned
    # by the agency user (user_id=owner) and linked by agency_client_id, so
    # filtering on the client id as a user id returned nothing.
    if as_client:
        from .agency import _resolve_client_user_id
        _resolve_client_user_id(user_id, as_client)
        res = (
            db().table("repos").select("*")
            .eq("agency_client_id", as_client)
            .eq("user_id", user_id)
            .order("connected_at", desc=True)
            .execute()
        )
    else:
        res = (
            db().table("repos").select("*")
            .eq("user_id", user_id)
            .order("connected_at", desc=True)
            .execute()
        )
    return [_repo_out(r) for r in (res.data or [])]


# ---------------------------------------------------------------------------
# All alerts across the user's repos (Alerts dashboard)
# NOTE: declared BEFORE "/{repo_id}" so "/alerts" isn't captured as a repo id.
# ---------------------------------------------------------------------------
@router.get("/alerts", response_model=list[AlertWithRepoOut])
def list_all_alerts(
    repository_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
) -> list[AlertWithRepoOut]:
    # Repository-scoped when requested (ownership enforced — 404 if not owned,
    # IDOR-safe); otherwise aggregates across all repos owned by this user.
    if repository_id:
        _owned_repo(user_id, repository_id)
        repos_res = db().table("repos").select("id, full_name").eq("id", repository_id).execute()
        repos = repos_res.data or []
    else:
        repos_res = db().table("repos").select("id, full_name").eq("user_id", user_id).execute()
        repos = repos_res.data or []
    if not repos:
        return []

    repo_ids = [r["id"] for r in repos]
    repo_name_by_id = {r["id"]: r["full_name"] for r in repos}

    alerts_res = (
        db().table("alerts")
        .select("*, changelog_events(*), api_detections(*)")
        .in_("repo_id", repo_ids)
        .order("created_at", desc=True)
        .execute()
    )
    rows = alerts_res.data or []
    # Phase 5 §1: sort by severity descending (critical first)
    rows.sort(key=severity_sort_key)

    out: list[AlertWithRepoOut] = []
    for a in rows:
        ev = a.get("changelog_events") or {}
        det = a.get("api_detections") or {}
        out.append(
            AlertWithRepoOut(
                id=a["id"],
                repo_id=a["repo_id"],
                repo_name=repo_name_by_id.get(a["repo_id"], "Unknown repo"),
                read_at=a.get("read_at"),
                change_type=ev.get("change_type") or a.get("change_type") or "other",
                description=ev.get("description") or a.get("description") or a.get("severity_reason"),
                old_value=ev.get("old_value"),
                new_value=ev.get("new_value"),
                source_url=ev.get("source_url") or a.get("source_url"),
                file_path=det.get("file_path") or a.get("file_path"),
                line_number=det.get("line_number") or a.get("line_number"),
                email_sent=a.get("email_sent", False),
                sent_at=a.get("sent_at"),
                created_at=a.get("created_at"),
                severity=a.get("severity") or "medium",
                severity_reason=a.get("severity_reason"),
                provider=a.get("provider"),
                status=a.get("status"),
                is_test=a.get("is_test", False),
            )
        )
    return out


@router.patch("/alerts/read", response_model=MarkAlertsReadOut)
def mark_alerts_read(
    body: MarkAlertsReadIn | None = None,
    user_id: str = Depends(get_current_user_id),
) -> MarkAlertsReadOut:
    """Mark the user's alerts as READ (alert lifecycle: unread badge -> 0).

    - Ownership enforced: only alerts whose repo belongs to `user_id` are
      touched (IDOR-safe; passing foreign alert ids simply doesn't match).
    - Passing specific alert_ids marks only those; omitting the body (or an
      empty list) marks ALL of the user's currently-unread alerts as read.
    - Idempotent: already-read rows are unaffected (read_at preserved).
    """
    repos_res = db().table("repos").select("id").eq("user_id", user_id).execute()
    repo_ids = [r["id"] for r in (repos_res.data or [])]
    if not repo_ids:
        return MarkAlertsReadOut(updated=0)

    q = (
        db()
        .table("alerts")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .in_("repo_id", repo_ids)
        .is_("read_at", "null")
    )
    ids = (body.alert_ids if body else None) or []
    if ids:
        q = q.in_("id", ids[:500])
    res = q.execute()
    updated = len(res.data or [])
    return MarkAlertsReadOut(updated=updated)


@router.patch("/alerts/{alert_id}", response_model=AlertWithRepoOut)
def update_alert_status(
    alert_id: str,
    body: AlertStatusUpdateIn,
    user_id: str = Depends(get_current_user_id),
) -> AlertWithRepoOut:
    """User-level alert triage (Alerts dashboard): mark an alert resolved or
    ignored. Only the owner of the alert's repo can change it.
    """
    if body.status not in {"resolved", "ignored"}:
        raise HTTPException(status_code=422, detail="status must be 'resolved' or 'ignored'")

    alert = fetch_one("alerts", {"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    repo = fetch_one("repos", {"id": alert.get("repo_id")})
    if not repo or repo.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Alert not found")

    db().table("alerts").update({"status": body.status}).eq("id", alert_id).execute()

    # Re-fetch the same joined shape list_all_alerts returns.
    res = (
        db().table("alerts")
        .select("*, changelog_events(*), api_detections(*)")
        .eq("id", alert_id)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(status_code=500, detail="Failed to update alert")

    ev = row.get("changelog_events") or {}
    det = row.get("api_detections") or {}
    return AlertWithRepoOut(
        id=row["id"],
        repo_id=row["repo_id"],
        repo_name=repo.get("full_name") or "Unknown repo",
        change_type=ev.get("change_type") or row.get("change_type") or "other",
        description=ev.get("description") or row.get("description") or row.get("severity_reason"),
        old_value=ev.get("old_value"),
        new_value=ev.get("new_value"),
        source_url=ev.get("source_url") or row.get("source_url"),
        file_path=det.get("file_path") or row.get("file_path"),
        line_number=det.get("line_number") or row.get("line_number"),
        email_sent=row.get("email_sent", False),
        sent_at=row.get("sent_at"),
        created_at=row.get("created_at"),
        severity=row.get("severity") or "medium",
        severity_reason=row.get("severity_reason"),
        provider=row.get("provider"),
        status=row.get("status"),
        is_test=row.get("is_test", False),
    )


@router.post("/connect", response_model=RepoOut)
def connect_repo(body: RepoConnectIn, user_id: str = Depends(get_current_user_id)) -> RepoOut:
    token = _user_github_token(user_id)
    # Confirm the user can actually see this repo (and get an authoritative branch).
    try:
        gh = get_repo(token, body.full_name)
    except GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    row = {
        "user_id": user_id,
        "github_repo_id": gh["github_repo_id"],
        "full_name": gh["full_name"],
        "default_branch": gh["default_branch"] or body.default_branch,
        # Per spec: store the (encrypted) access token on the repo too.
        "access_token": get_cipher().encrypt(token),
    }
    res = (
        db()
        .table("repos")
        .upsert(row, on_conflict="user_id,github_repo_id")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to connect repo")

    repo = res.data[0]

    # Auto-scan on connect (Phase 3) — run in the BACKGROUND task runner so
    # the connect request returns immediately. The old inline scan_repo()
    # could exceed the Vercel function timeout (60s) on large repos, which
    # made the frontend appear stuck on "Connecting..." even though the repo
    # row was already created.
    try:
        start_scan(
            repo["id"],
            repo["full_name"],
            repo.get("default_branch") or "main",
            token,
        )
    except Exception:
        # Log but don't fail - scan can be retried manually
        pass

    return _repo_out(repo)


@router.get("/{repo_id}", response_model=RepoOut)
def get_connected_repo(
    repo_id: str,
    user_id: str = Depends(get_current_user_id),
    as_client: str | None = Query(None),
) -> RepoOut:
    if as_client:
        from .agency import _resolve_client_user_id
        _resolve_client_user_id(user_id, as_client)
        repo = fetch_one("repos", {"id": repo_id})
        if (
            not repo
            or repo.get("agency_client_id") != as_client
            or repo.get("user_id") != user_id
        ):
            raise HTTPException(status_code=404, detail="Repo not found")
        return _repo_out(repo)
    return _repo_out(_owned_repo(user_id, repo_id))


# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------
@router.post("/{repo_id}/scan", response_model=ScanResultOut)
def scan_repo(repo_id: str, user_id: str = Depends(get_current_user_id)) -> ScanResultOut:
    repo = _owned_repo(user_id, repo_id)
    assert_repo_access_active(repo)
    full_name = repo["full_name"]
    branch = repo.get("default_branch", "main")
    logger.info("[API HEALTH] Scan started for %s (user=%s)", full_name, user_id)
    scan_started_at = datetime.now(timezone.utc).isoformat()

    try:
        tree, token = call_with_token_fallback(
            _repo_scan_tokens(repo, user_id),
            lambda tok: list_repo_tree(tok, full_name, branch),
        )
    except GitHubAuthError as exc:
        # Every stored token was rejected by GitHub (revoked/expired): give a
        # friendly 401 so the frontend can prompt a reconnection.
        logger.warning("[API HEALTH] Scan failed (auth) for %s: %s", full_name, exc)
        _record_scan_row(
            repo_id, "FAILED",
            started_at=scan_started_at,
            finished_at=datetime.now(timezone.utc).isoformat(),
            error_message=str(exc),
        )
        raise HTTPException(status_code=401, detail=str(exc))
    except GitHubError as exc:
        logger.warning("[API HEALTH] Scan failed (github) for %s: %s", full_name, exc)
        _record_scan_row(
            repo_id, "FAILED",
            started_at=scan_started_at,
            finished_at=datetime.now(timezone.utc).isoformat(),
            error_message=str(exc),
        )
        raise HTTPException(status_code=502, detail=str(exc))
    logger.info("[API HEALTH] GitHub access verified for %s — tree entries: %d", full_name, len(tree))

    # Keep only scannable, reasonably-sized source files, capped for free-tier safety.
    candidates = [
        e for e in tree
        if is_scannable_path(e["path"]) and 0 < e.get("size", 0) <= settings.max_file_bytes
    ][: settings.max_files_scanned]

    detections: list[dict] = []
    files_scanned = 0
    for entry in candidates:
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

    # Check plan limit for NEW APIs detected in this scan.
    # NOTE: the limit gates *monitoring* (alerts/fixes), never detection.
    # A scan must never hard-fail just because the repo uses more providers
    # than the plan monitors: we store ALL detections and return a clear,
    # non-blocking warning so the UI can prompt an upgrade.
    plan_limit_exceeded = False
    plan_warning: str | None = None
    new_apis_count = 0
    monitored_to_add = 0
    if detections:
        new_apis = set(d["api_name"] for d in detections)
        # Check existing monitored APIs for this user
        existing = (
            db()
            .table("api_detections")
            .select("api_name")
            .eq("repo_id", repo_id)
            .execute()
        )
        existing_apis = {d["api_name"] for d in (existing.data or [])}
        truly_new_apis = new_apis - existing_apis
        new_apis_count = len(truly_new_apis)

        if truly_new_apis:
            allowed, error_msg = check_plan_limit(user_id, len(truly_new_apis))
            if not allowed:
                plan_limit_exceeded = True
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
                logger.warning(
                    "[API HEALTH] plan limit for user=%s repo=%s: %d new APIs, limit=%d, in-use=%d -> capped",
                    user_id, full_name, len(truly_new_apis), plan_limit, current_used,
                )
            else:
                monitored_to_add = len(truly_new_apis)

    # Upsert (never delete — deleting would cascade and wipe alert history).
    if detections:
        # Batch to keep request bodies modest.
        for i in range(0, len(detections), 500):
            db().table("api_detections").upsert(
                detections[i : i + 500],
                on_conflict="repo_id,api_name,file_path,line_number",
            ).execute()

        # Bump plan usage only for the headroom the plan actually covers
        # (guarded by monitored_to_add computed above). Never on failure.
        if monitored_to_add > 0:
            increment_api_count(user_id, monitored_to_add)

    # Health bridge: detections -> reliability_issues -> alerts, and
    # detections + real manifests -> health checks/scores (same pipeline as
    # the scanner runner). Best-effort — a bridge failure never fails the scan.
    health_counts: dict[str, int] = {}
    try:
        from ..health.bridge import (
            compute_and_store_health,
            sync_dependency_issues,
            sync_findings_to_issues,
        )
        from ..health.dependencies import check_dependencies, fetch_manifests

        findings_rows = [
            {
                "repo_id": repo_id,
                "severity": "medium",
                "type": "api_usage",
                "provider": d["api_name"],
                "file": d["file_path"],
                "line": d.get("line_number") or 0,
                "message": f"Detected usage in {d['file_path']}:{d.get('line_number') or '?'}",
                "current_usage": d.get("matched_snippet"),
                "recommended_fix": None,
                "confidence": 0.8,
                "status": "open",
                "tech": None,
            }
            for d in detections
        ]
        # Enrich with the rules engine (same pipeline the scanner runner uses) so
        # rule-matched breaking findings carry rule_id/change_type and become real
        # reliability_issues + alerts. Without this, Code Break Detection stays
        # permanently empty regardless of scan output.
        try:
            from ..engine.rules.matcher import enrich_findings
            findings_rows = enrich_findings(
                findings_rows, tree_paths=[e["path"] for e in tree]
            )
        except Exception as exc:
            logger.warning("rules enrichment skipped for repo=%s: %s", repo_id, exc)
        manifests = fetch_manifests(tree, token, full_name)
        if findings_rows:
            health_counts["issues_created"] = sync_findings_to_issues(repo_id, findings_rows)
        health_counts["scores_stored"] = compute_and_store_health(
            repo_id, findings_rows, manifests=manifests
        )
        # Outdated SDK versions from real manifests -> DEPENDENCY issues (SDK page).
        try:
            health_counts["dependency_issues"] = sync_dependency_issues(
                repo_id, check_dependencies(manifests or {})
            )
        except Exception as exc:
            logger.warning("dependency issue sync skipped for repo=%s: %s", repo_id, exc)

        # Real provider collectors (endpoints empirically verified):
        # - GitHub core rate-limit snapshot for this repo (uses winning token)
        # - active incidents for any detected statuspage-backed provider
        # Every collector runs isolated; a failure is logged, never fatal.
        from ..health.collectors import record_github_rate_limit
        from ..health.incidents import refresh_provider_incidents

        detected_provider_set = {d["api_name"] for d in detections}
        for prov in ("github", "stripe", "openai", "twilio", "sendgrid"):
            if prov not in detected_provider_set:
                continue
            try:
                health_counts[f"incidents_{prov}"] = refresh_provider_incidents(prov)
            except Exception:
                logger.warning("incident collector failed for %s (repo=%s)", prov, repo_id)
        try:
            record_github_rate_limit(repo_id, token)
            health_counts["rate_limit_recorded"] = 1
        except Exception:
            logger.warning("rate-limit collector failed for repo=%s", repo_id)
    except Exception as exc:
        logger.warning("[API HEALTH] health bridge failed for repo=%s: %s", repo_id, exc)

    # --- Detection confirmation email (once per repo, on first scan with detections) ---
    # Entirely best-effort: missing columns, mail failures, etc. must NEVER
    # fail a repository scan.
    if detections:
        try:
            repo_row = (
                db().table("repos").select("detection_email_sent, user_id")
                .eq("id", repo_id).limit(1).execute()
            )
            if repo_row.data and not repo_row.data[0].get("detection_email_sent"):
                # Build API → file count mapping
                api_file_counts: dict[str, int] = {}
                for d in detections:
                    api_file_counts[d["api_name"]] = api_file_counts.get(d["api_name"], 0) + 1
                # Get owner email
                owner_email_row = (
                    db().table("users").select("email")
                    .eq("id", repo_row.data[0]["user_id"]).limit(1).execute()
                )
                if owner_email_row.data and owner_email_row.data[0].get("email"):
                    try:
                        from ..email import send_detection_confirmation_email
                        send_detection_confirmation_email(
                            to_email=owner_email_row.data[0]["email"],
                            repo_name=full_name,
                            api_counts=api_file_counts,
                            user_id=repo_row.data[0]["user_id"],
                        )
                    except Exception:
                        pass  # Best-effort — never block the scan response
                # Mark as sent regardless of email success (avoid spamming on retry)
                db().table("repos").update({"detection_email_sent": True}).eq("id", repo_id).execute()
        except Exception as exc:
            logger.warning(
                "[API HEALTH] detection-confirmation email skipped for repo=%s: %s",
                repo_id, exc,
            )

    now = datetime.now(timezone.utc).isoformat()
    db().table("repos").update({"last_scanned_at": now}).eq("id", repo_id).execute()

    apis = sorted({d["api_name"] for d in detections})
    logger.info(
        "[API HEALTH] Scan completed for %s — files=%d detections=%d apis=%s",
        full_name, files_scanned, len(detections), ",".join(apis) or "none",
    )
    _record_scan_row(
        repo_id, "COMPLETED",
        started_at=scan_started_at,
        finished_at=now,
        stats={
            "files_scanned": files_scanned,
            "detections_found": len(detections),
            "apis_detected": apis,
            "plan_warning": plan_warning,
        },
    )
    return ScanResultOut(
        repo_id=repo_id,
        files_scanned=files_scanned,
        detections_found=len(detections),
        apis_detected=apis,
        last_scanned_at=now,
        plan_limit_exceeded=plan_limit_exceeded,
        plan_warning=plan_warning,
        new_apis_detected=new_apis_count,
        monitoring_limit=monitored_to_add if not plan_limit_exceeded else None,
    )


# ---------------------------------------------------------------------------
# Detections (dashboard footprint)
# ---------------------------------------------------------------------------
@router.get("/{repo_id}/detections", response_model=DetectionsOut)
def get_detections(repo_id: str, user_id: str = Depends(get_current_user_id)) -> DetectionsOut:
    repo = _owned_repo(user_id, repo_id)
    res = (
        db().table("api_detections").select("*").eq("repo_id", repo_id).order("api_name").execute()
    )
    rows = res.data or []

    grouped: dict[str, list[dict]] = {}
    for r in rows:
        grouped.setdefault(r["api_name"], []).append(r)

    footprint: list[ApiFootprintGroup] = []
    for api_name, items in grouped.items():
        footprint.append(
            ApiFootprintGroup(
                api_name=api_name,
                status=status_for_api(api_name),
                detection_count=len(items),
                file_count=len({i["file_path"] for i in items}),
                detections=[
                    DetectionOut(
                        id=i["id"],
                        api_name=i["api_name"],
                        file_path=i["file_path"],
                        line_number=i.get("line_number"),
                        matched_snippet=i.get("matched_snippet"),
                        detected_at=i.get("detected_at"),
                    )
                    for i in items
                ],
                category=get_provider_category(api_name),
            )
        )
    # Monitored providers first, then alphabetical.
    footprint.sort(key=lambda g: (g.status != "monitored", g.api_name))

    return DetectionsOut(repo=_repo_out(repo), footprint=footprint)


# ---------------------------------------------------------------------------
# Alert history (dashboard)
# ---------------------------------------------------------------------------
@router.get("/{repo_id}/alerts", response_model=list[AlertOut])
def get_alerts(repo_id: str, user_id: str = Depends(get_current_user_id)) -> list[AlertOut]:
    _owned_repo(user_id, repo_id)
    res = (
        db()
        .table("alerts")
        .select("*, changelog_events(*), api_detections(*)")
        .eq("repo_id", repo_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = res.data or []
    # Phase 5 §1: default sort by severity descending (critical first).
    rows.sort(key=severity_sort_key)
    out: list[AlertOut] = []
    for a in rows:
        ev = a.get("changelog_events") or {}
        det = a.get("api_detections") or {}
        out.append(
            AlertOut(
                id=a["id"],
                change_type=ev.get("change_type") or a.get("change_type") or "other",
                description=ev.get("description") or a.get("description") or a.get("severity_reason"),
                old_value=ev.get("old_value"),
                new_value=ev.get("new_value"),
                source_url=ev.get("source_url") or a.get("source_url"),
                file_path=det.get("file_path") or a.get("file_path"),
                line_number=det.get("line_number") or a.get("line_number"),
                email_sent=a.get("email_sent", False),
                sent_at=a.get("sent_at"),
                created_at=a.get("created_at"),
                severity=a.get("severity") or "medium",
                severity_reason=a.get("severity_reason"),
                provider=a.get("provider"),
                status=a.get("status"),
                is_test=a.get("is_test", False),
            )
        )
    return out


# ---------------------------------------------------------------------------
# Phase A: Simulate Breaking Change (works for any of 15 providers)
# ---------------------------------------------------------------------------
from pydantic import BaseModel

class SimulateRequest(BaseModel):
    api_name: str | None = None  # Optional: specific provider to simulate


@router.post("/{repo_id}/simulate-breaking-change", response_model=SimulateBreakingChangeOut)
def simulate_breaking_change(
    repo_id: str,
    body: SimulateRequest | None = None,
    user_id: str = Depends(get_current_user_id),
) -> SimulateBreakingChangeOut:
    """Simulate a mock breaking change against the repo's detected API
    footprint, create a TEST alert row, and send a test email.

    Phase A: works for any of the 15 providers with detections in this repo.
    All test notices keep the existing "TEST ALERT" badge.
    """
    repo = _owned_repo(user_id, repo_id)

    # Determine which provider to simulate
    requested_api = body.api_name if body else None

    # Find available providers with detections in this repo
    all_dets = (
        db()
        .table("api_detections")
        .select("api_name")
        .eq("repo_id", repo_id)
        .execute()
    ).data or []
    available_apis = list({d["api_name"] for d in all_dets})

    if not available_apis:
        return SimulateBreakingChangeOut(
            api_name=requested_api or "unknown",
            change_type="other",
            severity="low",
            severity_reason="No API detections in this repo yet.",
            matched_count=0,
            locations=[],
            alert_created=False,
            alert_id=None,
            email_sent=False,
            email_detail="No API detections found. Scan the repo first.",
            is_test=True,
        )

    # Pick the provider
    if requested_api and requested_api in available_apis:
        target_api = requested_api
    elif requested_api:
        # Requested provider not detected — use first available
        target_api = available_apis[0]
    else:
        # No preference — use first available
        target_api = available_apis[0]

    # Get mock event for this provider
    mock_event = get_mock_for_provider(target_api)
    event: dict = {
        **mock_event,
        "symbols": ",".join([
            target_api,
            *[w.lower() for w in (mock_event.get("old_value") or "").split() if len(w) > 2],
            *[w.lower() for w in (mock_event.get("new_value") or "").split() if len(w) > 2],
        ]),
    }

    # Query detections for this provider
    dets = (
        db()
        .table("api_detections")
        .select("*")
        .eq("repo_id", repo_id)
        .eq("api_name", target_api)
        .execute()
    ).data or []

    # Match against mock event tokens
    tokens = event_tokens(event)
    matches = [d for d in dets if detection_matches(d, tokens)]
    if not matches:
        # If token matching yields nothing, use all detections for this provider
        matches = dets
    matches.sort(key=lambda d: (d.get("file_path") or "", d.get("line_number") or 0))

    locations = [
        SimulatedAlertLocation(
            file_path=d.get("file_path") or "",
            line_number=d.get("line_number"),
            matched_snippet=d.get("matched_snippet"),
        )
        for d in matches
    ]

    severity, severity_reason = score_severity(
        event.get("change_type") or "other",
        [d.get("file_path") or "" for d in matches],
    )

    # No matches -> nothing to alert
    if not matches or not locations:
        return SimulateBreakingChangeOut(
            api_name=target_api,
            change_type=event["change_type"],
            old_value=event.get("old_value"),
            new_value=event.get("new_value"),
            severity=severity,
            severity_reason=severity_reason,
            matched_count=0,
            locations=[],
            alert_created=False,
            alert_id=None,
            email_sent=False,
            email_detail=f"No matching {target_api} footprint in this repo yet.",
            is_test=True,
        )

    # --- Insert a TEST alert row (is_test=True). ---
    alert_id: str | None = None
    alert_created = False
    try:
        ins = (
            db()
            .table("alerts")
            .insert({
                "repo_id": repo_id,
                "changelog_event_id": None,
                "api_detection_id": matches[0]["id"],
                "email_sent": False,
                "severity": severity,
                "severity_reason": severity_reason,
                "is_test": True,
                "provider": target_api,
                "status": "sent",
            })
            .execute()
        )
        row = (ins.data or [{}])[0]
        alert_id = row.get("id")
        alert_created = bool(alert_id)
    except Exception as exc:
        return SimulateBreakingChangeOut(
            api_name=target_api,
            change_type=event["change_type"],
            old_value=event.get("old_value"),
            new_value=event.get("new_value"),
            severity=severity,
            severity_reason=severity_reason,
            matched_count=len(matches),
            locations=locations,
            alert_created=False,
            alert_id=None,
            email_sent=False,
            email_detail=f"Alert row insert failed: {exc}",
            is_test=True,
        )

    # --- Send test email to repo owner (through the central email service so
    # it is logged to email_deliveries and never bypasses sender validation) ---
    owner = (
        db().table("users").select("email").eq("id", repo["user_id"]).limit(1).execute()
    )
    owner_email = (owner.data or [{}])[0].get("email")

    email_sent = False
    email_detail: str | None = None
    if owner_email:
        subject, html, text = render_alert_email(
            repo["full_name"], event, matches, severity=severity,
        )
        result = send_alert_email(
            user_id=repo["user_id"],
            recipient=owner_email,
            alert_type="breaking_changes",
            subject=subject,
            html=html,
            text=text,
            alert_id=alert_id,
            fingerprint=f"test:{target_api}:{event['change_type']}",
            context={"event_id": event.get("id"), "repo_id": repo.get("id")},
        )
        email_sent = bool(result.get("ok"))
        email_detail = (
            "Duplicate suppressed (same event already emailed recently)"
            if result.get("skipped_duplicate")
            else ("Test email delivered." if result.get("ok") else result.get("detail"))
        )
        if email_sent:
            sent_at = datetime.now(timezone.utc).isoformat()
            try:
                db().table("alerts").update(
                    {"email_sent": True, "sent_at": sent_at}
                ).eq("id", alert_id).execute()
            except Exception:
                pass
    else:
        email_detail = "Repo owner has no email on file; test email skipped."

    return SimulateBreakingChangeOut(
        api_name=target_api,
        change_type=event["change_type"],
        old_value=event.get("old_value"),
        new_value=event.get("new_value"),
        severity=severity,
        severity_reason=severity_reason,
        matched_count=len(matches),
        locations=locations,
        alert_created=alert_created,
        alert_id=alert_id,
        email_sent=email_sent,
        email_detail=email_detail,
        is_test=True,
    )


# ---------------------------------------------------------------------------
# Phase A: Provider Coverage + Scan Summary
# ---------------------------------------------------------------------------
@router.get("/{repo_id}/provider-coverage")
def get_provider_coverage(
    repo_id: str, user_id: str = Depends(get_current_user_id)
) -> list[dict]:
    """Return provider coverage status for all 15 Phase A providers."""
    _owned_repo(user_id, repo_id)

    # Get detected API names for this repo
    dets = (
        db()
        .table("api_detections")
        .select("api_name")
        .eq("repo_id", repo_id)
        .execute()
    ).data or []
    detected_apis = {d["api_name"] for d in dets}

    # Build coverage for all providers (Phase A-D registry).
    all_api_names = sorted(set(PLANNED_APIS) | MONITORED_APIS)
    coverage = []
    for api_name in all_api_names:
        monitored = api_name in MONITORED_APIS
        coverage.append({
            "provider": api_name,
            "displayName": api_name.replace("_", " ").title(),
            "category": get_provider_category(api_name),
            "detectionEnabled": True,
            "monitoringEnabled": monitored,
            "monitoringStatus": "supported" if monitored else "planned",
            "hasDetections": api_name in detected_apis,
        })
    return coverage


@router.get("/{repo_id}/scan-summary")
def get_scan_summary(
    repo_id: str, user_id: str = Depends(get_current_user_id)
) -> dict:
    """Return scan summary: providers detected, confidence, monitoring status."""
    _owned_repo(user_id, repo_id)

    dets = (
        db()
        .table("api_detections")
        .select("api_name")
        .eq("repo_id", repo_id)
        .execute()
    ).data or []

    detected_apis = {d["api_name"] for d in dets}
    total_detections = len(dets)

    # Count high-confidence (providers with 3+ detections are considered high-confidence)
    api_counts: dict[str, int] = {}
    for d in dets:
        api_counts[d["api_name"]] = api_counts.get(d["api_name"], 0) + 1
    high_confidence = sum(1 for count in api_counts.values() if count >= 3)

    return {
        "totalProvidersDetected": len(detected_apis),
        "highConfidenceProviders": high_confidence,
        "providersMonitored": len(detected_apis & MONITORED_APIS),
        "providersDetectedNotMonitored": len(detected_apis - MONITORED_APIS),
        "totalDetections": total_detections,
    }


@router.get("/{repo_id}/code-health")
def get_code_health(
    repo_id: str,
    status: str | None = Query(default=None, description="Filter by issue status"),
    user_id: str = Depends(get_current_user_id),
) -> list[dict]:
    """Return code-health issues for a repo."""
    _owned_repo(user_id, repo_id)

    query = (
        db().table("code_health_issues")
        .select("*")
        .eq("repo_id", repo_id)
        .order("detected_at", desc=True)
    )
    if status:
        query = query.eq("status", status)

    issues = query.execute().data or []
    return issues


@router.get("/{repo_id}/daily-scans")
def get_daily_scans(
    repo_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
) -> list[dict]:
    """Return recent daily scan runs for a repo."""
    _owned_repo(user_id, repo_id)

    runs = (
        db().table("daily_scan_runs")
        .select("*")
        .eq("repo_id", repo_id)
        .order("ran_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []
    return runs


# ---------------------------------------------------------------------------
# Phase 10 build-out: scans / findings / dashboard (real data)
# ---------------------------------------------------------------------------
from ..engine.scanner.runner import start_scan, run_scan  # noqa: E402
from ..schemas import (  # noqa: E402
    ScanOut,
    ScansListOut,
    FindingOut,
    FindingsListOut,
    FindingUpdateIn,
    DashboardStatsOut,
    RepoHealthOut,
)


def _scan_out(s: dict) -> ScanOut:
    return ScanOut(
        id=s["id"],
        repo_id=s["repo_id"],
        status=s.get("status", "QUEUED"),
        scan_type=s.get("scan_type", "full"),
        started_at=s.get("started_at"),
        finished_at=s.get("finished_at"),
        error_message=s.get("error_message"),
        stats=s.get("stats"),
        created_at=s.get("created_at"),
    )


def _record_scan_row(
    repo_id: str,
    status: str,
    started_at: str | None = None,
    finished_at: str | None = None,
    error_message: str | None = None,
    stats: dict | None = None,
) -> None:
    """Persist a scan-history row so GET /repos/{id}/scans shows real runs.

    Best-effort: history recording must never fail or slow the scan itself.
    """
    try:
        db().table("scans").insert(
            {
                "repo_id": repo_id,
                "status": status,
                "scan_type": "full",
                "started_at": started_at,
                "finished_at": finished_at,
                "error_message": error_message,
                "stats": stats or {},
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001 - history is best-effort
        logger.warning(
            "[API HEALTH] scan history insert failed for repo=%s: %s",
            repo_id,
            exc,
        )


@router.post("/{repo_id}/scans", response_model=ScanOut)
def start_repo_scan(repo_id: str, user_id: str = Depends(get_current_user_id)) -> ScanOut:
    """Queue a scan (QUEUED) and execute it in the background. Poll
    GET /repos/{id}/scans/{scan_id} for QUEUED->SCANNING->ANALYZING->COMPLETED."""
    repo = _owned_repo(user_id, repo_id)
    tokens = _repo_scan_tokens(repo, user_id)
    if not tokens:
        raise HTTPException(
            status_code=400,
            detail="No GitHub access token available for this repo. Reconnect GitHub to scan.",
        )
    token = tokens[0]
    scan_id = start_scan(
        repo_id,
        repo["full_name"],
        repo.get("default_branch", "main"),
        token,
    )
    row = fetch_one("scans", {"id": scan_id})
    return _scan_out(row)


@router.get("/{repo_id}/scans", response_model=ScansListOut)
def list_repo_scans(
    repo_id: str,
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
) -> ScansListOut:
    _owned_repo(user_id, repo_id)
    res = (
        db().table("scans").select("*").eq("repo_id", repo_id)
        .order("created_at", desc=True).limit(limit).execute()
    )
    return ScansListOut(scans=[_scan_out(s) for s in (res.data or [])])


@router.get("/{repo_id}/scans/{scan_id}", response_model=ScanOut)
def get_repo_scan(
    repo_id: str, scan_id: str, user_id: str = Depends(get_current_user_id)
) -> ScanOut:
    _owned_repo(user_id, repo_id)
    row = fetch_one("scans", {"id": scan_id, "repo_id": repo_id})
    if not row:
        raise HTTPException(status_code=404, detail="Scan not found")
    return _scan_out(row)


@router.get("/{repo_id}/findings", response_model=FindingsListOut)
def list_repo_findings(
    repo_id: str,
    severity: str | None = Query(None),
    type: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    user_id: str = Depends(get_current_user_id),
) -> FindingsListOut:
    _owned_repo(user_id, repo_id)
    query = db().table("findings").select("*").eq("repo_id", repo_id)
    if severity:
        query = query.eq("severity", severity)
    if type:
        query = query.eq("type", type)
    if status:
        query = query.eq("status", status)
    res = query.order("severity", desc=False).limit(limit).execute()
    return FindingsListOut(findings=[FindingOut(**f) for f in (res.data or [])])


def compare_scan_findings(before_rows: list[dict], after_rows: list[dict]) -> dict:
    """Delta between two scans' findings keyed by (file, line, message).

    Pure function (unit-testable). Returns added/removed/unchanged plus
    lifecycle counts derived only from the rows provided — never fabricates.
    """
    def _key(row: dict) -> tuple:
        return (row.get("file"), row.get("line"), row.get("message"))

    before = {_key(r): r for r in before_rows}
    after = {_key(r): r for r in after_rows}

    added = [dict(a) for k, a in after.items() if k not in before]
    removed = [dict(b) for k, b in before.items() if k not in after]
    unchanged = [dict(b) for k, b in before.items() if k in after]

    resolved_count = 0
    regressed_count = 0
    for k, b in before.items():
        a = after.get(k)
        if not a:
            continue
        b_open = b.get("status") in ("open", None)
        a_open = a.get("status") in ("open", None)
        if b_open and not a_open:
            resolved_count += 1
        elif not b_open and a_open:
            regressed_count += 1

    added_by_severity: dict[str, int] = {}
    for a in added:
        sev = a.get("severity") or "unknown"
        added_by_severity[sev] = added_by_severity.get(sev, 0) + 1

    return {
        "added": added,
        "removed": removed,
        "unchanged_count": len(unchanged),
        "added_count": len(added),
        "removed_count": len(removed),
        "resolved_count": resolved_count,
        "regressed_count": regressed_count,
        "added_by_severity": added_by_severity,
    }


@router.get("/{repo_id}/scan-comparison")
def scan_comparison(
    repo_id: str,
    before_scan_id: str | None = Query(None),
    after_scan_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Compare findings between two scans of the same repo.

    Defaults: after = latest COMPLETED scan; before = the scan before it (or an
    empty baseline when only one scan exists). Never invents rows — the delta
    is computed only from the repo's own findings rows.
    """
    _owned_repo(user_id, repo_id)

    scans = (
        db().table("scans").select("id, status, started_at")
        .eq("repo_id", repo_id)
        .eq("status", "COMPLETED")
        .order("started_at", desc=True)
        .limit(20)
        .execute()
    ).data or []

    if not scans:
        return {
            "repo_id": repo_id,
            "before_scan_id": None,
            "after_scan_id": None,
            "added": [], "removed": [],
            "unchanged_count": 0, "added_count": 0, "removed_count": 0,
            "resolved_count": 0, "regressed_count": 0,
            "added_by_severity": {},
            "message": "No completed scans yet — nothing to compare.",
        }

    after_row = next((s for s in scans if s["id"] == after_scan_id), scans[0]) if after_scan_id else scans[0]
    before_row = None
    if before_scan_id:
        before_row = next((s for s in scans if s["id"] == before_scan_id), None)
    else:
        # scan immediately after `after` in history (i.e. the previous scan)
        idx = next((i for i, s in enumerate(scans) if s["id"] == after_row["id"]), 0)
        before_row = scans[idx + 1] if idx + 1 < len(scans) else None

    def _findings(scan_id: str | None) -> list[dict]:
        if not scan_id:
            return []
        return (
            db().table("findings").select("*").eq("repo_id", repo_id).eq("scan_id", scan_id)
            .execute()
        ).data or []

    after_rows = _findings(after_row["id"])
    before_rows = _findings(before_row["id"]) if before_row else []

    delta = compare_scan_findings(before_rows, after_rows)
    return {
        "repo_id": repo_id,
        "before_scan_id": before_row["id"] if before_row else None,
        "after_scan_id": after_row["id"],
        **delta,
    }


_VERIFICATION_STATUSES = {"detected", "potential", "verified", "false_positive", "unknown", "resolved"}
_WORKFLOW_STATUSES = {"open", "fixed", "dismissed"}


def _resolve_finding_status(workflow: str | None, verification: str | None) -> tuple[str, str | None]:
    """Map the verification taxonomy onto the legacy workflow status + keep both.

    Returns (status, verification_status). Conservative mapping:
      - verification 'verified'  -> status stays open (user confirms manually)
      - verification 'resolved'  -> status 'fixed'
      - verification 'false_positive' / 'unknown' -> status 'dismissed'
    """
    vstatus = verification.strip().lower() if verification else None
    if vstatus is not None and vstatus not in _VERIFICATION_STATUSES:
        raise ValueError(f"verification_status must be one of {sorted(_VERIFICATION_STATUSES)}")
    status = workflow
    if status is not None and status not in _WORKFLOW_STATUSES:
        raise ValueError(f"status must be one of {sorted(_WORKFLOW_STATUSES)}")
    if vstatus == "resolved":
        status = "fixed"
    elif vstatus == "false_positive":
        status = "dismissed"
    elif vstatus == "unknown":
        # "unknown" is deliberately non-destructive: we cannot tell either way,
        # so we never auto-dismiss an open finding on uncertainty alone.
        status = status or "open"
    return status, vstatus


@router.patch("/findings/{finding_id}", response_model=FindingOut)
def update_finding(
    finding_id: str,
    body: FindingUpdateIn,
    user_id: str = Depends(get_current_user_id),
) -> FindingOut:
    """Set finding workflow status (open | fixed | dismissed) and/or the
    verification taxonomy (detected | potential | verified | false_positive |
    unknown | resolved). Verification values map conservatively onto the
    workflow status; both are persisted so no existing UI breaks."""
    row = fetch_one("findings", {"id": finding_id})
    if not row:
        raise HTTPException(status_code=404, detail="Finding not found")
    repo = fetch_one("repos", {"id": row["repo_id"]})
    if not repo or repo["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Finding not found")

    try:
        status, vstatus = _resolve_finding_status(body.status, body.verification_status)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if status is not None:
        updates["status"] = status
    if vstatus is not None:
        updates["verification_status"] = vstatus
    if body.evidence_url is not None:
        updates["evidence_url"] = body.evidence_url

    db().table("findings").update(updates).eq("id", finding_id).execute()
    updated = fetch_one("findings", {"id": finding_id})
    return FindingOut(**updated)


@router.get("/dashboard/stats", response_model=DashboardStatsOut)
def dashboard_stats(user_id: str = Depends(get_current_user_id)) -> DashboardStatsOut:
    """Real stats from the DB — no fake numbers."""
    repos_res = db().table("repos").select("id").eq("user_id", user_id).execute()
    repo_ids = [r["id"] for r in (repos_res.data or [])]
    if not repo_ids:
        return DashboardStatsOut(monitored_api_count=len(MONITORED_APIS))

    scans = (
        db().table("scans").select("status, started_at, stats").in_("repo_id", repo_ids).execute()
    ).data or []
    findings = (
        db().table("findings").select("severity, status").in_("repo_id", repo_ids).execute()
    ).data or []
    fixes = (
        db().table("fixes").select("status").in_("repo_id", repo_ids).execute()
    ).data or []
    prs = (
        db().table("pull_requests").select("id").in_("repo_id", repo_ids).execute()
    ).data or []
    alerts = (
        db().table("alerts").select("status").in_("repo_id", repo_ids).execute()
    ).data or []
    dets = (
        db().table("api_detections").select("api_name").in_("repo_id", repo_ids).execute()
    ).data or []

    by_sev: dict[str, int] = {}
    for f in findings:
        by_sev[f["severity"]] = by_sev.get(f["severity"], 0) + 1

    last_scan = None
    for s in scans:
        started = s.get("started_at")
        if started and (last_scan is None or started > last_scan):
            last_scan = started

    return DashboardStatsOut(
        repos=len(repo_ids),
        scans_total=len(scans),
        scans_completed=sum(1 for s in scans if s.get("status") == "COMPLETED"),
        findings_by_severity=by_sev,
        findings_total=len(findings),
        findings_open=sum(1 for f in findings if f.get("status") == "open"),
        fixes_created=len(fixes),
        prs_created=len(prs),
        alerts_pending=sum(1 for a in alerts if a.get("status") in ("pending", "sent")),
        providers_monitored=len({d["api_name"] for d in dets}),
        providers_planned=0,
        monitored_api_count=len(MONITORED_APIS),
        last_scan_at=last_scan,
    )


@router.get("/{repo_id}/health", response_model=RepoHealthOut)
def repo_health(repo_id: str, user_id: str = Depends(get_current_user_id)) -> RepoHealthOut:
    repo = _owned_repo(user_id, repo_id)
    scans = (db().table("scans").select("status").eq("repo_id", repo_id).execute()).data or []
    findings = (
        db().table("findings").select("severity, status").eq("repo_id", repo_id).execute()
    ).data or []
    fixes = (db().table("fixes").select("id").eq("repo_id", repo_id).execute()).data or []
    prs = (db().table("pull_requests").select("id").eq("repo_id", repo_id).execute()).data or []

    SEV_WEIGHTS = {"critical": 40, "high": 15, "medium": 5, "low": 1, "info": 0}
    by_sev: dict[str, int] = {}
    penalty = 0
    for f in findings:
        sev = f["severity"]
        by_sev[sev] = by_sev.get(sev, 0) + 1
        if f.get("status") == "open":
            penalty += SEV_WEIGHTS.get(sev, 0)
    open_findings = sum(1 for f in findings if f.get("status") == "open")
    health = max(0, min(100, 100 - penalty))

    last_scan_at = None
    scan_rows = (db().table("scans").select("started_at").eq("repo_id", repo_id)
                 .eq("status", "COMPLETED").order("finished_at", desc=True).limit(1).execute()).data or []
    if scan_rows:
        last_scan_at = scan_rows[0].get("started_at")

    return RepoHealthOut(
        repo_id=repo_id,
        full_name=repo["full_name"],
        default_branch=repo.get("default_branch", "main"),
        last_scan_at=last_scan_at,
        scan_count=len(scans),
        findings_total=len(findings),
        findings_open=open_findings,
        findings_by_severity=by_sev,
        fixes_created=len(fixes),
        prs_created=len(prs),
        health_score=health,
    )
