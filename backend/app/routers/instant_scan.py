"""Public Instant Repo Scan endpoints (no authentication required).

Every route here is anonymous by design. Abuse controls live in
:mod:`app.instant_scan` (5 scans/IP/hour, 2 concurrent, 24 h cache) and the
result payload never contains file contents or secret values.
"""
from __future__ import annotations

import html
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..db import db
from ..deps import get_current_user_id
from ..email_client import send_email
from ..instant_scan import (
    InvalidRepoUrl,
    RepoUnavailable,
    ScanBusy,
    ScanRateLimited,
    get_scan,
    latest_scan_for_repo,
    link_scan_to_user,
    parse_repo_url,
    record_event,
    run_instant_scan,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["instant-scan"])

_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[A-Za-z]{2,}$")
_ALLOWED_CLIENT_EVENTS = {"share_clicked", "badge_copied", "email_submitted", "github_signup_clicked", "github_signup_completed"}


class InstantScanIn(BaseModel):
    repo_url: str = Field(min_length=1, max_length=300)


class EmailCaptureIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ClientEventIn(BaseModel):
    event: str = Field(min_length=1, max_length=40)
    scan_id: str | None = Field(default=None, max_length=64)
    repo_full_name: str | None = Field(default=None, max_length=200)
    props: dict[str, str | int | float | bool] | None = Field(default=None, max_length=12)


def _clean_event_props(raw: dict[str, str | int | float | bool] | None) -> dict[str, str]:
    """Sanitize the free-form property bag before it is persisted."""
    cleaned: dict[str, str] = {}
    if not raw:
        return cleaned
    for key, value in raw.items():
        if not isinstance(key, str):
            continue
        name = key.strip().lower()[:32]
        if not name:
            continue
        if isinstance(value, bool):
            normalized = "true" if value else "false"
        elif isinstance(value, (int, float)):
            normalized = str(int(value))
        elif isinstance(value, str):
            normalized = value.strip()[:200]
        else:
            continue
        if normalized:
            cleaned[name] = normalized
    return cleaned


