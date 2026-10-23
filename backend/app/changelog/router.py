"""Cron endpoint for changelog monitoring (Phase B).

Called by Vercel Cron to fetch changelogs from all providers,
store new events, and process alerts. Also handles daily
code-health scans and email notifications.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from ..config import settings
from ..cronlog import run_cron
from ..db import db, fetch_one
from ..alerts import process_new_events, send_approved_alerts
from ..deps import get_current_user_id, require_internal_secret
from .scheduler import fetch_all_providers, log_health, run_daily_scans, run_impact_analysis_for_recent_events
from .admin import get_pending_alerts, approve_alert, disable_alert, is_admin
from .classify import CHANGE_TYPES, SEVERITIES, CONFIDENCES
from .sources import ALL_PROVIDER_IDS, PROVIDER_SOURCES_BY_ID, STATUS_SOURCE_UNAVAILABLE

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/internal/changelog/fetch")
async def fetch_changelogs(
    _guard: None = Depends(require_internal_secret),
) -> dict:
    """Fetch changelogs from all Phase B providers.
    
    Called by Vercel Cron or manually. Requires internal secret.
    """
    start = time.time()

    def _run() -> dict:
        results = fetch_all_providers(settings.scraper_user_agent)
        total_fetched = sum(r["fetched"] for r in results.values())
        total_stored = sum(r["stored"] for r in results.values())
        total_errors = sum(r["errors"] for r in results.values())
        return {
            "status": "ok",
            "providers": results,
            "summary": {
                "total_fetched": total_fetched,
                "total_stored": total_stored,
                "total_errors": total_errors,
            },
        }

    return run_cron("changelog_fetch", _run)


@router.post("/internal/changelog/process")
async def process_alerts(
    _guard: None = Depends(require_internal_secret),
) -> dict:
    """Process changelog events and create alerts.
    
    Called by Vercel Cron after fetch_changelogs.
    """
    def _run() -> dict:
        counts = process_new_events()
        flush = send_approved_alerts()
        return {"status": "ok", "counts": counts, "approved_flush": flush}

    return run_cron("changelog_process", _run)


@router.post("/internal/daily-scan")
async def daily_scan(
    _guard: None = Depends(require_internal_secret),
) -> dict:
    """Run daily scans for all monitored repos.
    
    Checks for breaking changelog changes and code-health issues.
    Sends exactly one email per repo/day.
    Called by Vercel Cron daily. Requires internal secret.
    """
    def _run() -> dict:
        run_daily_scans()
        run_impact_analysis_for_recent_events()
        return {"status": "ok", "message": "Daily scans + impact analysis completed"}

    return run_cron("daily_scan", _run)


@router.get("/internal/changelog/health")
async def health_check(_guard: None = Depends(require_internal_secret)) -> dict:
    """Health check for changelog monitoring. Requires internal secret.

    Safely reports DB connectivity + a per-provider status summary without
    leaking exception internals.
    """
    try:
        db().table("changelog_events").select("id").limit(1).execute()
        status_rows = (
            db().table("provider_monitoring_status")
            .select("provider_id, status, last_fetch_at, last_success_at, last_error, consecutive_errors")
            .execute()
        ).data or []
        # Aggregate severity counts across the matrix.
        by_status: dict[str, int] = {}
        error_providers: list[str] = []
        for r in status_rows:
            st = r.get("status") or "LIMITED"
            by_status[st] = by_status.get(st, 0) + 1
            if st == "ERROR" and r.get("provider_id"):
                error_providers.append(r["provider_id"])
        return {
            "status": "ok",
            "database": "connected",
            "providers_total": len(status_rows),
            "providers_by_status": by_status,
            "error_providers": error_providers[:20],
        }
    except Exception:
        # Log server-side only; never echo the exception to the client.
        import logging
        logging.getLogger("changelog").exception("changelog health check failed")
        return {"status": "error", "database": "unavailable"}


# ---------------------------------------------------------------------------
# Admin approval queue (beta safety net — owner-only)
# ---------------------------------------------------------------------------
@router.get("/internal/changelog/admin/pending")
async def admin_pending(user_id: str = Depends(get_current_user_id)) -> dict:
    """List changelog events pending admin approval (owner-only)."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return {"events": get_pending_alerts()}


