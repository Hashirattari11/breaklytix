"""Agency mode — one-click client repo authorization via email invite."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from ..deps import get_current_user_id
from ..db import db
from ..config import settings
from ..crypto import get_cipher
from ..github_app import build_install_url, list_installation_repos

router = APIRouter(prefix="/agency", tags=["agency"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _resolve_client_user_id(agency_owner_id: str, client_id: str) -> str:
    """Resolve a client_id to the actual user_id for repos queries."""
    result = (
        db().table("agency_clients")
        .select("id, status")
        .eq("id", client_id)
        .eq("agency_owner_id", agency_owner_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    client = result.data[0]
    if client["status"] != "authorized":
        raise HTTPException(status_code=400, detail="Client not yet authorized")
    return client_id  # Return client_id — repos use agency_client_id


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class AgencyInviteIn(BaseModel):
    client_display_name: str
    client_email: EmailStr


class AgencyClientOut(BaseModel):
    id: str
    client_display_name: str
    client_email: str
    status: str
    logo_url: Optional[str] = None
    created_at: str
    authorized_at: Optional[str] = None
    email_status: Optional[str] = None


class AgencyStatusOut(BaseModel):
    is_agency: bool
    client_count: int
    pending_count: int


class AuthorizeTokenOut(BaseModel):
    valid: bool
    agency_name: str
    client_email: str
    message: str
    client_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _verify_agency_owner(user_id: str) -> None:
    """Raise 403 if user is not an agency owner."""
    result = (
        db().table("users")
        .select("is_agency")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data or not result.data[0].get("is_agency"):
        raise HTTPException(status_code=403, detail="Agency access required")


def _hash_token(token: str) -> str:
    """SHA256 hash of the raw token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_invite_token() -> str:
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(32)


def _invite_expired(raw: str | None) -> bool:
    """Return True when a stored invite expiry is missing, malformed, or past."""
    if not raw:
        return True
    try:
        expires_at = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= expires_at


def _sign_install_state(
    *,
    client_id: str,
    agency_owner_id: str | None = None,
    invite_hash: str | None = None,
    invite_token: str | None = None,
) -> str:
    """Sign a short-lived GitHub App install state.

    GitHub echoes the state back verbatim, so it must be unguessable and
    tamper-proof. A raw client_id (the previous implementation) let anyone bind
    an arbitrary installation to a pending client.
    """
    if not settings.jwt_secret:
        raise HTTPException(
            status_code=503,
            detail="Agency installation signing is not configured on the server.",
        )
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "scope": "agency_install",
        "client_id": client_id,
        "agency_owner_id": agency_owner_id or "",
        "invite_hash": invite_hash or "",
        "invite_token": invite_token or "",
        "iat": now,
        "exp": now + 30 * 60,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _verify_install_state(state: str) -> dict:
    """Validate a signed install state and return its payload."""
    if not settings.jwt_secret:
        raise HTTPException(
            status_code=503,
            detail="Agency installation signing is not configured on the server.",
        )
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired installation state")
    if payload.get("scope") != "agency_install" or not payload.get("client_id"):
        raise HTTPException(status_code=400, detail="Invalid installation state")
    return payload


def _install_url(state: str) -> str:
    try:
        return build_install_url(state)
    except ValueError:
        raise HTTPException(
            status_code=503,
            detail="GitHub App integration is not configured on the server.",
        )


