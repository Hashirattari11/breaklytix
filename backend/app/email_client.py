"""Email transport via the transactional sending API of the configured provider.

Brevo is the primary provider for production sends (the Breaklytix domain is
verified in Brevo). Resend remains as a fallback so a provider outage does not
silently disable alert + transactional email.

Kept to a single responsibility: send an email, report success/failure.

Brevo request contract (POST https://api.brevo.com/v3/smtp/email):
  headers: accept: application/json, api-key: <key>, content-type: application/json
  body: {
    "subject": str,
    "sender": {"name": str, "email": str},
    "to": [{"email": str}],
    "htmlContent": str,   // or "textContent"
  }
  response 201: { "messageId": str }
"""
from __future__ import annotations

import requests

from .config import settings

BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
RESEND_ENDPOINT = "https://api.resend.com/emails"


def get_provider() -> str:
    """Active sending provider: "brevo" (default) or "resend"."""
    provider = (getattr(settings, "email_provider", "brevo") or "brevo").strip().lower()
    return provider if provider in ("brevo", "resend") else "brevo"


def _sender_name_email(from_addr: str) -> tuple[str, str]:
    """Split a "Name <email>" sender into (name, email) for the Brevo payload."""
    frm = (from_addr or "").strip()
    if "<" in frm and ">" in frm:
        name = frm.split("<", 1)[0].strip()
        email = frm.split("<", 1)[1].split(">", 1)[0].strip()
    else:
        name = "Breaklytix"
        email = frm
    return name, email


def send_via_brevo(to: str, subject: str, html: str, text: str, api_key: str, from_addr: str) -> tuple[bool, str]:
    """Send one email via the Brevo transactional API. Returns (ok, detail)."""
    name, email = _sender_name_email(from_addr)
    payload: dict = {
        "subject": subject,
        "sender": {"name": name, "email": email},
        "to": [{"email": to}],
    }
    if (html or "").strip():
        payload["htmlContent"] = html
    else:
        payload["textContent"] = text
    try:
        resp = requests.post(
            BREVO_ENDPOINT,
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
            json=payload,
            timeout=20,
        )
    except requests.RequestException as exc:
        return False, f"request error: {exc}"
    if resp.status_code in (200, 201, 202):
        body: dict = {}
        try:
            body = resp.json() or {}
        except Exception:
            body = {}
        return True, str(body.get("messageId") or "sent")
    return False, f"{resp.status_code}: {resp.text[:300]}"


def send_via_resend(to: str, subject: str, html: str, text: str) -> tuple[bool, str]:
    """Send one email via the Resend REST API. Returns (ok, detail)."""
    if not settings.resend_api_key:
        return False, "RESEND_API_KEY not configured"
    try:
        resp = requests.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.resend_from_email,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        return False, f"request error: {exc}"
    if resp.status_code in (200, 201):
        return True, resp.json().get("id", "sent")
    return False, f"{resp.status_code}: {resp.text[:300]}"


def send_email(to: str, subject: str, html: str, text: str) -> tuple[bool, str]:
    """Send one email via the active provider. Returns (ok, detail)."""
    if get_provider() == "brevo":
        if not settings.brevo_api_key:
            return False, "BREVO_API_KEY not configured"
        return send_via_brevo(to, subject, html, text, settings.brevo_api_key, settings.brevo_from_email)
    return send_via_resend(to, subject, html, text)
