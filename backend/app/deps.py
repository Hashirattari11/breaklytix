"""Shared FastAPI dependencies: session auth + internal-secret guard."""
from __future__ import annotations

import secrets
import time

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .db import fetch_one

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Session tokens (our own JWT, issued after GitHub OAuth completes).
# ---------------------------------------------------------------------------
def issue_session_token(user_id: str) -> str:
    if not settings.jwt_secret:
        # Fail closed: an empty secret would let anyone forge HS256 tokens
        # signed with "". Refuse to issue rather than sign a worthless token.
        raise RuntimeError("JWT_SECRET is not configured — refusing to issue session tokens")
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + settings.jwt_ttl_hours * 3600,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    if not settings.jwt_secret:
        # Fail closed: without a configured secret no token could have been
        # validly issued, so every presented token must be rejected.
        raise HTTPException(status_code=401, detail="Invalid session token")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Malformed session token")
    user = fetch_one("users", {"id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("is_suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user_id


# ---------------------------------------------------------------------------
# Admin-only guard: verifies users.is_admin = true in the database.
# Must be used server-side on every /admin/* route (never rely on UI hiding).
# ---------------------------------------------------------------------------
def user_is_admin(user: dict | None) -> bool:
    """True when the user row grants admin rights.

    Two independent sources, both server-side:
      1. `users.is_admin` — the authoritative database flag, set by an operator.
      2. `ADMIN_USER_IDS` — an explicit environment allowlist used for
         bootstrap/recovery (comma-separated UUIDs). It exists so the service
         has a provisioning path that is not a hard-coded account: nothing is
         promoted implicitly, and removing the env value revokes the grant.
    """
    if not user:
        return False
    if bool(user.get("is_admin")):
        return True
    user_id = str(user.get("id") or "")
    return bool(user_id) and user_id in settings.admin_user_id_set


def require_admin(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    user = fetch_one("users", {"id": user_id})
    if not user or not user_is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Internal-secret guard for cron-triggered endpoints.
# ---------------------------------------------------------------------------
def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    expected = settings.cron_secret
    if not expected:
        # Fail closed: if the server has no secret configured, refuse rather than
        # exposing internal endpoints to the world.
        raise HTTPException(status_code=503, detail="Internal endpoints are not configured")
    if not x_internal_secret or not secrets.compare_digest(x_internal_secret, expected):
        raise HTTPException(status_code=401, detail="Bad or missing X-Internal-Secret")