# ---------------------------------------------------------------------------
# GET /agency/status
# ---------------------------------------------------------------------------
@router.get("/status", response_model=AgencyStatusOut)
def agency_status(
    repository_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    user_result = (
        db().table("users")
        .select("is_agency")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    is_agency = user_result.data[0].get("is_agency", False) if user_result.data else False

    count_query = (
        db().table("agency_clients")
        .select("id", count="exact")
        .eq("agency_owner_id", user_id)
    )
    if repository_id and repository_id.strip():
        count_query = count_query.eq("repository_id", repository_id)
    count_result = count_query.execute()
    client_count = count_result.count or 0

    pending_query = (
        db().table("agency_clients")
        .select("id", count="exact")
        .eq("agency_owner_id", user_id)
        .eq("status", "pending")
    )
    if repository_id and repository_id.strip():
        pending_query = pending_query.eq("repository_id", repository_id)
    pending_result = pending_query.execute()
    pending_count = pending_result.count or 0

    return AgencyStatusOut(
        is_agency=is_agency,
        client_count=client_count,
        pending_count=pending_count,
    )


# ---------------------------------------------------------------------------
# GET /agency/clients
# ---------------------------------------------------------------------------
@router.get("/clients", response_model=list[AgencyClientOut])
def list_clients(
    repository_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    _verify_agency_owner(user_id)
    query = (
        db().table("agency_clients")
        .select("id, client_display_name, client_email, status, logo_url, created_at, authorized_at")
        .eq("agency_owner_id", user_id)
    )
    if repository_id and repository_id.strip():
        query = query.eq("repository_id", repository_id)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


# ---------------------------------------------------------------------------
# POST /agency/clients — Invite by email
# ---------------------------------------------------------------------------
@router.post("/clients", response_model=AgencyClientOut)
def invite_client(body: AgencyInviteIn, request: Request, user_id: str = Depends(get_current_user_id)):
    _verify_agency_owner(user_id)

    # Check not already invited (pending or authorized)
    existing = (
        db().table("agency_clients")
        .select("id, status")
        .eq("agency_owner_id", user_id)
        .eq("client_email", body.client_email)
        .in_("status", ["pending", "authorized"])
        .limit(1)
        .execute()
    )
    if existing.data:
        status = existing.data[0]["status"]
        if status == "authorized":
            raise HTTPException(status_code=409, detail="This email is already an authorized client")
        raise HTTPException(status_code=409, detail="An invite is already pending for this email")

    # Generate token
    raw_token = _generate_invite_token()
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Create client row
    result = (
        db().table("agency_clients")
        .insert({
            "agency_owner_id": user_id,
            "client_display_name": body.client_display_name,
            "client_email": body.client_email,
            "invite_token_hash": token_hash,
            "invite_token_expires_at": expires_at.isoformat(),
            "status": "pending",
        })
        .execute()
    )

    client_data = result.data[0]

    # Get agency owner's name for email
    owner_result = (
        db().table("users")
        .select("github_login, email")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    owner_name = "Your agency"
    if owner_result.data:
        owner_name = owner_result.data[0].get("github_login") or owner_result.data[0].get("email") or "Your agency"

    # Build authorization link (point at the FRONTEND, not this API)
    base_url = settings.frontend_base_url.rstrip("/")
    auth_link = f"{base_url}/authorize/{raw_token}"

    # Send invite email (best effort — don't fail the request if email fails)
    email_status = None
    try:
        from ..email import send_invite_email
        result = send_invite_email(
            to_email=body.client_email,
            agency_name=owner_name,
            client_name=body.client_display_name,
            auth_link=auth_link,
            user_id=user_id,
        )
        if result.get("ok"):
            # Honest status: Resend accepted the request — we can never claim
            # actual delivery (master pass §15). Surface sandbox warning.
            email_status = str(result.get("status", "accepted by provider"))
            if result.get("sender_warning"):
                email_status = f"{email_status} (sandbox sender)"
        else:
            email_status = f"failed: {result.get('detail', 'unknown error')}"
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors
        email_status = f"error: {exc.__class__.__name__}: {exc}"

    return AgencyClientOut(
        id=client_data["id"],
        client_display_name=client_data["client_display_name"],
        client_email=client_data["client_email"],
        status=client_data["status"],
        logo_url=client_data.get("logo_url"),
        created_at=client_data["created_at"],
        authorized_at=client_data.get("authorized_at"),
        email_status=email_status,
    )


# ---------------------------------------------------------------------------
# POST /agency/clients/{client_id}/resend — Resend invite
# ---------------------------------------------------------------------------
@router.post("/clients/{client_id}/resend")
def resend_invite(client_id: str, request: Request, user_id: str = Depends(get_current_user_id)):
    _verify_agency_owner(user_id)

    # Get client
    result = (
        db().table("agency_clients")
        .select("id, client_email, client_display_name, status")
        .eq("id", client_id)
        .eq("agency_owner_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")

    client = result.data[0]
    if client["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only resend invites for pending clients")

    # Generate new token
    raw_token = _generate_invite_token()
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Update token
    (
        db().table("agency_clients")
        .update({
            "invite_token_hash": token_hash,
            "invite_token_expires_at": expires_at.isoformat(),
        })
        .eq("id", client_id)
        .execute()
    )

    # Get agency owner's name
    owner_result = (
        db().table("users")
        .select("github_login, email")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    owner_name = "Your agency"
    if owner_result.data:
        owner_name = owner_result.data[0].get("github_login") or owner_result.data[0].get("email") or "Your agency"

    # Build authorization link (point at the FRONTEND, not this API)
    base_url = settings.frontend_base_url.rstrip("/")
    auth_link = f"{base_url}/authorize/{raw_token}"

    # Send email
    email_status = None
    try:
        from ..email import send_invite_email
        result = send_invite_email(
            to_email=client["client_email"],
            agency_name=owner_name,
            client_name=client["client_display_name"],
            auth_link=auth_link,
            user_id=user_id,
        )
        if result.get("ok"):
            email_status = str(result.get("status", "accepted by provider"))
            if result.get("sender_warning"):
                email_status = f"{email_status} (sandbox sender)"
        else:
            email_status = f"failed: {result.get('detail', 'unknown error')}"
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors
        email_status = f"error: {exc.__class__.__name__}: {exc}"

    return {"status": "resent", "email": client["client_email"], "email_status": email_status}


# ---------------------------------------------------------------------------
# POST /agency/test-email — Send a real test email through the production pipeline
# ---------------------------------------------------------------------------
@router.post("/test-email")
def agency_test_email(request: Request, user_id: str = Depends(get_current_user_id)):
    """Owner-only: send a test email to the agency owner's own address so they
    can verify delivery + sender configuration without spamming a client."""
    _verify_agency_owner(user_id)

    owner_result = (
        db().table("users")
        .select("email, github_login")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not owner_result.data or not owner_result.data[0].get("email"):
        raise HTTPException(status_code=400, detail="Your account has no email address to send to")

    owner_email = owner_result.data[0]["email"]

    from ..email_service import send_transactional_email, sender_problem, sender_is_sandbox
    problem = sender_problem()
    if problem:
        return {
            "ok": False,
            "status": "failed",
            "error_category": "sender_config",
            "detail": problem,
        }

    result = send_transactional_email(
        user_id=user_id,
        recipient=owner_email,
        alert_type="agency_test",
        subject="Breaklytix — Agency test email",
        html=(
            "<p>This is a test email from your Breaklytix agency workspace.</p>"
            "<p>If you received this, your email pipeline is configured correctly.</p>"
        ),
        text="This is a test email from your Breaklytix agency workspace. "
             "If you received this, your email pipeline is configured correctly.",
    )

    return {
        "ok": result.get("ok", False),
        "status": result.get("status", "failed"),
        "provider_message_id": result.get("provider_message_id"),
        "error_category": result.get("error_category"),
        "detail": result.get("detail"),
        "sender_warning": result.get("sender_warning"),
        "sandbox": sender_is_sandbox(),
    }


# ---------------------------------------------------------------------------
# DELETE /agency/clients/{client_id} — Revoke client
# ---------------------------------------------------------------------------
@router.delete("/clients/{client_id}")
def revoke_client(client_id: str, user_id: str = Depends(get_current_user_id)):
    _verify_agency_owner(user_id)

    # Get client to check status
    result = (
        db().table("agency_clients")
        .select("id, status")
        .eq("id", client_id)
        .eq("agency_owner_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")

    # Update status to revoked (don't delete — preserve history), invalidate any
    # outstanding invite, and remove repo token snapshots so revoked access
    # cannot keep scanning through a stale token.
    (
        db().table("agency_clients")
        .update({
            "status": "revoked",
            "invite_token_hash": None,
            "invite_token_expires_at": None,
        })
        .eq("id", client_id)
        .eq("agency_owner_id", user_id)
        .execute()
    )
    (
        db().table("repos")
        .update({"access_token": ""})
        .eq("agency_client_id", client_id)
        .execute()
    )

    return {"status": "revoked"}


# ---------------------------------------------------------------------------
# GET /authorize/{token} — Validate token (public, no auth)
# ---------------------------------------------------------------------------
@router.get("/authorize/{token}", response_model=AuthorizeTokenOut)
def validate_auth_token(token: str):
    """Validate an authorization token and return agency info."""
    token_hash = _hash_token(token)

    result = (
        db().table("agency_clients")
        .select("id, agency_owner_id, client_email, client_display_name, status, invite_token_expires_at")
        .eq("invite_token_hash", token_hash)
        .limit(1)
        .execute()
    )

    if not result.data:
        return AuthorizeTokenOut(
            valid=False,
            agency_name="",
            client_email="",
            message="Invalid or expired authorization link. Please contact your agency for a new link.",
        )

    client = result.data[0]

    # Check if already authorized
    if client["status"] == "authorized":
        return AuthorizeTokenOut(
            valid=False,
            agency_name="",
            client_email=client["client_email"],
            message="This authorization link has already been used. If you need access, contact your agency.",
        )

    # Check if revoked
    if client["status"] == "revoked":
        return AuthorizeTokenOut(
            valid=False,
            agency_name="",
            client_email=client["client_email"],
            message="This access has been revoked. Please contact your agency.",
        )

    # Check expiry (missing/malformed values fail closed, never 500)
    if _invite_expired(client.get("invite_token_expires_at")):
        return AuthorizeTokenOut(
            valid=False,
            agency_name="",
            client_email=client["client_email"],
            message="This authorization link has expired. Please contact your agency for a new link.",
        )

    # Get agency owner name
    owner_result = (
        db().table("users")
        .select("github_login, email")
        .eq("id", client["agency_owner_id"])
        .limit(1)
        .execute()
    )
    agency_name = "Your agency"
    if owner_result.data:
        agency_name = owner_result.data[0].get("github_login") or owner_result.data[0].get("email") or "Your agency"

    return AuthorizeTokenOut(
        valid=True,
        agency_name=agency_name,
        client_email=client["client_email"],
        message=f"{agency_name} is requesting access to monitor your repository for API breaking changes.",
        client_id=client["id"],
    )


# ---------------------------------------------------------------------------
# GET /agency/install-url — Generate GitHub App install URL (authenticated)
# ---------------------------------------------------------------------------
class InstallUrlOut(BaseModel):
    url: str
    state: str


@router.get("/install-url", response_model=InstallUrlOut)
def get_install_url(client_id: str = Query(...), user_id: str = Depends(get_current_user_id)):
    """Generate a GitHub App installation URL for a specific pending client.

    The state parameter encodes the client_id so the callback can route back.
    """
    _verify_agency_owner(user_id)

    # Verify the client exists and is pending
    result = (
        db().table("agency_clients")
        .select("id, status")
        .eq("id", client_id)
        .eq("agency_owner_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    if result.data[0]["status"] != "pending":
        raise HTTPException(status_code=400, detail="Client is not in pending status")

    # Signed, short-lived state — a raw client_id is guessable/tamperable.
    state = _sign_install_state(client_id=client_id, agency_owner_id=user_id)
    url = _install_url(state)
    return InstallUrlOut(url=url, state=state)


# ---------------------------------------------------------------------------
# GET /agency/public-install-url — Generate install URL (NO auth, for clients)
# ---------------------------------------------------------------------------
@router.get("/public-install-url", response_model=InstallUrlOut)
def get_public_install_url(token: str = Query(..., min_length=16, max_length=512)):
    """Public endpoint for the authorize page to generate a GitHub App install URL.

    No auth required — the client clicking the email link is not authenticated.
    Authorization is the unguessable invite token, and the returned `state` is a
    signed JWT bound to that invite (never a raw client_id).
    """
    token_hash = _hash_token(token)
    result = (
        db().table("agency_clients")
        .select("id, status, invite_token_expires_at")
        .eq("invite_token_hash", token_hash)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid authorization link")
    client = result.data[0]
    if client["status"] != "pending":
        raise HTTPException(status_code=400, detail="Client is not in pending status")
    if _invite_expired(client.get("invite_token_expires_at")):
        raise HTTPException(status_code=400, detail="This authorization link has expired")

    state = _sign_install_state(
        client_id=client["id"],
        invite_hash=token_hash,
        invite_token=token,
    )
    url = _install_url(state)
    return InstallUrlOut(url=url, state=state)


# ---------------------------------------------------------------------------
# GET /agency/github-install-callback — GitHub App installation callback
# ---------------------------------------------------------------------------
@router.get("/github-install-callback")
def github_install_callback(
    installation_id: str = Query(..., pattern=r"^\d{1,30}$"),
    state: str = Query(..., min_length=16, max_length=4096),
):
    """Handle the GitHub App installation callback.

    GitHub redirects here after the client picks repos in the install UI.
    `state` is our signed JWT, bound to either the agency owner or the client's
    invite hash; it is never trusted as a raw client id.
    """
    payload = _verify_install_state(state)
    client_id = payload["client_id"]

    # Find the client
    result = (
        db().table("agency_clients")
        .select("id, agency_owner_id, status, invite_token_hash, invite_token_expires_at")
        .eq("id", client_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid installation callback")

    client = result.data[0]

    # Bind the signed state to this client and, for public invites, to the
    # exact invite token that was emailed.
    signed_owner = payload.get("agency_owner_id") or ""
    signed_invite_hash = payload.get("invite_hash") or ""
    if signed_owner:
        if signed_owner != client.get("agency_owner_id"):
            raise HTTPException(status_code=403, detail="Installation state does not match this client")
    elif signed_invite_hash:
        if not secrets.compare_digest(signed_invite_hash, client.get("invite_token_hash") or ""):
            raise HTTPException(status_code=400, detail="This invite is no longer valid")
        if _invite_expired(client.get("invite_token_expires_at")):
            raise HTTPException(status_code=400, detail="This invite has expired")
    else:
        raise HTTPException(status_code=400, detail="Invalid installation state")

    if client["status"] != "pending":
        raise HTTPException(status_code=400, detail="This invite has already been used or revoked")

    # Store the installation_id and mark as authorized. The status filter keeps
    # a concurrent second callback from rewriting an already-authorized row.
    now = datetime.now(timezone.utc).isoformat()
    (
        db().table("agency_clients")
        .update({
            "github_installation_id": installation_id,
            "status": "authorized",
            "authorized_at": now,
            "invite_token_hash": None,  # Invalidate token
            "invite_token_expires_at": None,
        })
        .eq("id", client_id)
        .eq("status", "pending")
        .execute()
    )

    # List repos the client granted via the GitHub App installation
    repos_list = list_installation_repos(installation_id)
    connected_count = 0
    owner_token_result = (
        db().table("users")
        .select("github_access_token")
        .eq("id", client["agency_owner_id"])
        .limit(1)
        .execute()
    )
    owner_access_token = (
        owner_token_result.data[0].get("github_access_token") or ""
        if owner_token_result.data
        else ""
    )
    for repo_data in repos_list:
        try:
            full_name = repo_data["full_name"]
            existing = (
                db().table("repos")
                .select("id")
                .eq("full_name", full_name)
                .eq("agency_client_id", client_id)
                .limit(1)
                .execute()
            )
            if not existing.data:
                db().table("repos").insert({
                    "user_id": client["agency_owner_id"],
                    "agency_client_id": client_id,
                    "github_repo_id": str(repo_data["id"]),
                    "full_name": full_name,
                    "default_branch": repo_data.get("default_branch", "main"),
                    # Kept as a compatibility fallback; scanner prefers a fresh
                    # installation token from github_installation_id.
                    "access_token": owner_access_token,
                }).execute()
                connected_count += 1
        except Exception:
            pass  # Skip repos that fail

    # Redirect (not JSON) so the email link finishes in the browser.
    base_url = settings.frontend_base_url.rstrip("/")
    invite_token = payload.get("invite_token") or ""
    if invite_token:
        destination = (
            f"{base_url}/authorize/{quote(invite_token, safe='')}?installed=1"
        )
    else:
        destination = f"{base_url}/dashboard/agency?installed=1&repos={connected_count}"
    return RedirectResponse(destination, status_code=303)


# ---------------------------------------------------------------------------
# POST /authorize/{token}/complete — Complete authorization (public, no auth)
# ---------------------------------------------------------------------------
class CompleteAuthIn(BaseModel):
    github_token: str
    repos: list[str]  # List of repo full_names to connect


@router.post("/authorize/{token}/complete")
def complete_authorization(token: str, body: CompleteAuthIn):
    """Complete the authorization flow — store GitHub token and connect repos."""
    token_hash = _hash_token(token)

    # Find the client
    result = (
        db().table("agency_clients")
        .select("id, agency_owner_id, status, invite_token_expires_at")
        .eq("invite_token_hash", token_hash)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid authorization link")

    client = result.data[0]

    # Validate status
    if client["status"] != "pending":
        raise HTTPException(status_code=400, detail="This authorization link has already been used or revoked")

    # Check expiry (missing/malformed values fail closed, never 500)
    if _invite_expired(client.get("invite_token_expires_at")):
        raise HTTPException(status_code=400, detail="This authorization link has expired")

    # Update client: store GitHub token (ENCRYPTED at rest), set status to authorized
    enc_token = get_cipher().encrypt(body.github_token)
    (
        db().table("agency_clients")
        .update({
            "github_access_token": enc_token,
            "status": "authorized",
            "authorized_at": datetime.now(timezone.utc).isoformat(),
            "invite_token_hash": None,  # Invalidate token
            "invite_token_expires_at": None,
        })
        .eq("id", client["id"])
        .eq("status", "pending")
        .execute()
    )

    # Connect repos — for each repo, fetch from GitHub and create in repos table
    connected_count = 0
    import re
    # Strict owner/repo shape: blocks path tricks in the GitHub API URL the
    # token would be sent to (the value is interpolated into the request path).
    _REPO_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    for repo_name in body.repos:
        if not isinstance(repo_name, str) or not _REPO_NAME_RE.match(repo_name):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid repository name: {repo_name!r} (expected 'owner/repo')",
            )
        try:
            # Fetch repo info from GitHub
            import httpx
            with httpx.Client(timeout=15) as client_http:
                gh_resp = client_http.get(
                    f"https://api.github.com/repos/{repo_name}",
                    headers={"Authorization": f"Bearer {body.github_token}"},
                )
                if gh_resp.status_code == 200:
                    repo_data = gh_resp.json()

                    # Check if repo already exists
                    existing = (
                        db().table("repos")
                        .select("id")
                        .eq("full_name", repo_name)
                        .eq("agency_client_id", client["id"])
                        .limit(1)
                        .execute()
                    )

                    if not existing.data:
                        # Create repo entry — store the client's encrypted PAT so
                        # scanner token resolution (`_repo_scan_tokens`) can use it.
                        db().table("repos").insert({
                            "user_id": client["agency_owner_id"],
                            "agency_client_id": client["id"],
                            "github_repo_id": str(repo_data["id"]),
                            "full_name": repo_data["full_name"],
                            "default_branch": repo_data.get("default_branch", "main"),
                            "access_token": enc_token,
                        }).execute()
                        connected_count += 1
        except Exception:
            pass  # Skip repos that fail

    return {
        "status": "authorized",
        "repos_connected": connected_count,
        "message": f"Authorization complete! {connected_count} repository connected.",
    }
