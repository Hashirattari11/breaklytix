"""Billing tests: configuration guards, webhook idempotency, plan entitlement.

These are offline tests. Stripe is never called: `stripe` is stubbed at the
module boundary, so the suite proves our side of the contract (what we send
Stripe, what we persist when a webhook arrives) without network access.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import billing


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Small fluent fake for the PostgREST-style client used by app.db."""

    def __init__(self, store, table):
        self.store = store
        self.table = table
        self.filters: list[tuple[str, object]] = []
        self.payload = None
        self.action = "select"

    # -- builder -----------------------------------------------------------
    def select(self, *_args):
        self.action = "select"
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
        self.action = "upsert"
        self.payload = payload
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = payload
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def lte(self, *_args):
        return self

    def gte(self, *_args):
        return self

    def limit(self, *_args):
        return self

    # -- execution ---------------------------------------------------------
    def _matches(self, row):
        return all(row.get(column) == value for column, value in self.filters)

    def execute(self):
        rows = self.store.setdefault(self.table, [])
        if self.action == "select":
            return _Resp([row for row in rows if self._matches(row)])
        if self.action == "insert":
            rows.append(dict(self.payload))
            self.store.setdefault("writes", []).append((self.table, "insert", dict(self.payload)))
            return _Resp([self.payload])
        if self.action == "upsert":
            self.store.setdefault("writes", []).append((self.table, "upsert", dict(self.payload)))
            return _Resp([self.payload])
        if self.action == "update":
            self.store.setdefault("writes", []).append((self.table, "update", dict(self.payload)))
            for row in rows:
                if self._matches(row):
                    row.update(self.payload)
            return _Resp([self.payload])
        if self.action == "delete":
            self.store.setdefault("writes", []).append((self.table, "delete", dict(self.filters)))
            self.store[self.table] = [row for row in rows if not self._matches(row)]
            return _Resp([])
        raise AssertionError(f"unexpected action {self.action}")


class _FakeDB:
    def __init__(self, rows: dict[str, list[dict]] | None = None):
        self.rows = {key: [dict(row) for row in value] for key, value in (rows or {}).items()}
        self.writes: list[tuple[str, str, dict]] = []

    def table(self, name):
        return _Query(self.rows, name)

    def writes_for(self, table: str, action: str) -> list[dict]:
        return [payload for tbl, act, payload in self.rows.get("writes", [])
                if tbl == table and act == action]


@pytest.fixture
def fake_db(monkeypatch):
    store = _FakeDB()
    monkeypatch.setattr(billing, "db", lambda: store)
    return store


