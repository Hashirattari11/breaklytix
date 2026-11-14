"""Auth routes: GitHub OAuth code exchange -> our session JWT."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from ..config import settings
from ..crypto import get_cipher
from ..db import db, fetch_one
from ..deps import get_current_user_id, issue_session_token, require_internal_secret
import requests

from ..github_client import GitHubError, exchange_code_for_token, get_authenticated_user
from ..instant_scan import link_scan_to_user
from ..schemas import AuthOut, GitHubCallbackIn, SupabaseCallbackIn, UserOut
from .consent import _user_out

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger("autofix.auth")

# GitHub OAuth error codes -> user-safe, actionable messages. Deliberately
# curated constants: API responses never echo the caller-supplied redirect
# URI, the client secret, or raw provider response bodies.
_OAUTH_SAFE_ERRORS = {
    "incorrect_client_credentials": (
        "Sign-in configuration mismatch: the GitHub app used by the site does "
        "not match the client credentials stored on the backend. Point "
        "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (and the frontend's "
        "NEXT_PUBLIC_GITHUB_CLIENT_ID) at the same GitHub app."
    ),
    "bad_verification_code": (
        "The GitHub sign-in code was invalid or already used. "
        "Please go back and sign in again."
    ),
    "redirect_uri_mismatch": (
        "The GitHub app does not have this site's callback URL registered. "
        "Add '<your-domain>/auth/callback' to the app's callback URLs."
    ),
    "application_suspended": (
        "The GitHub app used for sign-in has been suspended by GitHub. "
        "Please contact the site administrator."
    ),
}


def _safe_github_auth_detail(exc: GitHubError) -> str:
    """Map a GitHub OAuth failure to a user-safe, actionable message."""
    text = str(exc)
    if "not configured on the server" in text:
        return (
            "GitHub sign-in is not configured on the server. "
            "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET."
        )
    for code, message in _OAUTH_SAFE_ERRORS.items():
        if code in text:
            return message
    return "GitHub sign-in could not be completed. Please try again."

# Internal-only test identity. The public "demo account" has been removed —
# real users sign in with GitHub. This endpoint now requires the internal
# secret and is used solely for automated tests.
DEMO_EMAIL = "demo@autofix.app"


@router.get("/demo", response_model=AuthOut)
def demo_session(_: None = Depends(require_internal_secret)) -> AuthOut:
    """INTERNAL ONLY session (public demo removed).

    Requires `X-Internal-Secret`. Kept so automated tests can obtain a scoped
    session without GitHub; it is not reachable by the public frontend.
    """
    row = {
        "email": DEMO_EMAIL,
        "github_login": "demo",
    }
    res = db().table("users").upsert(row, on_conflict="email").execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create demo session")
    user = res.data[0]
    return AuthOut(token=issue_session_token(user["id"]), user=_user_out(user))


@router.post("/github/callback", response_model=AuthOut)
def github_callback(body: GitHubCallbackIn) -> AuthOut:
    """Exchange the OAuth code for a token, upsert the user, return a session JWT.

    The GitHub token is encrypted (Fernet) before it ever touches the database.
    """
    try:
        gh_token = exchange_code_for_token(body.code, body.redirect_uri)
        gh_user = get_authenticated_user(gh_token)
    except GitHubError as exc:
        # Full detail goes to server logs (Vercel diagnostics); the API
        # response stays safe — no redirect URIs, secrets, or raw bodies.
        logger.warning("GitHub OAuth exchange failed: %s", exc)
        raise HTTPException(status_code=502, detail=_safe_github_auth_detail(exc))

    if not gh_user.get("email"):
        raise HTTPException(
            status_code=400,
            detail="No verified email available from GitHub. Verify your email and retry.",
        )

    encrypted = get_cipher().encrypt(gh_token)
    row = {
        "email": gh_user["email"],
        "github_id": gh_user["github_id"],
        "github_login": gh_user.get("github_login"),
        "github_access_token": encrypted,
    }
    res = db().table("users").upsert(row, on_conflict="github_id").execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to persist user")
    user = res.data[0]
    if user.get("is_suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")

    # Post-scan sign-up continuation: when the visitor arrived via the
    # /scan/[id] CTA ("Continue with GitHub"), link the scan to this user and
    # arm monitoring for the scanned repo. Anonymous scans stay unlinked.
    linked_scan: dict | None = None
    if body.scan_id:
        try:
            linked_scan = link_scan_to_user(body.scan_id, str(user["id"]))
        except Exception:  # noqa: BLE001 — never fail the session on a link hiccup
            logger.warning("GitHub callback: could not link scan %s to user", body.scan_id)

    return AuthOut(
        token=issue_session_token(user["id"]),
        user=_user_out(user),
    )


@router.post("/supabase/callback", response_model=AuthOut)
def supabase_callback(body: SupabaseCallbackIn) -> AuthOut:
    """Exchange a Supabase Auth access token for a Breaklytix session JWT.

    Used by the email-OTP sign-up / sign-in flow. The Supabase token is verified
    against the configured Supabase project; the resulting user is upserted into
    our ``users`` table (matched by email) and a session JWT is issued.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase auth is not configured on the server.")

    # Verify the Supabase access token by asking Supabase Auth who it belongs to.
    try:
        resp = requests.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {body.access_token}",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.warning("Supabase auth verification failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not verify your session. Please try again.") from exc

    if resp.status_code != 200:
        logger.warning("Supabase auth rejected token: %s", resp.status_code)
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")

    sb_user = resp.json() or {}
    email = (sb_user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email on your Supabase account.")

    sb_id = str(sb_user.get("id") or "")
    # Match by email first (no unique constraint required); fall back to insert.
    user = None
    try:
        existing = db().table("users").select("*").eq("email", email).limit(1).execute().data or []
        if existing:
            user = existing[0]
            update_payload = {}
            if sb_id:
                try:
                    update_payload["supabase_user_id"] = sb_id
                except Exception:  # noqa: BLE001
                    pass
            if update_payload:
                try:
                    db().table("users").update(update_payload).eq("id", user["id"]).execute()
                    user.update(update_payload)
                except Exception as exc:  # noqa: BLE001 — column may not exist yet
                    logger.warning("Could not store supabase_user_id: %s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("User lookup by email failed: %s", exc)

    if user is None:
        try:
            insert_payload = {"email": email}
            try:
                insert_payload["supabase_user_id"] = sb_id or None
            except Exception:  # noqa: BLE001
                pass
            res = db().table("users").insert(insert_payload).execute()
            rows = res.data or []
            if rows:
                user = rows[0]
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to insert Supabase user: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to persist user") from exc

    if not user:
        raise HTTPException(status_code=500, detail="Failed to persist user")

    if user.get("is_suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")

    # Post-scan sign-up continuation.
    if body.scan_id:
        try:
            link_scan_to_user(body.scan_id, str(user["id"]))
        except Exception:  # noqa: BLE001
            logger.warning("Supabase callback: could not link scan %s to user", body.scan_id)

    return AuthOut(
        token=issue_session_token(user["id"]),
        user=_user_out(user),
    )


@router.get("/me", response_model=UserOut)
def me(user_id: str = Depends(get_current_user_id)) -> UserOut:
    user = fetch_one("users", {"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_out(user)
