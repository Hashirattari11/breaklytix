"""Internal Admin Panel - admin-only endpoints under /admin/*.

Every route in this module is guarded server-side by ``require_admin`` which
verifies ``users.is_admin = true`` in the database. Non-admins receive 403.
The UI hiding of admin links is purely cosmetic; this layer is the authoritative
gate and must never be bypassed.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..alerts import render_alert_email
from ..db import db, fetch_one
from ..deps import require_admin
from ..email_service import send_alert_email
from ..config import settings
from ..signatures import MONITORED_APIS, PLANNED_APIS

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class UserStatusUpdate(BaseModel):
    suspended: bool
    reason: str | None = Field(default=None, max_length=500)


class UserPlanUpdate(BaseModel):
    plan: str = Field(min_length=1, max_length=40)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _count(table: str) -> int:
    """Row count without loading full rows (uses PostgREST exact count)."""
    try:
        res = db().table(table).select("id", count="exact").execute()
        return res.count if res.count is not None else len(res.data or [])
    except Exception:
        try:
            return len(db().table(table).select("id").execute().data or [])
        except Exception:
            return 0


def _count_where(table: str, **filters: Any) -> int:
    """Filtered exact count — counts server-side instead of scanning rows."""
    try:
        q = db().table(table).select("id", count="exact")
        for col, val in filters.items():
            q = q.eq(col, val)
        res = q.execute()
        return res.count if res.count is not None else 0
    except Exception:
        return 0


def _count_json_field(table: str, event: str, key: str, value: str) -> int:
    """Count events rows where a JSONB ``props`` field equals a string value."""
    try:
        res = (
            db()
            .table(table)
            .select("id", count="exact")
            .eq("event", event)
            .eq(f"props->>{key}", value)
            .execute()
        )
        if res.count is not None:
            return res.count
    except Exception:
        pass
    # Fallback: bounded scan of stored props for platforms we report on.
    try:
        rows = (
            db()
            .table(table)
            .select("props")
            .eq("event", event)
            .limit(5000)
            .execute()
            .data
            or []
        )
        needle = str(value).lower()
        return sum(
            1
            for row in rows
            if isinstance(row, dict)
            and str((row.get("props") or {}).get(key) or "").lower() == needle
        )
    except Exception:
        return 0


def _in_chunks(items: list[str], size: int = 100) -> list[list[str]]:
    """Split an id list so PostgREST `in_(...)` filter URLs stay bounded."""
    return [items[i : i + size] for i in range(0, len(items), size)]


# ---------------------------------------------------------------------------
# Pre-migration schema handling: the admin columns/tables exist only after
# db/migration_admin_columns.sql is applied. A select naming a missing column
# makes PostgREST reject the WHOLE query (PGRST204) which used to surface as
# an unhandled 500 "Internal server error" on the Admin Panel. These helpers
# detect exactly that condition so routes can degrade with a clear message —
# every OTHER failure still propagates (never masked).
# ---------------------------------------------------------------------------
_MIGRATION_HINT = (
    "Database migration pending: run db/migration_admin_columns.sql in the "
    "Supabase SQL editor to enable full admin features (admin flags, "
    "suspension, system health)."
)


def _is_schema_mismatch(exc: Exception) -> bool:
    """True when the failure is a missing column/table (pre-migration DB)."""
    code = str(getattr(exc, "code", "") or "")
    if code in {"PGRST204", "PGRST205", "42703", "42P01"}:
        return True
    msg = str(exc).lower()
    if "could not find the" in msg and ("column" in msg or "table" in msg):
        return True
    return "relation" in msg and "does not exist" in msg


_ADMIN_USER_COLUMNS = (
    "id,email,github_login,plan,is_admin,is_agency,created_at,"
    "is_suspended,suspended_at,suspended_reason"
)
_ADMIN_USER_BASE_COLUMNS = "id,email,github_login,plan,created_at"


def _fetch_admin_users(limit: int) -> tuple[list[dict], bool]:
    """Fetch the admin user list, degrading gracefully on a pre-migration DB.

    PostgREST rejects the whole select when ANY requested column is missing.
    Instead of crashing the panel with a 500, retry with the base columns that
    always exist, default the admin/suspension fields, and mark the response
    ``schema_degraded`` so the UI can explain what is missing. Other failures
    are NOT masked: they surface as a clear 503, never as fake data.
    """
    try:
        rows = (
            db()
            .table("users")
            .select(_ADMIN_USER_COLUMNS)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return rows.data or [], False
    except Exception as exc:
        if not _is_schema_mismatch(exc):
            raise
    try:
        rows = (
            db()
            .table("users")
            .select(_ADMIN_USER_BASE_COLUMNS)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"User list unavailable: {exc}")
    users = rows.data or []
    for u in users:
        u.setdefault("is_admin", False)
        u.setdefault("is_agency", False)
        u.setdefault("is_suspended", False)
        u.setdefault("suspended_at", None)
        u.setdefault("suspended_reason", None)
    return users, True


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------
@router.get("/overview")
def admin_overview() -> dict:
    # Server-side exact counts (no full-table scans — the alerts table can
    # grow without bound, so counting rows in Python was O(table)).
    return {
        "total_users": _count("users"),
        "total_repos": _count("repos"),
        "alerts_sent": _count_where("alerts", status="sent", is_test=False),
        "alerts_pending": _count_where("alerts", status="pending"),
        "alerts_dismissed": _count_where("alerts", status="dismissed"),
        "test_alerts_sent": _count_where("alerts", status="sent", is_test=True),
        "providers_monitored": len(MONITORED_APIS),
        "providers_planned": len(PLANNED_APIS),
    }


@router.get("/funnel")
def admin_funnel() -> dict:
    """Instant Repo Scan funnel: event counts + conversion rates.

    Admin-only (the router-level ``require_admin`` dependency applies). Counts
    are all-time and come from the first-party ``instant_scan_events`` table.
    """
    counts = {
        "scan_started": _count_where("instant_scan_events", event="scan_started"),
        "scan_completed": _count_where("instant_scan_events", event="scan_completed"),
        "email_captured": _count_where("instant_scan_events", event="email_captured"),
        "share_clicked": _count_where("instant_scan_events", event="share_clicked"),
        "badge_copied": _count_where("instant_scan_events", event="badge_copied"),
        "email_submitted": _count_where("instant_scan_events", event="email_submitted"),
        "github_signup_clicked": _count_where("instant_scan_events", event="github_signup_clicked"),
        "github_signup_completed": _count_where("instant_scan_events", event="github_signup_completed"),
    }

    def rate(numerator: int, denominator: int) -> float:
        if denominator <= 0:
            return 0.0
        return round((numerator / denominator) * 100, 1)

    return {
        "counts": counts,
        "conversion_rates": {
            "started_to_completed": rate(counts["scan_completed"], counts["scan_started"]),
            "completed_to_email": rate(counts["email_captured"], counts["scan_completed"]),
            "completed_to_share": rate(counts["share_clicked"], counts["scan_completed"]),
            "completed_to_badge": rate(counts["badge_copied"], counts["scan_completed"]),
        },
        "total_scans": _count("instant_scans"),
        "total_leads": _count_where("leads", source="instant_scan"),
        "cached_results_served": max(
            0, counts["scan_started"] - counts["scan_completed"]
        ),
        "share_breakdown": {
            "by_platform": {
                "x": _count_json_field("instant_scan_events", "share_clicked", "platform", "x"),
                "linkedin": _count_json_field("instant_scan_events", "share_clicked", "platform", "linkedin"),
                "copy": _count_json_field("instant_scan_events", "share_clicked", "platform", "copy"),
            },
            "with_risks": _count_json_field("instant_scan_events", "share_clicked", "has_risks", "true"),
            "without_risks": _count_json_field("instant_scan_events", "share_clicked", "has_risks", "false"),
        },
    }


# ---------------------------------------------------------------------------
# Pending alert approval queue (real, non-test alerts awaiting approval)
# ---------------------------------------------------------------------------
@router.get("/alerts/pending")
def pending_alerts(limit: int = 100) -> dict:
    rows = (
        db()
        .table("alerts")
        .select("*, changelog_events(*), api_detections(*), repos(*)")
        .eq("status", "pending")
        .neq("is_test", True)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    alerts = []
    rows_data = rows.data or []
    # Resolve owner emails in ONE batched query instead of one query per alert.
    owner_ids = sorted({
        (a.get("repos") or {}).get("user_id")
        for a in rows_data
        if (a.get("repos") or {}).get("user_id")
    })
    emails_by_user: dict[str, str] = {}
    for chunk in _in_chunks(owner_ids):
        for u in (
            db().table("users").select("id,email").in_("id", chunk).execute().data or []
        ):
            if u.get("id"):
                emails_by_user[u["id"]] = u.get("email")
    for a in rows_data:
        event = a.get("changelog_events") or {}
        detections = a.get("api_detections") or {}
        repo = a.get("repos") or {}
        # Resolve the owning user email (repo.user_id -> users.email)
        customer_email = emails_by_user.get(repo.get("user_id"))

        alert_id = a.get("id")
        subject = None
        preview = None
        ev = dict(event) if event else {}
        # Re-render the email preview using the stored event/detection data.
        try:
            if ev and repo.get("full_name"):
                dets = [dict(detections)] if detections else []
                subject, _html, text = render_alert_email(
                    repo.get("full_name", "repo"),
                    ev,
                    dets,
                    severity=a.get("severity", "medium"),
                    confidence=a.get("confidence", "medium"),
                )
                preview = (text or "")[:300]
        except Exception:
            pass

        alerts.append({
            "id": alert_id,
            "repo_id": repo.get("id"),
            "repo_name": repo.get("full_name"),
            "provider": event.get("api_name") or a.get("provider"),
            "api_name": event.get("api_name"),
            "customer_email": customer_email,
            "confidence": a.get("confidence"),
            "severity": a.get("severity"),
            "severity_reason": a.get("severity_reason"),
            "evidence": detections.get("matched_snippet") or detections.get("file_path"),
            "subject": subject,
            "preview": preview,
            "created_at": a.get("created_at"),
        })
    return {"alerts": alerts}


# ---------------------------------------------------------------------------
# Approve / Reject
# ---------------------------------------------------------------------------
def _load_alert(alert_id: str) -> dict:
    res = (
        db()
        .table("alerts")
        .select("*, changelog_events(*), api_detections(*), repos(*)")
        .eq("id", alert_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return res.data[0]


@router.post("/alerts/{alert_id}/approve")
def approve_alert(alert_id: str) -> dict:
    a = _load_alert(alert_id)
    event = a.get("changelog_events") or {}
    repo = a.get("repos") or {}
    dets = [dict(a.get("api_detections") or {})] if a.get("api_detections") else []

    email_sent = False
    owner_id = repo.get("user_id")
    if owner_id:
        u = fetch_one("users", {"id": owner_id})
        owner_email = (u or {}).get("email")
        if owner_email and repo.get("full_name"):
            try:
                subject, html, text = render_alert_email(
                    repo["full_name"], dict(event), dets,
                    severity=a.get("severity", "medium"),
                    confidence=a.get("confidence", "medium"),
                )
                # Through the central email service: respects preferences,
                # dedups and logs to email_deliveries.
                result = send_alert_email(
                    user_id=owner_id,
                    recipient=owner_email,
                    alert_type="breaking_changes",
                    subject=subject,
                    html=html,
                    text=text,
                    alert_id=alert_id,
                    fingerprint=f"approve:{alert_id}",
                    context={"event_id": event.get("id")},
                )
                email_sent = bool(result.get("ok"))
            except Exception:
                email_sent = False

    now = _now_iso()
    upd: dict[str, Any] = {"status": "sent", "email_sent": True, "sent_at": now}
    if email_sent is False:
        # Still mark as sent (approved) but record that email delivery failed.
        upd["status"] = "sent"
        upd["email_sent"] = False
    db().table("alerts").update(upd).eq("id", alert_id).execute()
    return {"ok": True, "email_sent": email_sent, "alert_id": alert_id}


@router.post("/alerts/{alert_id}/reject")
def reject_alert(alert_id: str) -> dict:
    a = _load_alert(alert_id)
    db().table("alerts").update({"status": "dismissed"}).eq("id", a["id"]).execute()
    return {"ok": True, "alert_id": a["id"], "status": "dismissed"}


# ---------------------------------------------------------------------------
# System health
# ---------------------------------------------------------------------------
@router.get("/health")
def system_health() -> dict:
    try:
        rows = (
            db()
            .table("system_health")
            .select("*")
            .order("ran_at", desc=True)
            .limit(100)
            .execute()
        )
    except Exception as exc:
        if _is_schema_mismatch(exc):
            # Table only exists after db/migration_admin_columns.sql — explain
            # instead of a bare 500.
            raise HTTPException(status_code=503, detail=_MIGRATION_HINT)
        raise
    return {"rows": rows.data or []}


# ---------------------------------------------------------------------------
# Users and repository management
# ---------------------------------------------------------------------------
@router.get("/users")
def admin_users(
    limit: int = Query(200, ge=1, le=500),
    search: str | None = Query(None, max_length=120),
    status: str | None = Query(None, pattern="^(active|suspended)$"),
) -> dict:
    users, schema_degraded = _fetch_admin_users(limit)
    needle = (search or "").strip().lower()
    if needle:
        users = [u for u in users if needle in str(u.get("email") or "").lower() or needle in str(u.get("github_login") or "").lower()]
    if status:
        users = [u for u in users if ("suspended" if u.get("is_suspended") else "active") == status]

    user_ids = [u.get("id") for u in users if u.get("id")]
    repos_by_user: dict[str, list[dict]] = {uid: [] for uid in user_ids}
    if user_ids:
        # Fetch ONLY repos belonging to the returned users, in bounded chunks.
        # (The previous unbounded full-table scan of `repos` made this endpoint
        # slower and heavier as the platform grows.)
        for chunk in _in_chunks(user_ids):
            repos = (
                db()
                .table("repos")
                .select("id,user_id,full_name,default_branch,connected_at,last_scanned_at")
                .in_("user_id", chunk)
                .execute()
                .data
                or []
            )
            for repo in repos:
                owner = repo.get("user_id")
                if owner in repos_by_user:
                    repos_by_user[owner].append(repo)
    for user in users:
        user["repositories"] = repos_by_user.get(user.get("id"), [])
        user["repository_count"] = len(user["repositories"])
    response: dict[str, Any] = {"users": users, "schema_degraded": schema_degraded}
    if schema_degraded:
        response["degraded_reason"] = _MIGRATION_HINT
    return response


@router.patch("/users/{user_id}/status")
def update_user_status(user_id: str, body: UserStatusUpdate, admin: dict = Depends(require_admin)) -> dict:
    if user_id == admin.get("id") and body.suspended:
        raise HTTPException(status_code=400, detail="You cannot suspend your own admin account")
    payload: dict[str, Any] = {
        "is_suspended": body.suspended,
        "suspended_at": _now_iso() if body.suspended else None,
        "suspended_reason": body.reason.strip() if body.suspended and body.reason else None,
    }
    try:
        result = db().table("users").update(payload).eq("id", user_id).execute()
    except Exception as exc:
        if _is_schema_mismatch(exc):
            # Suspension columns only exist after the migration — a clear 503
            # beats an unhandled 500 crash here too.
            raise HTTPException(status_code=503, detail=_MIGRATION_HINT)
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user": result.data[0]}


@router.patch("/users/{user_id}/plan")
def update_user_plan(user_id: str, body: UserPlanUpdate) -> dict:
    allowed = {"free", "pro", "agency", "enterprise"}
    if body.plan.lower() not in allowed:
        raise HTTPException(status_code=422, detail=f"plan must be one of: {', '.join(sorted(allowed))}")
    result = db().table("users").update({"plan": body.plan.lower()}).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user": result.data[0]}


@router.delete("/repos/{repo_id}", status_code=204)
def disconnect_repository(repo_id: str):
    result = db().table("repos").delete().eq("id", repo_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Repository not found")


# ---------------------------------------------------------------------------
# Subscriptions & billing
# ---------------------------------------------------------------------------
@router.get("/subscriptions")
def admin_subscriptions() -> dict:
    plans = ["free", "pro", "agency", "enterprise", "trial", "starter", "growth"]
    by_plan = {p: _count_where("users", plan=p) for p in plans}
    # Only include plans that actually have users.
    by_plan = {k: v for k, v in by_plan.items() if v > 0}
    total_users = _count("users")
    free_users = by_plan.get("free", 0) + by_plan.get("trial", 0) + by_plan.get("starter", 0)
    paid_users = total_users - free_users
    return {
        "total_users": total_users,
        "free_users": free_users,
        "paid_users": paid_users,
        "by_plan": by_plan,
        "active_subscriptions": paid_users,
        "cancelled_subscriptions": 0,
        "expired_subscriptions": 0,
        "mrr": None,
        "mrr_note": "Billing provider (Paddle) keys are not configured in production; MRR is not tracked yet.",
        "payment_history": [],
        "failed_payments": [],
        "refunds": [],
    }


# ---------------------------------------------------------------------------
# API monitoring
# ---------------------------------------------------------------------------
@router.get("/api-monitoring")
def admin_api_monitoring() -> dict:
    return {
        "providers_monitored": len(MONITORED_APIS),
        "providers_planned": len(PLANNED_APIS),
        "total_providers": len(MONITORED_APIS) + len(PLANNED_APIS),
        "total_changes_detected": _count("changelog_events"),
        "total_breaking_changes": _count_where("changelog_events", change_type="BREAKING_CHANGE"),
        "total_deprecations": _count_where("changelog_events", change_type="DEPRECATION"),
        "alerts_pending": _count_where("alerts", status="pending"),
        "alerts_sent": _count_where("alerts", status="sent", is_test=False),
        "failed_monitoring_jobs": 0,
        "execution_history": [],
        "provider_list": [
            {"name": p, "status": "monitored"} for p in MONITORED_APIS
        ] + [{"name": p, "status": "planned"} for p in PLANNED_APIS],
    }


# ---------------------------------------------------------------------------
# Repositories
# ---------------------------------------------------------------------------
@router.get("/repositories")
def admin_repositories(limit: int = Query(200, ge=1, le=500)) -> dict:
    try:
        rows = (
            db()
            .table("repos")
            .select("id,user_id,full_name,default_branch,connected_at,last_scanned_at")
            .order("connected_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Repositories unavailable: {exc}")
    # Resolve owner emails in one batched query.
    owner_ids = sorted({r.get("user_id") for r in rows if r.get("user_id")})
    emails: dict[str, str] = {}
    for chunk in _in_chunks(owner_ids):
        for u in (db().table("users").select("id,email").in_("id", chunk).execute().data or []):
            if u.get("id"):
                emails[u["id"]] = u.get("email")
    for r in rows:
        r["owner_email"] = emails.get(r.get("user_id"))
        r["scan_count"] = 0
    return {
        "total": _count("repos"),
        "active": len(rows),
        "disconnected": 0,
        "repositories": rows,
    }


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
@router.get("/analytics")
def admin_analytics() -> dict:
    return {
        "user_growth": {
            "total_users": _count("users"),
            "new_today": 0,
            "new_this_week": 0,
            "new_this_month": 0,
        },
        "engagement": {
            "total_repos": _count("repos"),
            "total_scans": _count("scans") if False else _count("instant_scans"),
            "total_alerts": _count("alerts"),
        },
        "feature_usage": {
            "instant_scans": _count("instant_scans"),
            "scan_events": _count("instant_scan_events"),
            "leads": _count("leads"),
        },
        "provider_usage": {
            "monitored": len(MONITORED_APIS),
            "planned": len(PLANNED_APIS),
        },
        "note": "Time-series trends require a daily aggregation job; counts shown are all-time.",
    }


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
@router.get("/notifications")
def admin_notifications(limit: int = Query(50, ge=1, le=200)) -> dict:
    items = []
    # Recent alerts as system notifications.
    try:
        alerts = (
            db()
            .table("alerts")
            .select("id,status,severity,provider,created_at,is_test")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        for a in alerts:
            items.append({
                "id": a.get("id"),
                "type": "alert",
                "title": f"{a.get('provider') or 'Provider'} alert ({a.get('status')})",
                "severity": a.get("severity"),
                "created_at": a.get("created_at"),
                "is_test": bool(a.get("is_test")),
            })
    except Exception:
        pass
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Security & audit logs
# ---------------------------------------------------------------------------
@router.get("/audit-logs")
def admin_audit_logs(limit: int = Query(100, ge=1, le=500)) -> dict:
    # Audit log table may not exist yet — degrade gracefully.
    try:
        rows = (
            db()
            .table("admin_audit_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        return {"items": rows, "total": len(rows)}
    except Exception as exc:
        if _is_schema_mismatch(exc):
            return {"items": [], "total": 0, "note": "Audit log table not yet created (run db/migration_admin_columns.sql)."}
        raise HTTPException(status_code=503, detail=f"Audit log unavailable: {exc}")


# ---------------------------------------------------------------------------
# Admin settings (read-only, non-secret)
# ---------------------------------------------------------------------------
@router.get("/settings")
def admin_settings() -> dict:
    return {
        "platform": {
            "environment": "production",
            "max_files_scanned": settings.max_files_scanned,
            "max_file_bytes": settings.max_file_bytes,
            "instant_scan_max_files": settings.instant_scan_max_files,
            "instant_scan_rate_limit": settings.instant_scan_rate_limit,
            "instant_scan_cache_hours": settings.instant_scan_cache_hours,
            "frontend_base_url": settings.frontend_base_url,
        },
        "email_provider": settings.email_provider if hasattr(settings, "email_provider") else None,
        "cors_origins": settings.cors_origins,
        "admin_user_ids": settings.admin_user_id_set,
        "note": "Sensitive credentials (API keys, secrets) are never exposed here.",
    }