def _client_ip(request: Request) -> str:
    """Best-effort client IP.

    On Vercel the platform appends the real client address to
    ``x-forwarded-for``. This value is only used for abuse damping and is
    immediately hashed; it is never stored raw.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    real = request.headers.get("x-real-ip", "")
    if real:
        return real.strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


@router.post("/api/instant-scan")
def create_instant_scan(body: InstantScanIn, request: Request) -> dict:
    ip = _client_ip(request)
    # Validate before counting the attempt so malformed input does not inflate
    # the funnel's "started" denominator.
    try:
        parse_repo_url(body.repo_url)
    except InvalidRepoUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_event("scan_started", ip=ip)
    try:
        payload = run_instant_scan(body.repo_url, ip=ip)
    except InvalidRepoUrl as exc:  # pragma: no cover - validated above
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RepoUnavailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScanRateLimited as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except ScanBusy as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": "10"},
        ) from exc

    repo = payload["result"].get("repo")
    if not payload.get("cached"):
        record_event("scan_completed", scan_id=payload["scan_id"], repo_full_name=repo, ip=ip)
    return payload


@router.post("/api/instant-scan/events")
def client_event(body: ClientEventIn, request: Request) -> dict:
    """Record a frontend-only funnel event (share / badge copy)."""
    if body.event not in _ALLOWED_CLIENT_EVENTS:
        raise HTTPException(status_code=400, detail="Unknown event.")
    record_event(
        body.event,
        scan_id=body.scan_id,
        repo_full_name=body.repo_full_name,
        ip=_client_ip(request),
        props=_clean_event_props(body.props),
    )
    return {"ok": True}


@router.post("/api/instant-scan/{scan_id}/connect")
def connect_instant_scan(scan_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    """Sign-up continuation for a public instant scan.

    Called right after the visitor's GitHub sign-in: links the scan to the user,
    adds the scanned public repo to their monitored repos and arms daily
    monitoring. Response never contains secrets or file contents.
    """
    result = link_scan_to_user(scan_id, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return result


@router.get("/api/instant-scan/{scan_id}")
def read_instant_scan(scan_id: str) -> dict:
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return scan


@router.post("/api/instant-scan/{scan_id}/email")
def capture_instant_scan_email(scan_id: str, body: EmailCaptureIn, request: Request) -> dict:
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    repo = scan.get("repo_full_name") or scan["result"].get("repo") or ""
    ip = _client_ip(request)

    # Store the opt-in on the scan and create a lead (idempotent per email+repo).
    try:
        db().table("instant_scans").update({"email": email}).eq("id", scan_id).execute()
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not attach email to scan %s", scan_id)
    try:
        db().table("leads").upsert(
            {"email": email, "repo": repo, "source": "instant_scan"},
            on_conflict="email,repo,source",
        ).execute()
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not store lead for %s", repo)

    record_event("email_captured", scan_id=scan_id, repo_full_name=repo, ip=ip)

    scan_url = f"{_frontend_base()}/scan/{scan_id}"
    subject = f"Your Breaklytix scan for {repo}"
    text = (
        f"Thanks for scanning {repo} with Breaklytix.\n\n"
        f"Your result: {scan_url}\n\n"
        "We will email you when a provider you use publishes an official "
        "breaking change or deprecation that may affect this repository.\n\n"
        "Free beta. No credit card.\n\n"
        "— Breaklytix"
    )
    safe_repo = html.escape(repo)
    html_body = (
        "<div style=\"font-family:system-ui,-apple-system,Segoe UI,sans-serif;"
        "line-height:1.6;color:#1a1a2e\">"
        f"<p>Thanks for scanning <strong>{safe_repo}</strong> with Breaklytix.</p>"
        f"<p><a href=\"{html.escape(scan_url)}\">View your scan result</a></p>"
        "<p>We will email you when a provider you use publishes an official "
        "breaking change or deprecation that may affect this repository.</p>"
        "<p style=\"color:#6b7280;font-size:13px\">Free beta. No credit card.</p>"
        "<p>— Breaklytix</p></div>"
    )
    ok, detail = send_email(email, subject, html_body, text)
    if not ok:
        logger.warning("instant scan: confirmation email failed for %s: %s", repo, detail)
    return {"ok": True, "email_sent": ok}


def _frontend_base() -> str:
    from ..config import settings

    return (settings.frontend_base_url or "https://breaklytix.site").rstrip("/")


# ---------------------------------------------------------------------------
# README badge
# ---------------------------------------------------------------------------
def _badge_svg(label: str, value: str, color: str) -> str:
    label_w = max(58, 7 * len(label) + 14)
    value_w = max(66, 7 * len(value) + 16)
    total = label_w + value_w
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="20" '
        'role="img" aria-label="API watch | Breaklytix">'
        f'<title>{html.escape(label)} | {html.escape(value)}</title>'
        '<linearGradient id="s" x2="0" y2="100%">'
        '<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>'
        '<stop offset="1" stop-opacity=".1"/></linearGradient>'
        f'<rect width="{label_w}" height="20" fill="#24292f"/>'
        f'<rect x="{label_w}" width="{value_w}" height="20" fill="{color}"/>'
        f'<rect width="{total}" height="20" fill="url(#s)"/>'
        '<g fill="#fff" text-anchor="middle" '
        'font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">'
        f'<text x="{label_w / 2:.0f}" y="14">API watch</text>'
        f'<text x="{label_w + value_w / 2:.0f}" y="14">{html.escape(value)}</text>'
        "</g></svg>"
    )


@router.get("/badge/{owner}/{repo}.svg")
def readme_badge(owner: str, repo: str) -> Response:
    try:
        # Rebuild a full URL so the same strict validation (host allow-list,
        # traversal, query/fragment rejection) applies to path parameters.
        full_name = parse_repo_url(f"https://github.com/{owner}/{repo}")
    except InvalidRepoUrl as exc:
        raise HTTPException(status_code=404, detail="Unknown repository.") from exc

    latest = latest_scan_for_repo(full_name)
    if not latest:
        svg = _badge_svg("API watch", "not scanned", "#6b7280")
        return Response(
            content=svg,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=300, s-maxage=300"},
        )

    result = latest["result"]
    summary = result.get("summary") or {}
    provider_count = int(summary.get("provider_count") or 0)
    risk_count = int(summary.get("possible_risk_count") or 0)
    if risk_count:
        value = f"{provider_count} APIs · {risk_count} risk{'s' if risk_count != 1 else ''}"
        color = "#b45309"
    elif provider_count:
        value = f"{provider_count} APIs · no recent notice"
        color = "#0a7d3d"
    else:
        value = "no integrations found"
        color = "#6b7280"
    svg = _badge_svg("API watch", value, color)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=600, s-maxage=600"},
    )
