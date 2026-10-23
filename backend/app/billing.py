"""Stripe Billing integration for Breaklytix SaaS subscriptions.

This module handles:
- Creating Stripe Checkout sessions for plan upgrades
- Managing Stripe Billing Portal sessions
- Processing Stripe webhook events (idempotent)
- Syncing subscription state to our database
- Plan limit enforcement
"""
from __future__ import annotations

import stripe
import uuid
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

from .config import settings
from .db import db

# Initialize Stripe client
stripe.api_key = settings.stripe_secret_key

PLAN_PRICE_MAP = {
    "starter": settings.stripe_price_starter,
    "growth": settings.stripe_price_growth,
    "enterprise": settings.stripe_price_enterprise,
}

PLAN_LIMITS = settings.plan_limits

# Every brand-new user gets TRIAL_DAYS of UNLIMITED everything (no API cap),
# after which the standard plan limits apply until they subscribe.
TRIAL_DAYS = 10


def _trial_ends_at(created_at: str | None) -> str | None:
    """ISO-8601 end of the 10-day trial, or None when created_at is unusable."""
    if not created_at:
        return None
    try:
        dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return (dt + timedelta(days=TRIAL_DAYS)).isoformat()


def in_unlimited_trial(created_at: str | None, has_subscription: bool) -> bool:
    """True while a user is inside the 10-day unlimited trial window.

    Users who never subscribed get unlimited monitored APIs for TRIAL_DAYS
    from account creation; paid subscribers are governed by their plan.
    """
    if has_subscription:
        return False
    end = _trial_ends_at(created_at)
    if not end:
        return False
    try:
        return datetime.now(timezone.utc) < datetime.fromisoformat(end)
    except ValueError:
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Checkout Session
# ---------------------------------------------------------------------------
def create_checkout_session(
    user_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
    customer_email: str | None = None,
) -> tuple[str, str]:
    """Create a Stripe Checkout session for subscription upgrade.

    Returns (session_id, checkout_url).
    """
    price_id = PLAN_PRICE_MAP.get(plan)
    if not price_id:
        raise ValueError(f"Unknown plan: {plan}")

    # Get or create Stripe customer
    user = db().table("users").select("stripe_customer_id, email").eq("id", user_id).limit(1).execute()
    if not user.data:
        raise ValueError("User not found")
    user = user.data[0]

    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        customer = stripe.Customer.create(
            email=customer_email or user["email"],
            metadata={"autofix_user_id": user_id},
        )
        customer_id = customer.id
        db().table("users").update({"stripe_customer_id": customer_id}).eq("id", user_id).execute()

    # Append the Stripe placeholder without corrupting an existing query
    # string (the old `+ "?session_id=..."` produced two `?` characters).
    parts = urlsplit(success_url)
    query = parts.query + ("&" if parts.query else "") + "session_id={CHECKOUT_SESSION_ID}"
    checkout_success_url = urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))

    # Create checkout session
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=checkout_success_url,
        cancel_url=cancel_url,
        metadata={
            "autofix_user_id": user_id,
            "plan": plan,
        },
        subscription_data={
            "metadata": {
                "autofix_user_id": user_id,
                "plan": plan,
            }
        },
    )
    return session.id, session.url


# ---------------------------------------------------------------------------
# Billing Portal
# ---------------------------------------------------------------------------
def create_billing_portal_session(user_id: str, return_url: str) -> str:
    """Create a Stripe Billing Portal session for customer self-service."""
    user = db().table("users").select("stripe_customer_id").eq("id", user_id).limit(1).execute()
    if not user.data or not user.data[0].get("stripe_customer_id"):
        raise ValueError("No Stripe customer found for user")

    customer_id = user.data[0]["stripe_customer_id"]
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


