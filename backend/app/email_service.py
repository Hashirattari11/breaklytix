"""Central email service: sender validation, delivery logging, error categories.

Every email in the system flows through here so that:
  * the sender is validated up-front (fail closed with a clear message),
  * every send attempt is persisted to `email_deliveries` (never secrets),
  * the active provider errors are categorized (sender_config | rejected |
    rate_limit | network | unknown) for honest surfacing,
  * duplicate alert emails are suppressed via a per-event fingerprint + 1h
    cooldown, and a per-user daily cap protects the provider free tier.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from .config import settings
from .db import db
from .email_client import get_provider, send_email

# 10 categories the UI exposes. All default ON; rows in notification_preferences
# override per user/category.
NOTIFICATION_CATEGORIES = [
    "breaking_changes",
    "code_breaks",
    "api_errors",
    "rate_limits",
    "quota",
    "provider_incidents",
    "anomalies",
    "auto_fix",
    "scan_results",
    "digest",
]

# Fail-closed message required by the spec when the sender is misconfigured.
SENDER_NOT_CONFIGURED = "Email sender is not configured correctly."

# "Name may contain spaces <email>"; angle brackets and @ not allowed in the name.
_NAME_EMAIL = re.compile(r"^[^<>@]+ <[^<>@]+@[^<>@]+>$")

# Daily caps so one burst of events cannot exhaust the provider free tier.
MAX_ALERT_EMAILS_PER_DAY = 5
MAX_DIGEST_EMAILS_PER_DAY = 1
DEDUP_WINDOW_MINUTES = 60


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sender_problem() -> str | None:
    """Return a fail-closed error string, or None if the sender is usable.

    A usable sender needs an API key, and a well-formed "Name <email>" sender
    for the ACTIVE provider. The provider is selected via EMAIL_PROVIDER
    (default: "brevo"). The Brevo sending domain is verified, so a verified
    sender is required for real delivery; the Resend sandbox sender
    (onboarding@resend.dev) is allowed because it still delivers to the account
    owner (used for /debug/email and test emails), but callers can see the
    sandbox note via `sender_is_sandbox()`.
    """
    provider = get_provider()
    if provider == "brevo":
        if not settings.brevo_api_key:
            return f"{SENDER_NOT_CONFIGURED} (BREVO_API_KEY is not set)"
        frm = (settings.brevo_from_email or "").strip()
        if not frm:
            return f"{SENDER_NOT_CONFIGURED} (BREVO_FROM_EMAIL is not set)"
        if not _NAME_EMAIL.match(frm):
            return (
                f"{SENDER_NOT_CONFIGURED} (BREVO_FROM_EMAIL must be "
                f'"Name <email>" — got {frm!r})'
            )
        return None
    # Resend fallback.
    if not settings.resend_api_key:
        return f"{SENDER_NOT_CONFIGURED} (RESEND_API_KEY is not set)"
    frm = (settings.resend_from_email or "").strip()
    if not frm:
        return f"{SENDER_NOT_CONFIGURED} (RESEND_FROM_EMAIL is not set)"
    if not _NAME_EMAIL.match(frm):
        return (
            f"{SENDER_NOT_CONFIGURED} (RESEND_FROM_EMAIL must be "
            '"Name <email>" — got %r)' % frm
        )
    return None


def sender_is_sandbox() -> bool:
    if get_provider() == "brevo":
        # Brevo has no sandbox sender; verified-domain senders only.
        return False
    return "@resend.dev" in (settings.resend_from_email or "")


def _sender_warning() -> str | None:
    """Human-readable note when the active provider uses a sandbox/test sender."""
    if not sender_is_sandbox():
        return None
    if get_provider() == "brevo":
        return (
            "Sent via the Brevo sandbox sender (onboarding@brevo.com) — "
            "it only delivers to the account owner's email. Configure a "
            "verified BREVO_FROM_EMAIL for general delivery."
        )
    return (
        "Sent via the Resend sandbox sender (onboarding@resend.dev) — "
        "it only delivers to the account owner's email. Configure a "
        "verified RESEND_FROM_EMAIL for general delivery."
    )


def resolve_user_email(user_id: str) -> str | None:
    """Resolve a user id to their email (the only acceptable recipient)."""
    rows = (
        db().table("users").select("email").eq("id", user_id).limit(1).execute()
    ).data or []
    if not rows:
        return None
    email = (rows[0].get("email") or "").strip()
    return email or None


# ---------------------------------------------------------------------------
# preferences
# ---------------------------------------------------------------------------
def preferences_map(user_id: str) -> dict[str, bool]:
    """All 10 categories with effective enabled state (DB rows override)."""
    prefs = {c: True for c in NOTIFICATION_CATEGORIES}
    try:
        rows = (
            db().table("notification_preferences")
            .select("category, email_enabled")
            .eq("user_id", user_id)
            .execute()
        ).data or []
    except Exception:
        return prefs
    for r in rows:
        if r.get("category") in prefs:
            prefs[r["category"]] = bool(r.get("email_enabled", True))
    return prefs


def category_enabled(user_id: str, category: str) -> bool:
    if category not in NOTIFICATION_CATEGORIES:
        return True
    return preferences_map(user_id).get(category, True)


# ---------------------------------------------------------------------------
# delivery logging + dedup
# ---------------------------------------------------------------------------
def _insert_delivery(
    *,
    user_id: str | None,
    alert_id: str | None,
    alert_type: str,
    recipient: str,
    subject: str | None,
    status: str,
    provider_message_id: str | None = None,
    error_category: str | None = None,
    http_status: int | None = None,
    fingerprint: str | None = None,
) -> None:
    try:
        db().table("email_deliveries").insert(
            {
                "user_id": user_id,
                "alert_id": alert_id,
                "alert_type": alert_type,
                "recipient": recipient,
                "subject": subject,
                "status": status,
                "provider": get_provider(),
                "provider_message_id": provider_message_id,
                "error_category": error_category,
                "http_status": http_status,
                "fingerprint": fingerprint,
            }
        ).execute()
    except Exception:
        # Delivery logging must never break the alert pipeline.
        pass


def _recent_same_fingerprint(fingerprint: str) -> bool:
    if not fingerprint:
        return False
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=DEDUP_WINDOW_MINUTES)).isoformat()
    rows = (
        db().table("email_deliveries")
        .select("id")
        .eq("fingerprint", fingerprint)
        .in_("status", ["sent", "queued"])
        .gte("created_at", cutoff)
        .limit(1)
        .execute()
    ).data or []
    return bool(rows)


def _daily_count(user_id: str | None) -> int:
    if not user_id:
        return 0
    today = datetime.now(timezone.utc).date().isoformat()
    rows = (
        db().table("email_deliveries")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", today)
        .limit(1)
        .execute()
    ).data or []
    try:
        count = (
            db().table("email_deliveries")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", today)
            .execute()
        )
        return int(count.count)
    except Exception:
        return len(rows)


def _categorize(status_code: int | None, detail: str) -> str:
    lower = (detail or "").lower()
    if "not configured" in lower or "brevo_api_key" in lower or "resend_api_key" in lower:
        return "sender_config"
    if status_code == 429 or "rate" in lower or "429" in lower:
        return "rate_limit"
    if status_code and 400 <= status_code < 500:
        return "rejected"
    if "request error" in lower or "timeout" in lower or "connection" in lower:
        return "network"
    return "unknown"


def send_alert_email(
    *,
    user_id: str,
    recipient: str,
    alert_type: str,
    subject: str,
    html: str,
    text: str,
    alert_id: str | None = None,
    fingerprint: str | None = None,
    context: dict | None = None,
) -> dict:
    """Send one alert email with logging, dedup and daily caps.

    Returns a dict:
      {ok, status, provider_message_id?, error_category?, detail?,
       skipped_duplicate?, sender_warning?}

    `ok` is only True when the active provider accepted the request (2xx with a
    message id).
    """
    subj = subject or ""
    problem = sender_problem()
    if problem:
        _insert_delivery(
            user_id=user_id, alert_id=alert_id, alert_type=alert_type,
            recipient=recipient, subject=subj, status="failed",
            error_category="sender_config",
        )
        return {"ok": False, "status": "failed", "error_category": "sender_config", "detail": problem}

    # Dedup: same fingerprint already sent (or queued) within the window.
    if fingerprint and _recent_same_fingerprint(fingerprint):
        return {
            "ok": True, "status": "skipped", "skipped_duplicate": True,
            "detail": "Duplicate suppressed (same event already emailed recently)",
        }

    # Daily cap (applies to alerts; digest is capped separately via its own path).
    if alert_type != "digest" and _daily_count(user_id) >= MAX_ALERT_EMAILS_PER_DAY:
        _insert_delivery(
            user_id=user_id, alert_id=alert_id, alert_type=alert_type,
            recipient=recipient, subject=subj, status="failed",
            error_category="rate_limit",
            fingerprint=fingerprint,
        )
        return {
            "ok": False, "status": "failed", "error_category": "rate_limit",
            "detail": "Daily email cap reached for this user",
        }

    _insert_delivery(
        user_id=user_id, alert_id=alert_id, alert_type=alert_type,
        recipient=recipient, subject=subj, status="queued",
        fingerprint=fingerprint,
    )

    ok, detail = send_email(recipient, subject, html, text)

    if ok:
        # detail is the provider message id on success.
        _insert_delivery(
            user_id=user_id, alert_id=alert_id, alert_type=alert_type,
            recipient=recipient, subject=subj, status="sent",
            provider_message_id=detail, http_status=200,
            fingerprint=fingerprint,
        )
        result: dict = {
            "ok": True, "status": "sent", "provider_message_id": detail,
            "detail": detail,
        }
        warning = _sender_warning()
        if warning:
            result["sender_warning"] = warning
        return result

    # Failure path: parse the numeric HTTP code from detail if present.
    status_code = None
    try:
        status_code = int(detail.split(":")[0]) if detail and detail.split(":")[0].isdigit() else None
    except Exception:
        status_code = None
    category = _categorize(status_code, detail)
    _insert_delivery(
        user_id=user_id, alert_id=alert_id, alert_type=alert_type,
        recipient=recipient, subject=subj, status="failed",
        error_category=category, http_status=status_code,
        fingerprint=fingerprint,
    )
    return {"ok": False, "status": "failed", "error_category": category, "detail": detail[:300]}


def send_transactional_email(
    *,
    user_id: str | None,
    recipient: str,
    alert_type: str,
    subject: str,
    html: str,
    text: str,
) -> dict:
    """Send one transactional (non-alert) email through the central pipeline.

    Used for agency invites, welcome emails, and scan confirmations — the
    flows that previously called ``email_client.send_email`` DIRECTLY,
    bypassing sender validation and delivery logging (master pass §15).

    Unlike alerts there is no dedup or daily cap: these are one-per-action
    transactional emails.

    Returns a dict (same shape as send_alert_email):
      {ok, status, provider_message_id?, error_category?, detail?, sender_warning?}

    `ok` is True only when the active provider accepted the request (2xx + message id).
    The `status` is deliberately "accepted by provider" — we can never claim
    actual "delivered" because the provider does not return a delivery receipt here.
    """
    subj = subject or ""
    problem = sender_problem()
    if problem:
        _insert_delivery(
            user_id=user_id, alert_id=None, alert_type=alert_type,
            recipient=recipient, subject=subj, status="failed",
            error_category="sender_config",
        )
        return {"ok": False, "status": "failed", "error_category": "sender_config", "detail": problem}

    _insert_delivery(
        user_id=user_id, alert_id=None, alert_type=alert_type,
        recipient=recipient, subject=subj, status="queued",
    )

    ok, detail = send_email(recipient, subject, html, text)

    if ok:
        _insert_delivery(
            user_id=user_id, alert_id=None, alert_type=alert_type,
            recipient=recipient, subject=subj, status="sent",
            provider_message_id=detail, http_status=200,
        )
        result: dict = {
            "ok": True,
            "status": "accepted by provider",
            "provider_message_id": detail,
            "detail": detail,
        }
        warning = _sender_warning()
        if warning:
            result["sender_warning"] = warning
        return result

    status_code = None
    try:
        status_code = int(detail.split(":")[0]) if detail and detail.split(":")[0].isdigit() else None
    except Exception:
        status_code = None
    category = _categorize(status_code, detail)
    _insert_delivery(
        user_id=user_id, alert_id=None, alert_type=alert_type,
        recipient=recipient, subject=subj, status="failed",
        error_category=category, http_status=status_code,
    )
    return {"ok": False, "status": "failed", "error_category": category, "detail": detail[:300]}