"""Legal consent routes (master pass §2).

GET /auth/consent-status  — current consent state + the versions to agree to.
POST /auth/consent       — record acceptance of the privacy policy + terms.

Safe strategy: existing users with no consent row are NOT hard-locked; the
response flags consent_required so the frontend can show a one-time gate.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..db import db, fetch_one
from ..deps import get_current_user_id, user_is_admin
from ..schemas import ConsentIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# CURRENT versions — bump when legal docs change (must match legal pages).
CURRENT_PRIVACY_VERSION = "2026-09-10"
CURRENT_TERMS_VERSION = "2026-09-10"


def _user_out(user: dict) -> UserOut:
    accepted_at = user.get("legal_consent_accepted_at")
    consent_required = not user.get("legal_consent_version")
    return UserOut(
        id=user["id"],
        email=user["email"],
        github_login=user.get("github_login"),
        plan=user.get("plan", "free"),
        is_admin=user_is_admin(user),
        is_agency=bool(user.get("is_agency", False)),
        notify_daily_status=bool(user.get("notify_daily_status", False)),
        privacy_policy_version=user.get("privacy_policy_version"),
        terms_version=user.get("terms_version"),
        legal_consent_accepted_at=accepted_at,
        consent_required=consent_required,
    )


@router.get("/consent-status", response_model=UserOut)
def consent_status(user_id: str = Depends(get_current_user_id)) -> UserOut:
    """Return the current user's consent state + required version constants."""
    user = fetch_one("users", {"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    out = _user_out(user)
    # The returned model carries the version the user must agree to via these
    # defaults when they haven't accepted yet (consent_required=True).
    return out


@router.post("/consent", response_model=UserOut)
def accept_consent(body: ConsentIn, user_id: str = Depends(get_current_user_id)) -> UserOut:
    """Record acceptance of the privacy policy + terms at the given versions.

    422 unless the submitted versions match the CURRENT ones — the client must
    show the latest legal text before allowing acceptance.
    """
    if body.privacy_policy_version != CURRENT_PRIVACY_VERSION:
        raise HTTPException(
            status_code=422,
            detail=f"Privacy policy version must be {CURRENT_PRIVACY_VERSION!r}",
        )
    if body.terms_version != CURRENT_TERMS_VERSION:
        raise HTTPException(
            status_code=422,
            detail=f"Terms version must be {CURRENT_TERMS_VERSION!r}",
        )

    row = {
        "privacy_policy_version": body.privacy_policy_version,
        "terms_version": body.terms_version,
        "legal_consent_version": f"{body.privacy_policy_version};{body.terms_version}",
        "legal_consent_accepted_at": datetime.now(timezone.utc).isoformat(),
    }
    res = db().table("users").update(row).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to record consent")

    user = res.data[0]
    return _user_out(user)