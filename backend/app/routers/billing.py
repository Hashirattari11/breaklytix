"""Billing routes: Stripe Checkout, Billing Portal, and webhook handling."""
from __future__ import annotations

import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel

from ..billing import (
    BillingNotConfigured,
    create_checkout_session,
    create_billing_portal_session,
    process_stripe_webhook,
    check_plan_limit,
    get_user_plan_info,
    get_subscription_billing_period,
)
from ..db import db
from ..deps import get_current_user_id
from ..schemas import (
    CheckoutSessionIn,
    CheckoutSessionOut,
    BillingPortalOut,
    BillingStatusOut,
)

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger("billing")


def _frontend_base() -> str:
    from ..config import settings
    base = (settings.frontend_base_url or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=500, detail="FRONTEND_BASE_URL is not configured")
    return base


def _validated_return_url(candidate: str, *, field: str) -> str:
    """Only allow Stripe redirects back to a configured frontend origin.

    An authenticated user could otherwise pass an arbitrary success_url and
    turn Checkout into an open redirect (and receive the session id there).
    """
    from ..config import settings
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} is not a valid URL")
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail=f"{field} must be an http(s) frontend URL")

    origin = f"{parsed.scheme}://{parsed.netloc}".lower()
    allowed: set[str] = set()
    if settings.frontend_base_url:
        base = urlsplit(settings.frontend_base_url)
        if base.scheme and base.netloc:
            allowed.add(f"{base.scheme}://{base.netloc}".lower())
    for configured in settings.cors_origins:
        configured = configured.strip().rstrip("/")
        if configured and "*" not in configured:
            allowed.add(configured.lower())
    if origin not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{field} must point to the Breaklytix frontend",
        )
    return candidate


# ---------------------------------------------------------------------------
# Checkout Session
# ---------------------------------------------------------------------------
@router.post("/create-checkout-session", response_model=CheckoutSessionOut)
def create_checkout(body: CheckoutSessionIn, user_id: str = Depends(get_current_user_id)) -> CheckoutSessionOut:
    """Create a Stripe Checkout session for the selected plan."""
    if body.plan not in ("starter", "growth", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid plan")

    # Get user email for Stripe customer
    user = db().table("users").select("email").eq("id", user_id).limit(1).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")

    success_url = _validated_return_url(body.success_url, field="success_url")
    cancel_url = _validated_return_url(body.cancel_url, field="cancel_url")

    try:
        session_id, url = create_checkout_session(
            user_id=user_id,
            plan=body.plan,
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=user.data[0]["email"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except BillingNotConfigured as exc:
        logger.warning("billing not configured: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Payments are not available yet. Please contact support@breaklytix.site.",
        )
    except Exception:
        logger.exception("create-checkout-session failed for user %s", user_id)
        raise HTTPException(status_code=502, detail="Billing service error")

    return CheckoutSessionOut(session_id=session_id, url=url)


# ---------------------------------------------------------------------------
# Billing Portal
# ---------------------------------------------------------------------------
@router.get("/portal", response_model=BillingPortalOut)
def billing_portal(user_id: str = Depends(get_current_user_id)) -> BillingPortalOut:
    """Generate a Stripe Billing Portal session for the current user."""
    # Canonical frontend base (not the first CORS origin, which may be localhost).
    return_url = f"{_frontend_base()}/dashboard/billing"

    try:
        url = create_billing_portal_session(user_id, return_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except BillingNotConfigured as exc:
        logger.warning("billing not configured: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Payments are not available yet. Please contact support@breaklytix.site.",
        )
    except Exception:
        logger.exception("billing-portal failed for user %s", user_id)
        raise HTTPException(status_code=502, detail="Billing service error")

    return BillingPortalOut(url=url)


# ---------------------------------------------------------------------------
# Billing Status (for dashboard)
# ---------------------------------------------------------------------------
@router.get("/status", response_model=BillingStatusOut)
def billing_status(user_id: str = Depends(get_current_user_id)) -> BillingStatusOut:
    """Get current billing status and usage for the dashboard."""
    info = get_user_plan_info(user_id)
    if not info:
        raise HTTPException(status_code=404, detail="User not found")

    # Determine plan name from status/limit
    plan_status = info["plan_status"]
    limit = info["monitored_api_limit"]

    if plan_status == "trial":
        plan = "trial"
    elif limit == 10:
        plan = "starter"
    elif limit == 50:
        plan = "growth"
    elif limit == -1:
        plan = "enterprise"
    else:
        plan = "trial"

    # Honest billing-period fields: derived from the live Stripe subscription
    # when one exists; otherwise we report what we actually know (no period =
    # no active subscription). Never fabricate `None`/False.
    period_end, cancel_at = get_subscription_billing_period(user_id)

    return BillingStatusOut(
        plan=plan,
        plan_status=plan_status,
        monitored_api_limit=limit,
        monitored_api_count=info["monitored_api_count"],
        current_period_end=period_end,
        cancel_at_period_end=cancel_at,
    )


# ---------------------------------------------------------------------------
# Stripe Webhook (no auth - uses Stripe signature)
# ---------------------------------------------------------------------------
class WebhookRequest(BaseModel):
    pass  # We read raw body


@router.post("/webhooks/stripe/billing")
async def stripe_billing_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    """Handle Stripe billing webhooks (checkout, subscription updates, etc.)."""
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    payload = await request.body()
    try:
        result = process_stripe_webhook(payload, stripe_signature)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except BillingNotConfigured as exc:
        logger.error("billing webhook received but billing is not configured: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("stripe billing webhook processing failed")
        raise HTTPException(status_code=500, detail="Webhook processing failed")

    return result