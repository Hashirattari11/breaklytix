"""Public API v1 — Bearer afx_live_... auth, rate-limited.

Read endpoints expose account data; the two repository endpoints let the CLI
list connected repositories and trigger the same ownership-checked scan the
dashboard uses.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..deps import get_current_user_id
from ..db import db
from ..schemas import ScanResultOut

router = APIRouter(prefix="/api/public/v1", tags=["public-api"])
logger = logging.getLogger("autofix.public_api")

# ---------------------------------------------------------------------------
# Rate limiting (in-memory per-user counters)
# ---------------------------------------------------------------------------
_rate_limits: dict[str, dict] = {}  # user_id → {"count": int, "reset_at": float}

# Hourly public-API request allowances. `alerts` rows carry a `provider`
# column, and billing's `monitored_api_limit` (-1 = enterprise/unlimited) is
# the authoritative tier signal — plan_status alone (trial/active/past_due/
# canceled) does not map 1:1 to a quota, so we derive from the limit.
_QUOTA_DEFAULT = 100
_QUOTA_GROWTH = 1000
_QUOTA_ENTERPRISE = 5000


def _get_rate_limit(user_id: str) -> int:
    from ..billing import in_unlimited_trial

    result = (
        db().table("users")
        .select("monitored_api_limit, plan_status, created_at, stripe_subscription_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return _QUOTA_DEFAULT
    row = result.data[0]
    m = row.get("monitored_api_limit")
    # Unlimited = enterprise quota. The 10-day trial grants unlimited too.
    if m == -1 or in_unlimited_trial(
        row.get("created_at"), bool(row.get("stripe_subscription_id"))
    ):
        return _QUOTA_ENTERPRISE
    if isinstance(m, int) and m >= 50:  # growth (>= 500) or high tier
        return _QUOTA_GROWTH
    return _QUOTA_DEFAULT


def _check_rate_limit(user_id: str, limit: int) -> None:
    now = time.time()
    window = 3600  # 1 hour

    entry = _rate_limits.get(user_id)
    if not entry or now > entry["reset_at"]:
        _rate_limits[user_id] = {"count": 1, "reset_at": now + window}
        return

    entry["count"] += 1
    if entry["count"] > limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {limit} requests per hour. Upgrade your plan for higher limits.",
        )


# ---------------------------------------------------------------------------
# Auth helper — Bearer afx_live_... → user_id
# ---------------------------------------------------------------------------
def _authenticate_bearer(authorization: str | None = Header(default=None)) -> str:
    """Validate Bearer token and return user_id.

    Missing credentials are an authentication failure (401), not a request
    validation failure (422). The `WWW-Authenticate` header makes that explicit.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:].strip()  # strip "Bearer "
    if not token.startswith("afx_live_"):
        raise HTTPException(
            status_code=401,
            detail="Invalid API key format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    key_hash = hashlib.sha256(token.encode()).hexdigest()

    result = (
        db()
        .table("api_keys")
        .select("id, user_id, revoked")
        .eq("key_hash", key_hash)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    key_row = result.data[0]
    if key_row.get("revoked"):
        raise HTTPException(
            status_code=401,
            detail="API key has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Best-effort telemetry: a transient write failure must not reject an
    # otherwise valid API key.
    try:
        db().table("api_keys").update(
            {"last_used_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", key_row["id"]).execute()
    except Exception:
        logger.warning("Failed to update last_used_at for API key %s", key_row.get("id"), exc_info=True)

    return key_row["user_id"]


def _get_user_repos(user_id: str) -> list[str]:
    """Get list of repo IDs for this user."""
    result = db().table("repos").select("id").eq("user_id", user_id).execute()
    return [r["id"] for r in (result.data or [])]


def _get_user_plan(user_id: str) -> str:
    result = db().table("users").select("plan_status").eq("id", user_id).limit(1).execute()
    if result.data:
        return result.data[0].get("plan_status", "trial")
    return "trial"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class PaginatedResponse(BaseModel):
    total: int
    page: int
    per_page: int


class DetectionsResponse(PaginatedResponse):
    detections: list[dict]


class AlertsResponse(PaginatedResponse):
    alerts: list[dict]


class FixesResponse(PaginatedResponse):
    fixes: list[dict]


class ApiKeyOut(BaseModel):
    id: str
    key_prefix: str
    created_at: str
    last_used_at: Optional[str] = None
    revoked: bool


class ApiKeyCreateResponse(BaseModel):
    id: str
    key: str
    key_prefix: str


class PublicRepoOut(BaseModel):
    id: str
    full_name: str
    default_branch: Optional[str] = None
    connected_at: Optional[str] = None


# ---------------------------------------------------------------------------
# GET /detections
# ---------------------------------------------------------------------------
@router.get("/detections", response_model=DetectionsResponse)
def list_detections(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user_id: str = Depends(_authenticate_bearer),
):
    plan = _get_user_plan(user_id)
    _check_rate_limit(user_id, _get_rate_limit(user_id))

    repo_ids = _get_user_repos(user_id)
    if not repo_ids:
        return DetectionsResponse(detections=[], total=0, page=page, per_page=per_page)

    offset = (page - 1) * per_page

    # Count total
    count_result = (
        db().table("api_detections")
        .select("id", count="exact")
        .in_("repo_id", repo_ids)
        .execute()
    )
    total = count_result.count or 0

    # Fetch page
    result = (
        db().table("api_detections")
        .select("*")
        .in_("repo_id", repo_ids)
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    return DetectionsResponse(
        detections=result.data or [],
        total=total,
        page=page,
        per_page=per_page,
    )


# ---------------------------------------------------------------------------
# GET /alerts
# ---------------------------------------------------------------------------
@router.get("/alerts", response_model=AlertsResponse)
def list_alerts(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    severity: Optional[str] = None,
    repo_id: Optional[str] = None,
    api_name: Optional[str] = None,
    user_id: str = Depends(_authenticate_bearer),
):
    plan = _get_user_plan(user_id)
    _check_rate_limit(user_id, _get_rate_limit(user_id))

    repo_ids = _get_user_repos(user_id)
    if not repo_ids:
        return AlertsResponse(alerts=[], total=0, page=page, per_page=per_page)

    query = db().table("alerts").select("id", count="exact").in_("repo_id", repo_ids)
    if severity:
        query = query.eq("severity", severity)
    if repo_id:
        if repo_id not in repo_ids:
            return AlertsResponse(alerts=[], total=0, page=page, per_page=per_page)
        query = query.eq("repo_id", repo_id)
    if api_name:
        # alerts have a `provider` column (not api_name) — filter on it.
        # `api_name` is kept as a backward-compatible alias for `provider`.
        query = query.ilike("provider", f"%{api_name}%")

    count_result = query.execute()
    total = count_result.count or 0

    offset = (page - 1) * per_page
    data_query = db().table("alerts").select("*").in_("repo_id", repo_ids)
    if severity:
        data_query = data_query.eq("severity", severity)
    if repo_id:
        data_query = data_query.eq("repo_id", repo_id)
    if api_name:
        data_query = data_query.ilike("provider", f"%{api_name}%")

    result = data_query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    return AlertsResponse(
        alerts=result.data or [],
        total=total,
        page=page,
        per_page=per_page,
    )


# ---------------------------------------------------------------------------
# GET /fixes
# ---------------------------------------------------------------------------
@router.get("/fixes", response_model=FixesResponse)
def list_fixes(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user_id: str = Depends(_authenticate_bearer),
):
    plan = _get_user_plan(user_id)
    _check_rate_limit(user_id, _get_rate_limit(user_id))

    repo_ids = _get_user_repos(user_id)
    if not repo_ids:
        return FixesResponse(fixes=[], total=0, page=page, per_page=per_page)

    offset = (page - 1) * per_page

    count_result = (
        db().table("fixes")
        .select("id", count="exact")
        .in_("repo_id", repo_ids)
        .execute()
    )
    total = count_result.count or 0

    result = (
        db().table("fixes")
        .select("*")
        .in_("repo_id", repo_ids)
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    return FixesResponse(
        fixes=result.data or [],
        total=total,
        page=page,
        per_page=per_page,
    )


# ---------------------------------------------------------------------------
# Connected repositories (CLI + integrations)
# ---------------------------------------------------------------------------
@router.get("/repos", response_model=list[PublicRepoOut])
def list_connected_repos(user_id: str = Depends(_authenticate_bearer)):
    _check_rate_limit(user_id, _get_rate_limit(user_id))

    result = (
        db()
        .table("repos")
        .select("id, full_name, default_branch, connected_at")
        .eq("user_id", user_id)
        .order("connected_at", desc=True)
        .execute()
    )
    return [
        PublicRepoOut(
            id=row["id"],
            full_name=row["full_name"],
            default_branch=row.get("default_branch"),
            connected_at=row.get("connected_at"),
        )
        for row in (result.data or [])
    ]


@router.post("/repos/{repo_id}/scan", response_model=ScanResultOut)
def scan_connected_repo(repo_id: str, user_id: str = Depends(_authenticate_bearer)):
    _check_rate_limit(user_id, _get_rate_limit(user_id))
    from .repos import scan_repo as private_scan

    # `scan_repo` enforces ownership and plan limits itself; we only
    # authenticate the API key and apply the public API rate limit here.
    return private_scan(repo_id=repo_id, user_id=user_id)


# ---------------------------------------------------------------------------
# API Key management
# ---------------------------------------------------------------------------
@router.get("/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(user_id: str = Depends(get_current_user_id)):
    result = (
        db().table("api_keys")
        .select("id, key_prefix, created_at, last_used_at, revoked")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/api-keys", response_model=ApiKeyCreateResponse)
def create_api_key(user_id: str = Depends(get_current_user_id)):
    raw_key = "afx_live_" + secrets.token_urlsafe(30)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:16] + "..."

    result = (
        db().table("api_keys")
        .insert({
            "user_id": user_id,
            "key_hash": key_hash,
            "key_prefix": key_prefix,
        })
        .execute()
    )

    return ApiKeyCreateResponse(
        id=result.data[0]["id"],
        key=raw_key,
        key_prefix=key_prefix,
    )


@router.delete("/api-keys/{key_id}")
def revoke_api_key(key_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        db().table("api_keys")
        .update({"revoked": True})
        .eq("id", key_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "revoked"}
