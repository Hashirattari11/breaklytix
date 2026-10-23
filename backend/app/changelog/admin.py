"""Admin approval queue for changelog alerts (Phase B beta safety net).

During beta, no real (non-test) alert email sends without manual admin approval.
This module provides functions to list, approve, and disable pending alerts.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..config import settings
from ..db import db
from ..deps import user_is_admin


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_pending_alerts(limit: int = 50) -> list[dict]:
    """Get changelog events pending admin approval.
    
    Returns events that have been processed but not yet approved for email sending.
    """
    res = (
        db()
        .table("changelog_events")
        .select("*")
        .is_("processed_at", "null")
        .order("detected_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_approved_alerts(limit: int = 50) -> list[dict]:
    """Get changelog events that have been approved for email sending."""
    res = (
        db()
        .table("changelog_events")
        .select("*")
        .not_.is_("processed_at", "null")
        .eq("admin_approved", True)
        .order("detected_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def approve_alert(event_id: str, admin_user_id: str) -> bool:
    """Approve a changelog event for email sending.
    
    Returns True if approved, False if not found.
    """
    try:
        db().table("changelog_events").update({
            "admin_approved": True,
            "approved_by": admin_user_id,
            "approved_at": _now_iso(),
        }).eq("id", event_id).execute()
        return True
    except Exception:
        return False


def disable_alert(event_id: str, admin_user_id: str, reason: str | None = None) -> bool:
    """Disable a changelog event (will not send emails).
    
    Returns True if disabled, False if not found.
    """
    try:
        db().table("changelog_events").update({
            "admin_approved": False,
            "disabled": True,
            "disabled_by": admin_user_id,
            "disabled_at": _now_iso(),
            "disabled_reason": reason,
        }).eq("id", event_id).execute()
        return True
    except Exception:
        return False


def is_admin(user_id: str) -> bool:
    """Check if a user is an admin.

    Reads ``users.is_admin`` from the database and falls back to the explicit
    ``ADMIN_USER_IDS`` environment allowlist. There is no hard-coded owner UUID:
    a privileged identity must come from the database or from operator config.
    """
    try:
        res = db().table("users").select("id,is_admin").eq("id", user_id).execute()
        row = (res.data or [{}])[0]
    except Exception:
        return user_id in settings.admin_user_id_set
    return user_is_admin({"id": user_id, **(row or {})})
