"""Paddle Billing integration for Breaklytix SaaS subscriptions.

Paddle is a merchant of record: it handles tax, refunds and compliance, which
is what makes it usable from Pakistan (Stripe does not onboard Pakistan-based
entities). This module mirrors the Stripe adapter's shape so the router can
dispatch between providers behind ``PAYMENT_PROVIDER``.

This module handles:
- Creating Paddle customers + transactions (checkout URL)
- Managing Paddle customer portal sessions
- Processing Paddle webhook notifications (idempotent, signature verified)
- Syncing subscription state to our database
- Plan limit enforcement (shared with the Stripe path)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import settings
from .config import settings
from .db import db

logger = logging.getLogger("paddle_billing")

PLAN_LIMITS = settings.plan_limits


class PaddleNotConfigured(RuntimeError):
    """Paddle is not configured on this deployment."""


def paddle_price_map() -> dict[str, str]:
    return {
        "starter": settings.paddle_price_starter,
        "growth": settings.paddle_price_growth,
        "enterprise": settings.paddle_price_enterprise,
    }


def missing_paddle_config() -> list[str]:
    missing: list[str] = []
    if not settings.paddle_api_key:
        missing.append("PADDLE_API_KEY")
    if not settings.paddle_webhook_secret:
        missing.append("PADDLE_WEBHOOK_SECRET")
    prices = paddle_price_map()
    if not any(prices.values()):
        missing.append("PADDLE_PRICE_STARTER/GROWTH/ENTERPRISE")
    if settings.paddle_environment not in ("sandbox", "production"):
        missing.append("PADDLE_ENVIRONMENT")
    return missing


def _paddle_base_url() -> str:
    env = (settings.paddle_environment or "sandbox").lower()
    if env == "production":
        return "https://api.paddle.com"
    return "https://sandbox-api.paddle.com"


def _require_paddle() -> None:
    if not settings.paddle_api_key:
        raise PaddleNotConfigured("Billing is not configured: PADDLE_API_KEY is missing")
    if not settings.paddle_webhook_secret:
        # Webhook secret is only required for webhook verification, not checkout.
        pass


def _request(method: str, path: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
    """Low-level Paddle API call. Tests patch this to avoid the network."""
    url = _paddle_base_url() + path
    headers = {
        "Authorization": f"Bearer {settings.paddle_api_key}",
        "Content-Type": "application/json",
    }
    resp = httpx.request(method, url, json=json, headers=headers, timeout=30.0)
    if resp.status_code >= 400:
        raise RuntimeError(f"Paddle API {method} {path} failed: {resp.status_code} {resp.text}")
    return resp.json()


def _trial_ends_at(created_at: str | None) -> str | None:
    from datetime import datetime, timedelta, timezone

    if not created_at:
        return None
    try:
        dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return (dt + timedelta(days=10)).isoformat()


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
def _get_or_create_paddle_customer(user_id: str, email: str | None) -> str:
    user = db().table("users").select("paddle_customer_id, email").eq("id", user_id).limit(1).execute()
    if not user.data:
        raise ValueError("User not found")
    row = user.data[0]
    customer_id = row.get("paddle_customer_id")
    if customer_id:
        return customer_id

    payload: dict[str, Any] = {"email": email or row.get("email")}
    resp = _request("POST", "/customers", json=payload)
    customer_id = resp["data"]["id"]
    db().table("users").update({"paddle_customer_id": customer_id}).eq("id", user_id).execute()
    return customer_id


# ---------------------------------------------------------------------------
# Checkout (transaction)
# ---------------------------------------------------------------------------
def create_paddle_checkout(
    user_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
    customer_email: str | None = None,
) -> tuple[str, str]:
    """Create a Paddle transaction and return (transaction_id, checkout_url)."""
    if plan not in PLAN_LIMITS:
        raise ValueError(f"Unknown plan: {plan}")

    price_id = paddle_price_map().get(plan)
    if not price_id:
        raise ValueError(f"Plan '{plan}' is not available for purchase")

    if not settings.paddle_api_key:
        raise PaddleNotConfigured("Billing is not configured: PADDLE_API_KEY is missing")

    customer_id = _get_or_create_paddle_customer(user_id, customer_email)

    frontend_base = (settings.frontend_base_url or "").rstrip("/")
    checkout_url_target = f"{frontend_base}/checkout" if frontend_base else "/checkout"

    payload = {
        "items": [{"price_id": price_id, "quantity": 1}],
        "customer_id": customer_id,
        "custom_data": {
            "autofix_user_id": user_id,
            "plan": plan,
        },
        "checkout": {"url": checkout_url_target},
    }

    resp = _request("POST", "/transactions", json=payload)
    txn = resp["data"]
    txn_id = txn["id"]
    checkout_url = (txn.get("checkout") or {}).get("url")
    if not checkout_url:
        raise RuntimeError("Paddle did not return a checkout URL")
    return txn_id, checkout_url


# ---------------------------------------------------------------------------
# Portal
# ---------------------------------------------------------------------------
def create_paddle_portal_session(user_id: str, return_url: str) -> str:
    if not settings.paddle_api_key:
        raise PaddleNotConfigured("Billing is not configured: PADDLE_API_KEY is missing")

    user = db().table("users").select("paddle_customer_id, paddle_subscription_id").eq("id", user_id).limit(1).execute()
    if not user.data or not user.data[0].get("paddle_customer_id"):
        raise ValueError("No Paddle customer found for user")

    customer_id = user.data[0]["paddle_customer_id"]
    sub_id = user.data[0].get("paddle_subscription_id")

    body: dict[str, Any] = {}
    if sub_id:
        body["subscription_ids"] = [sub_id]

    resp = _request("POST", f"/customers/{customer_id}/portal-sessions", json=body)
    urls = (resp.get("data") or {}).get("urls") or {}
    general = urls.get("general") or {}
    url = general.get("overview")
    if not url:
        # Fallback: first subscription link
        subs = urls.get("subscriptions") or []
        if subs:
            url = subs[0].get("view_subscription")
    if not url:
        raise RuntimeError("Paddle did not return a portal URL")
    return url


# ---------------------------------------------------------------------------
# Webhook verification + processing
# ---------------------------------------------------------------------------
def _verify_paddle_signature(payload: bytes, sig_header: str) -> None:
    if not settings.paddle_webhook_secret:
        raise PaddleNotConfigured("Billing is not configured: PADDLE_WEBHOOK_SECRET is missing")

    # Parse "ts=...;h1=..."
    ts_value = None
    h1_value = None
    for part in sig_header.split(";"):
        part = part.strip()
        if part.startswith("ts="):
            ts_value = part[3:]
        elif part.startswith("h1="):
            h1_value = part[3:]

    if not ts_value or not h1_value:
        raise ValueError("Invalid Paddle-Signature header")

    try:
        ts_int = int(ts_value)
    except ValueError:
        raise ValueError("Invalid Paddle-Signature timestamp")

    if abs(time.time() - ts_int) > 5:
        raise ValueError("Paddle webhook timestamp outside tolerance")

    signed = f"{ts_value}:{payload.decode('utf-8', errors='replace')}"
    expected = hmac.new(
        settings.paddle_webhook_secret.encode("utf-8"),
        signed.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, h1_value):
        raise ValueError("Paddle webhook signature verification failed")


def process_paddle_webhook(payload: bytes, sig_header: str) -> dict:
    if not settings.paddle_webhook_secret:
        raise PaddleNotConfigured("Billing is not configured: PADDLE_WEBHOOK_SECRET is missing")

    _verify_paddle_signature(payload, sig_header)

    import json as _json

    try:
        event = _json.loads(payload.decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Invalid webhook payload: {exc}")

    event_id = event.get("notification_id") or event.get("event_id")
    event_type = event.get("event_type")
    data = event.get("data") or {}

    if not event_id:
        raise ValueError("Webhook payload missing notification_id")

    # Idempotency check
    existing = (
        db()
        .table("paddle_webhook_events")
        .select("id")
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return {"status": "already_processed", "event_id": event_id}

    db().table("paddle_webhook_events").insert({
        "event_id": event_id,
        "event_type": event_type,
        "payload": event,
    }).execute()

    try:
        result = _handle_paddle_event(event_type, data)
    except Exception:
        try:
            db().table("paddle_webhook_events").delete().eq("event_id", event_id).execute()
        except Exception:
            pass
        raise

    return {"status": "processed", "event_id": event_id, "result": result}


def _find_user_for_paddle_subscription(data: dict[str, Any]) -> str | None:
    custom = data.get("custom_data") or {}
    user_id = custom.get("autofix_user_id")
    if user_id:
        return user_id

    customer_id = data.get("customer_id")
    if customer_id:
        user = db().table("users").select("id").eq("paddle_customer_id", customer_id).limit(1).execute()
        if user.data:
            return user.data[0]["id"]
    return None


def _map_paddle_status(status: str | None) -> str:
    status = (status or "").lower()
    if status in ("active", "trialing"):
        return "active"
    if status == "past_due":
        return "past_due"
    # paused / canceled / anything unknown â†’ no access
    return "canceled"


def _plan_from_paddle_subscription(data: dict[str, Any]) -> str | None:
    # Price id is the source of truth.
    items = data.get("items") or []
    price_id = None
    if items:
        first = items[0] or {}
        price = first.get("price") or {}
        price_id = price.get("id") or first.get("price_id")
    if price_id:
        for k, v in paddle_price_map().items():
            if v and v == price_id:
                return k
    custom = data.get("custom_data") or {}
    plan = custom.get("plan")
    if plan in PLAN_LIMITS:
        return plan
    return None


def _handle_paddle_subscription(data: dict[str, Any]) -> dict:
    user_id = _find_user_for_paddle_subscription(data)
    if not user_id:
        return {"action": "skipped", "reason": "user not found"}

    sub_id = data.get("id")
    status = data.get("status")
    plan_status = _map_paddle_status(status)

    plan = _plan_from_paddle_subscription(data)

    limit: int | None
    if plan_status == "canceled":
        limit = 0
    elif plan_status == "active" and plan in PLAN_LIMITS:
        limit = PLAN_LIMITS[plan]
    elif plan_status == "past_due":
        limit = None
    else:
        limit = None

    update: dict[str, Any] = {"plan_status": plan_status}
    if sub_id:
        if plan_status == "canceled":
            update["paddle_subscription_id"] = None
        else:
            update["paddle_subscription_id"] = sub_id
    if limit is not None:
        update["monitored_api_limit"] = limit

    db().table("users").update(update).eq("id", user_id).execute()

    # Period tracking
    period = data.get("current_billing_period") or {}
    starts_at = period.get("starts_at")
    ends_at = period.get("ends_at")
    if starts_at and ends_at:
        try:
            period_start = datetime.fromisoformat(str(starts_at).replace("Z", "+00:00")).date()
            period_end = datetime.fromisoformat(str(ends_at).replace("Z", "+00:00")).date()
            period_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{period_start.isoformat()}")
            db().table("plan_usage").upsert({
                "id": str(period_id),
                "user_id": user_id,
                "billing_period_start": period_start.isoformat(),
                "billing_period_end": period_end.isoformat(),
            }, on_conflict="id").execute()
        except (ValueError, TypeError):
            pass

    return {
        "action": "subscription_updated",
        "user_id": user_id,
        "plan": plan,
        "status": plan_status,
        "limit": limit,
    }


def _handle_paddle_event(event_type: str | None, data: dict[str, Any]) -> dict:
    event_type = event_type or ""
    if event_type.startswith("subscription."):
        return _handle_paddle_subscription(data)
    if event_type == "transaction.completed":
        # Fulfillment: if a subscription is attached, the subscription event
        # will carry the entitlement; here we just record nothing extra.
        sub_id = data.get("subscription_id")
        if sub_id:
            return {"action": "transaction_completed", "subscription_id": sub_id}
        return {"action": "transaction_completed", "one_off": True}
    return {"action": "ignored", "event_type": event_type}


# ---------------------------------------------------------------------------
# Billing period lookup (used by dashboard)
# ---------------------------------------------------------------------------
def get_paddle_subscription_billing_period(user_id: str) -> tuple[str | None, bool]:
    user = db().table("users").select("paddle_subscription_id").eq("id", user_id).limit(1).execute()
    if not user.data or not user.data[0].get("paddle_subscription_id"):
        return None, False
    sub_id = user.data[0]["paddle_subscription_id"]
    if not settings.paddle_api_key:
        return None, False
    try:
        resp = _request("GET", f"/subscriptions/{sub_id}")
        data = resp.get("data") or {}
        period = data.get("current_billing_period") or {}
        ends_at = period.get("ends_at")
        if not ends_at:
            return None, False
        iso = datetime.fromisoformat(str(ends_at).replace("Z", "+00:00")).isoformat()
        scheduled = data.get("scheduled_change") or {}
        cancel_at = scheduled.get("action") == "cancel"
        return iso, bool(cancel_at)
    except Exception:
        logger.exception("get_paddle_subscription_billing_period failed for user %s", user_id)
        return None, False