@router.post("/internal/changelog/admin/approve/{event_id}")
async def admin_approve(event_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    """Approve an event for email sending, then flush approved emails (owner-only)."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    ok = approve_alert(event_id, user_id)
    flush = send_approved_alerts() if ok else {}
    return {"approved": ok, "flush": flush}


@router.post("/internal/changelog/admin/disable/{event_id}")
async def admin_disable(
    event_id: str,
    reason: str | None = None,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Disable an event (won't send emails). Owner-only."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    ok = disable_alert(event_id, user_id, reason)
    return {"disabled": ok}


@router.get("/internal/changelog/notices")
async def changelog_notices(
    repository_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Dashboard view: notices surfaced for one repo (when repository_id is
    provided and owned) or for all repos owned by the user."""
    if repository_id:
        repo = fetch_one("repos", {"id": repository_id})
        if not repo or repo["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Repo not found")
        repo_ids = [repository_id]
    else:
        repos = (
            db().table("repos").select("id").eq("user_id", user_id).execute()
        ).data or []
        repo_ids = [r["id"] for r in repos]
    if not repo_ids:
        return {"notices": []}

    notices = (
        db().table("alerts")
        .select("*, changelog_events(*)")
        .in_("repo_id", repo_ids)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    ).data or []
    return {"notices": notices}


# ---------------------------------------------------------------------------
# Provider Changes: events list, detail, matrix, review/dismiss
# ---------------------------------------------------------------------------
@router.get("/internal/changelog/events")
async def changelog_events(
    provider: str | None = None,
    change_type: str | None = None,
    severity: str | None = None,
    confidence: str | None = None,
    review_state: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """List changelog events across ALL 44 providers (independent of repo selection).

    Provider filter is optional; when omitted ALL 44 are included (providers
    with zero events appear in the monitoring matrix endpoint, not here).
    """
    q = db().table("changelog_events").select("*").order("detected_at", desc=True)
    if provider:
        q = q.eq("api_name", provider)
    if change_type:
        q = q.eq("change_type", change_type)
    if severity:
        q = q.eq("severity", severity)
    if confidence:
        q = q.eq("confidence", confidence)
    if review_state:
        q = q.eq("review_state", review_state)
    else:
        q = q.neq("review_state", "dismissed")
    q = q.range(offset, offset + max(min(limit, 100), 1) - 1)
    rows = q.execute().data or []
    return {"events": rows, "total_hint": len(rows) == limit + 1}


@router.get("/internal/changelog/events/{event_id}")
async def changelog_event_detail(
    event_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Detail view for a single changelog event (evidence, source, impact)."""
    row = (
        db().table("changelog_events")
        .select("*")
        .eq("id", event_id)
        .limit(1)
        .execute()
    ).data
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    event = row[0]
    # Related alerts (for the user's repos)
    repo_ids = [r["id"] for r in (db().table("repos").select("id").eq("user_id", user_id).execute().data or [])]
    alerts_for_event = (
        db().table("alerts")
        .select("*")
        .eq("changelog_event_id", event_id)
        .in_("repo_id", repo_ids)
        .execute()
    ).data if repo_ids else []
    return {"event": event, "alerts": alerts_for_event}


@router.get("/internal/changelog/monitoring")
async def monitoring_matrix(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """44-provider monitoring status matrix (independent of repo)."""
    rows = (
        db().table("provider_monitoring_status")
        .select("*")
        .order("provider_id")
        .execute()
    ).data or []
    # Merge with registry for display_name / category if any rows missing
    seen = {r["provider_id"] for r in rows}
    for pid in ALL_PROVIDER_IDS:
        if pid not in seen:
            src = PROVIDER_SOURCES_BY_ID.get(pid)
            rows.append({
                "provider_id": pid,
                "display_name": src.display_name if src else pid,
                # This row has never been fetched, so show only the source's
                # configured capability.  Never overwrite persisted outcomes.
                "status": src.default_status if src else STATUS_SOURCE_UNAVAILABLE,
                "source_kind": src.source_kind if src else "UNKNOWN",
                "source_url": src.changelog_url if src else "",
            })
    return {"providers": rows}


@router.post("/internal/changelog/events/{event_id}/review")
async def review_event(
    event_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Mark an event as reviewed (global state: admin-only)."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = db().table("changelog_events").update({"review_state": "reviewed"}).eq("id", event_id).execute()
    return {"updated": bool(res.data)}


@router.post("/internal/changelog/events/{event_id}/dismiss")
async def dismiss_event(
    event_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Dismiss an event (global state: admin-only)."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = db().table("changelog_events").update({"review_state": "dismissed"}).eq("id", event_id).execute()
    return {"updated": bool(res.data)}