# ---------------------------------------------------------------------------
# Webhook Event Processing (idempotent)
# ---------------------------------------------------------------------------
def process_stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """Verify and process a Stripe webhook event. Returns processing result."""
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise ValueError(f"Webhook signature verification failed: {exc}")

    # Idempotency check
    existing = (
        db()
        .table("stripe_webhook_events")
        .select("id")
        .eq("stripe_event_id", event.id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return {"status": "already_processed", "event_id": event.id}

    # Claim the event for idempotency. If the handler fails, remove the claim
    # so Stripe's retry is processed again; the old flow committed the claim
    # before handling and silently turned every retry into "already_processed".
    db().table("stripe_webhook_events").insert({
        "stripe_event_id": event.id,
        "event_type": event.type,
        "payload": event.to_dict(),
    }).execute()

    try:
        result = _handle_stripe_event(event)
    except Exception:
        try:
            db().table("stripe_webhook_events").delete().eq(
                "stripe_event_id", event.id
            ).execute()
        except Exception:
            pass
        raise

    return {"status": "processed", "event_id": event.id, "result": result}


def _handle_stripe_event(event: stripe.Event) -> dict:
    """Route event to appropriate handler based on type."""
    handlers = {
        "checkout.session.completed": _handle_checkout_completed,
        "customer.subscription.updated": _handle_subscription_updated,
        "customer.subscription.deleted": _handle_subscription_deleted,
        "invoice.payment_failed": _handle_payment_failed,
    }

    handler = handlers.get(event.type)
    if handler:
        return handler(event.data.object)
    return {"action": "ignored", "event_type": event.type}


def _handle_checkout_completed(session: stripe.checkout.Session) -> dict:
    """Handle successful checkout - subscription created."""
    user_id = session.metadata.get("autofix_user_id")
    plan = session.metadata.get("plan")
    subscription_id = session.subscription

    if not user_id or not plan:
        return {"action": "skipped", "reason": "missing metadata"}

    # Get subscription details
    subscription = stripe.Subscription.retrieve(subscription_id)
    current_period_end = datetime.fromtimestamp(
        subscription.current_period_end, tz=timezone.utc
    ).date()

    # Update user with subscription info
    limit = PLAN_LIMITS.get(plan, 10)
    db().table("users").update({
        "stripe_subscription_id": subscription_id,
        "plan_status": "active",
        "monitored_api_limit": limit,
    }).eq("id", user_id).execute()

    # Initialize plan_usage for current billing period
    period_start = datetime.fromtimestamp(
        subscription.current_period_start, tz=timezone.utc
    ).date()
    period_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{period_start.isoformat()}")
    db().table("plan_usage").upsert({
        "id": str(period_id),
        "user_id": user_id,
        "monitored_api_count": 0,
        "billing_period_start": period_start.isoformat(),
        "billing_period_end": current_period_end.isoformat(),
    }, on_conflict="id").execute()

    return {
        "action": "subscription_created",
        "user_id": user_id,
        "plan": plan,
        "subscription_id": subscription_id,
    }


def _handle_subscription_updated(subscription: stripe.Subscription) -> dict:
    """Handle subscription updates (plan change, renewal, etc.)."""
    user_id = subscription.metadata.get("autofix_user_id")
    plan = subscription.metadata.get("plan")

    if not user_id:
        # Try to find user by customer
        customer_id = subscription.customer
        user = db().table("users").select("id").eq("stripe_customer_id", customer_id).limit(1).execute()
        if user.data:
            user_id = user.data[0]["id"]
        else:
            return {"action": "skipped", "reason": "user not found"}

    if not plan:
        # Infer plan from price
        price_id = subscription.items.data[0].price.id if subscription.items.data else None
        plan = next((k for k, v in PLAN_PRICE_MAP.items() if v == price_id), "starter")

    status = subscription.status
    if status == "past_due":
        plan_status = "past_due"
    elif status == "canceled":
        plan_status = "canceled"
    else:
        plan_status = "active"

    limit = PLAN_LIMITS.get(plan, 10) if plan_status == "active" else 0

    current_period_end = datetime.fromtimestamp(
        subscription.current_period_end, tz=timezone.utc
    ).date()
    cancel_at_period_end = subscription.cancel_at_period_end

    db().table("users").update({
        "plan_status": plan_status,
        "monitored_api_limit": limit,
    }).eq("id", user_id).execute()

    # Update plan_usage period end
    period_start = datetime.fromtimestamp(
        subscription.current_period_start, tz=timezone.utc
    ).date()
    period_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{period_start.isoformat()}")
    db().table("plan_usage").upsert({
        "id": str(period_id),
        "user_id": user_id,
        "billing_period_start": period_start.isoformat(),
        "billing_period_end": current_period_end.isoformat(),
    }, on_conflict="id").execute()

    return {
        "action": "subscription_updated",
        "user_id": user_id,
        "plan": plan,
        "status": plan_status,
        "limit": limit,
        "cancel_at_period_end": cancel_at_period_end,
    }


def _handle_subscription_deleted(subscription: stripe.Subscription) -> dict:
    """Handle subscription cancellation."""
    user_id = subscription.metadata.get("autofix_user_id")
    if not user_id:
        customer_id = subscription.customer
        user = db().table("users").select("id").eq("stripe_customer_id", customer_id).limit(1).execute()
        if user.data:
            user_id = user.data[0]["id"]
        else:
            return {"action": "skipped", "reason": "user not found"}

    db().table("users").update({
        "plan_status": "canceled",
        "monitored_api_limit": 0,
        "stripe_subscription_id": None,
    }).eq("id", user_id).execute()

    return {"action": "subscription_canceled", "user_id": user_id}


def _handle_payment_failed(invoice: stripe.Invoice) -> dict:
    """Handle failed payment."""
    customer_id = invoice.customer
    user = db().table("users").select("id").eq("stripe_customer_id", customer_id).limit(1).execute()
    if not user.data:
        return {"action": "skipped", "reason": "user not found"}

    user_id = user.data[0]["id"]
    db().table("users").update({"plan_status": "past_due"}).eq("id", user_id).execute()

    return {"action": "payment_failed", "user_id": user_id}


# ---------------------------------------------------------------------------
# Plan Limit Enforcement
# ---------------------------------------------------------------------------
def get_user_plan_info(user_id: str) -> dict | None:
    """Get user's current plan status and usage."""
    user = db().table("users").select(
        "plan_status, monitored_api_limit, stripe_subscription_id, created_at"
    ).eq("id", user_id).limit(1).execute()
    if not user.data:
        return None
    user = user.data[0]

    # Effective API limit: -1 (unlimited) during the 10-day trial window,
    # otherwise the plan's stored limit.
    stored_limit = user.get("monitored_api_limit", 10)
    if in_unlimited_trial(
        user.get("created_at"), bool(user.get("stripe_subscription_id"))
    ):
        limit = -1
        trial_ends_at = _trial_ends_at(user.get("created_at"))
    else:
        limit = stored_limit if stored_limit is not None else 10
        trial_ends_at = None

    # Get current period usage
    today = date.today()
    usage = (
        db()
        .table("plan_usage")
        .select("monitored_api_count, billing_period_start, billing_period_end")
        .eq("user_id", user_id)
        .lte("billing_period_start", today.isoformat())
        .gte("billing_period_end", today.isoformat())
        .limit(1)
        .execute()
    )
    count = usage.data[0]["monitored_api_count"] if usage.data else 0

    return {
        "plan_status": user.get("plan_status", "trial"),
        "monitored_api_limit": limit,
        "monitored_api_count": count,
        "stripe_subscription_id": user.get("stripe_subscription_id"),
        "trial_ends_at": trial_ends_at,
    }


def get_subscription_billing_period(user_id: str) -> tuple[str | None, bool]:
    """Return (current_period_end_iso, cancel_at_period_end) from Stripe.

    Honest reporting: when the user has no subscription or Stripe is
    unreachable, returns (None, False) — the dashboard then shows no
    active period instead of fabricated values.
    """
    info = get_user_plan_info(user_id)
    if not info:
        return None, False
    subscription_id = info.get("stripe_subscription_id")
    if not subscription_id:
        return None, False
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        period_end = datetime.fromtimestamp(
            subscription.current_period_end, tz=timezone.utc
        ).isoformat()
        return period_end, bool(subscription.cancel_at_period_end)
    except Exception:
        # Log server-side; the caller must not leak Stripe internals.
        import logging
        logging.getLogger("billing").exception(
            "get_subscription_billing_period failed for user %s", user_id
        )
        return None, False


def check_plan_limit(user_id: str, additional_apis: int = 1) -> tuple[bool, str | None]:
    """Check if user can monitor more APIs. Returns (allowed, error_message)."""
    info = get_user_plan_info(user_id)
    if not info:
        return False, "User not found"

    limit = info["monitored_api_limit"]
    if limit == -1:  # unlimited
        return True, None

    current = info["monitored_api_count"]
    if current + additional_apis > limit:
        return False, (
            f"Plan limit reached: {current}/{limit} APIs monitored. "
            f"Upgrade your plan to monitor more APIs."
        )
    return True, None


def increment_api_count(user_id: str, count: int = 1) -> None:
    """Increment the monitored API count for the current billing period."""
    today = date.today()
    usage = (
        db()
        .table("plan_usage")
        .select("id, monitored_api_count")
        .eq("user_id", user_id)
        .lte("billing_period_start", today.isoformat())
        .gte("billing_period_end", today.isoformat())
        .limit(1)
        .execute()
    )
    if usage.data:
        new_count = usage.data[0]["monitored_api_count"] + count
        db().table("plan_usage").update({
            "monitored_api_count": new_count,
            "updated_at": _now_iso(),
        }).eq("id", usage.data[0]["id"]).execute()
    else:
        # No usage row for current period - create one (shouldn't happen normally)
        user = db().table("users").select("plan_status").eq("id", user_id).limit(1).execute()
        if user.data:
            period_start = today.replace(day=1)
            # Approximate end of month
            if period_start.month == 12:
                period_end = period_start.replace(year=period_start.year + 1, month=1, day=1)
            else:
                period_end = period_start.replace(month=period_start.month + 1, day=1)
            db().table("plan_usage").insert({
                "user_id": user_id,
                "monitored_api_count": count,
                "billing_period_start": period_start.isoformat(),
                "billing_period_end": period_end.isoformat(),
            }).execute()