@pytest.fixture
def stripe_ready(monkeypatch):
    monkeypatch.setattr(billing.settings, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(billing.settings, "stripe_webhook_secret", "whsec_x")
    monkeypatch.setattr(billing.settings, "stripe_price_starter", "price_starter")
    monkeypatch.setattr(billing.settings, "stripe_price_growth", "price_growth")
    monkeypatch.setattr(billing.settings, "stripe_price_enterprise", "price_enterprise")


def _event(event_id="evt_1", event_type="customer.subscription.updated", obj=None):
    return SimpleNamespace(
        id=event_id,
        type=event_type,
        data=SimpleNamespace(object=obj),
        to_dict=lambda: {"id": event_id, "type": event_type},
    )


def _subscription(**overrides):
    base = dict(
        id="sub_1",
        customer="cus_1",
        metadata={"autofix_user_id": "user-1", "plan": "growth"},
        items=SimpleNamespace(data=[SimpleNamespace(price=SimpleNamespace(id="price_growth"))]),
        status="active",
        current_period_start=1_700_000_000,
        current_period_end=1_702_592_000,
        cancel_at_period_end=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ---------------------------------------------------------------------------
# Configuration guards
# ---------------------------------------------------------------------------
def test_checkout_raises_billing_not_configured_without_secret(monkeypatch, stripe_ready):
    monkeypatch.setattr(billing.settings, "stripe_secret_key", "")
    with pytest.raises(billing.BillingNotConfigured):
        billing.create_checkout_session("user-1", "starter", "https://x.test/ok", "https://x.test/no")


def test_checkout_rejects_a_plan_without_a_configured_price(monkeypatch, stripe_ready):
    monkeypatch.setattr(billing.settings, "stripe_price_growth", "")
    with pytest.raises(ValueError, match="not available"):
        billing.create_checkout_session("user-1", "growth", "https://x.test/ok", "https://x.test/no")


def test_missing_config_lists_the_actual_gaps(monkeypatch):
    monkeypatch.setattr(billing.settings, "stripe_secret_key", "")
    monkeypatch.setattr(billing.settings, "stripe_price_starter", "")
    monkeypatch.setattr(billing.settings, "stripe_price_growth", "")
    monkeypatch.setattr(billing.settings, "stripe_price_enterprise", "")
    assert billing.missing_config() == [
        "STRIPE_SECRET_KEY",
        "STRIPE_PRICE_STARTER/GROWTH/ENTERPRISE",
    ]


def test_webhook_raises_billing_not_configured_without_webhook_secret(monkeypatch, stripe_ready):
    monkeypatch.setattr(billing.settings, "stripe_webhook_secret", "")
    with pytest.raises(billing.BillingNotConfigured):
        billing.process_stripe_webhook(b"{}", "sig")


# ---------------------------------------------------------------------------
# Checkout URL construction
# ---------------------------------------------------------------------------
def test_checkout_preserves_an_existing_query_string(monkeypatch, stripe_ready, fake_db):
    fake_db.rows["users"] = [{"id": "user-1", "email": "a@b.test", "stripe_customer_id": "cus_1"}]

    captured = {}

    def _create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id="cs_1", url="https://checkout.stripe.test/cs_1")

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", staticmethod(_create))

    session_id, url = billing.create_checkout_session(
        "user-1", "starter", "https://breaklytix.site/dashboard/billing?success=true", "https://breaklytix.site/dashboard/billing"
    )

    assert (session_id, url) == ("cs_1", "https://checkout.stripe.test/cs_1")
    assert captured["success_url"] == (
        "https://breaklytix.site/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}"
    )
    assert captured["line_items"] == [{"price": "price_starter", "quantity": 1}]
    assert captured["metadata"]["autofix_user_id"] == "user-1"


# ---------------------------------------------------------------------------
# Webhook idempotency
# ---------------------------------------------------------------------------
def test_duplicate_webhook_is_not_processed_twice(monkeypatch, stripe_ready, fake_db):
    fake_db.rows["stripe_webhook_events"] = [{"id": "row-1", "stripe_event_id": "evt_dup"}]
    calls = []
    monkeypatch.setattr(billing, "_handle_stripe_event", lambda event: calls.append(event.id))
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        staticmethod(lambda payload, sig, secret: _event("evt_dup")),
    )

    result = billing.process_stripe_webhook(b"{}", "sig")

    assert result == {"status": "already_processed", "event_id": "evt_dup"}
    assert calls == []


def test_failed_handler_releases_the_idempotency_claim(monkeypatch, stripe_ready, fake_db):
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        staticmethod(lambda payload, sig, secret: _event("evt_retry")),
    )

    def _boom(_event):
        raise RuntimeError("downstream write failed")

    monkeypatch.setattr(billing, "_handle_stripe_event", _boom)

    with pytest.raises(RuntimeError):
        billing.process_stripe_webhook(b"{}", "sig")

    # Stripe retries must be able to re-claim the event.
    assert fake_db.rows["stripe_webhook_events"] == []


# ---------------------------------------------------------------------------
# Subscription entitlement
# ---------------------------------------------------------------------------
def _apply(subscription, fake_db):
    fake_db.rows.setdefault("users", [])
    fake_db.rows.setdefault("plan_usage", [])
    return billing._handle_subscription_updated(subscription)


def test_active_subscription_gets_its_plan_limit(stripe_ready, fake_db):
    result = _apply(_subscription(status="active"), fake_db)
    assert result["status"] == "active"
    assert result["limit"] == 50
    assert fake_db.writes_for("users", "update")[-1]["monitored_api_limit"] == 50


def test_trialing_subscription_counts_as_active(stripe_ready, fake_db):
    assert _apply(_subscription(status="trialing"), fake_db)["status"] == "active"


def test_past_due_keeps_the_plan_limit_during_dunning(stripe_ready, fake_db):
    result = _apply(_subscription(status="past_due"), fake_db)
    assert result["status"] == "past_due"
    assert result["limit"] == 50


def test_incomplete_checkout_grants_no_access(stripe_ready, fake_db):
    result = _apply(_subscription(status="incomplete"), fake_db)
    assert result["status"] == "canceled"
    assert result["limit"] == 0
    assert fake_db.writes_for("users", "update")[-1]["monitored_api_limit"] == 0


def test_unknown_price_does_not_silently_downgrade(stripe_ready, fake_db):
    subscription = _subscription(
        metadata={"autofix_user_id": "user-1"},  # no plan metadata
        items=SimpleNamespace(data=[SimpleNamespace(price=SimpleNamespace(id="price_annual_new"))]),
    )
    result = _apply(subscription, fake_db)

    assert result["status"] == "active"
    assert result["limit"] is None
    # The stored limit must be left exactly as it was.
    assert "monitored_api_limit" not in fake_db.writes_for("users", "update")[-1]


def test_price_wins_over_stale_metadata(stripe_ready, fake_db):
    # A plan changed in the Stripe dashboard does not update subscription
    # metadata; the billed price must decide the entitlement.
    subscription = _subscription(
        metadata={"autofix_user_id": "user-1", "plan": "enterprise"},
        items=SimpleNamespace(data=[SimpleNamespace(price=SimpleNamespace(id="price_starter"))]),
    )
    assert _apply(subscription, fake_db)["limit"] == 10


def test_metadata_is_the_fallback_for_an_unrecognised_price(stripe_ready, fake_db):
    subscription = _subscription(
        metadata={"autofix_user_id": "user-1", "plan": "growth"},
        items=SimpleNamespace(data=[SimpleNamespace(price=SimpleNamespace(id="price_manual"))]),
    )
    assert _apply(subscription, fake_db)["limit"] == 50


def test_checkout_completed_without_subscription_is_skipped(stripe_ready, fake_db):
    session = SimpleNamespace(
        metadata={"autofix_user_id": "user-1", "plan": "starter"},
        subscription=None,
    )
    assert billing._handle_checkout_completed(session)["action"] == "skipped"


# ---------------------------------------------------------------------------
# Recovery after a failed payment
# ---------------------------------------------------------------------------
def test_invoice_paid_clears_past_due(fake_db):
    fake_db.rows["users"] = [
        {"id": "user-1", "stripe_customer_id": "cus_1", "stripe_subscription_id": "sub_1", "plan_status": "past_due"}
    ]
    invoice = SimpleNamespace(customer="cus_1")

    assert billing._handle_invoice_paid(invoice)["action"] == "payment_recovered"
    assert fake_db.writes_for("users", "update")[-1] == {"plan_status": "active"}


def test_invoice_paid_without_subscription_does_not_change_state(fake_db):
    fake_db.rows["users"] = [
        {"id": "user-1", "stripe_customer_id": "cus_1", "stripe_subscription_id": None, "plan_status": "past_due"}
    ]
    invoice = SimpleNamespace(customer="cus_1")

    assert billing._handle_invoice_paid(invoice)["action"] == "skipped"
    assert fake_db.writes_for("users", "update") == []


def test_router_maps_missing_config_to_503_without_leaking_env_names(monkeypatch, fake_db):
    from fastapi import HTTPException
    from app.routers import billing as billing_router

    fake_db.rows["users"] = [{"id": "user-1", "email": "a@b.test"}]
    monkeypatch.setattr(billing_router, "db", lambda: fake_db)
    monkeypatch.setattr(billing_router, "_validated_return_url", lambda url, field: url)

    def _raise(**_kwargs):
        raise billing.BillingNotConfigured("STRIPE_SECRET_KEY is missing")

    monkeypatch.setattr(billing_router, "create_checkout_session", _raise)

    body = SimpleNamespace(plan="starter", success_url="https://x.test/ok", cancel_url="https://x.test/no")
    with pytest.raises(HTTPException) as excinfo:
        billing_router.create_checkout(body=body, user_id="user-1")

    assert excinfo.value.status_code == 503
    assert "STRIPE_SECRET_KEY" not in excinfo.value.detail
    assert "support@breaklytix.site" in excinfo.value.detail
