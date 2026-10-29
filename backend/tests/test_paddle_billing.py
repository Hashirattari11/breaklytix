"""Paddle billing tests (offline).

Paddle is never called: ``_request`` is stubbed at the module boundary.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from types import SimpleNamespace

import pytest

from app import paddle_billing as pb


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self.store = store
        self.table = table
        self.filters = []
        self.payload = None
        self.action = "select"

    def select(self, *_a, **_k):
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

    def limit(self, *_a, **_k):
        return self

    def _matches(self, row):
        return all(row.get(c) == v for c, v in self.filters)

    def execute(self):
        rows = self.store.setdefault(self.table, [])
        if self.action == "select":
            return _Resp([r for r in rows if self._matches(r)])
        if self.action == "insert":
            rows.append(dict(self.payload))
            self.store.setdefault("writes", []).append((self.table, "insert", dict(self.payload)))
            return _Resp([self.payload])
        if self.action == "upsert":
            self.store.setdefault("writes", []).append((self.table, "upsert", dict(self.payload)))
            return _Resp([self.payload])
        if self.action == "update":
            self.store.setdefault("writes", []).append((self.table, "update", dict(self.payload)))
            for r in rows:
                if self._matches(r):
                    r.update(self.payload)
            return _Resp([self.payload])
        if self.action == "delete":
            self.store.setdefault("writes", []).append((self.table, "delete", dict(self.filters)))
            self.store[self.table] = [r for r in rows if not self._matches(r)]
            return _Resp([])
        raise AssertionError(self.action)


class _FakeDB:
    def __init__(self, rows=None):
        self.rows = {k: [dict(r) for r in v] for k, v in (rows or {}).items()}
        self.rows.setdefault("writes", [])

    def table(self, name):
        return _Query(self.rows, name)

    def writes_for(self, table, action):
        return [p for t, a, p in self.rows.get("writes", []) if t == table and a == action]


@pytest.fixture
def fake_db(monkeypatch):
    store = _FakeDB()
    monkeypatch.setattr(pb, "db", lambda: store)
    return store


@pytest.fixture
def paddle_ready(monkeypatch):
    monkeypatch.setattr(pb.settings, "paddle_api_key", "pk_test_x")
    monkeypatch.setattr(pb.settings, "paddle_webhook_secret", "whsec_paddle")
    monkeypatch.setattr(pb.settings, "paddle_environment", "sandbox")
    monkeypatch.setattr(pb.settings, "paddle_price_starter", "pri_starter")
    monkeypatch.setattr(pb.settings, "paddle_price_growth", "pri_growth")
    monkeypatch.setattr(pb.settings, "paddle_price_enterprise", "pri_enterprise")
    monkeypatch.setattr(pb.settings, "frontend_base_url", "https://breaklytix.site")


def _sign(payload: bytes, secret: str, ts: int | None = None) -> str:
    ts = ts if ts is not None else int(time.time())
    signed = f"{ts}:{payload.decode('utf-8')}"
    h1 = hmac.new(secret.encode(), signed.encode(), hashlib.sha256).hexdigest()
    return f"ts={ts};h1={h1}"


# ---------------------------------------------------------------------------
# Config guards
# ---------------------------------------------------------------------------
def test_checkout_raises_not_configured_without_api_key(monkeypatch, paddle_ready):
    monkeypatch.setattr(pb.settings, "paddle_api_key", "")
    with pytest.raises(pb.PaddleNotConfigured):
        pb.create_paddle_checkout("u1", "starter", "https://x/ok", "https://x/no")


def test_missing_config_lists_gaps(monkeypatch):
    monkeypatch.setattr(pb.settings, "paddle_api_key", "")
    monkeypatch.setattr(pb.settings, "paddle_webhook_secret", "")
    monkeypatch.setattr(pb.settings, "paddle_price_starter", "")
    monkeypatch.setattr(pb.settings, "paddle_price_growth", "")
    monkeypatch.setattr(pb.settings, "paddle_price_enterprise", "")
    assert "PADDLE_API_KEY" in pb.missing_paddle_config()
    assert "PADDLE_WEBHOOK_SECRET" in pb.missing_paddle_config()


# ---------------------------------------------------------------------------
# Webhook signature
# ---------------------------------------------------------------------------
def test_webhook_rejects_invalid_signature(monkeypatch, paddle_ready, fake_db):
    payload = json.dumps({"notification_id": "ntf_1", "event_type": "subscription.updated", "data": {}}).encode()
    ts = int(time.time())
    with pytest.raises(ValueError, match="signature"):
        pb.process_paddle_webhook(payload, f"ts={ts};h1=deadbeef")


def test_webhook_rejects_expired_timestamp(monkeypatch, paddle_ready, fake_db):
    payload = json.dumps({"notification_id": "ntf_2", "event_type": "subscription.updated", "data": {}}).encode()
    old_ts = int(time.time()) - 100
    sig = _sign(payload, "whsec_paddle", ts=old_ts)
    with pytest.raises(ValueError, match="tolerance"):
        pb.process_paddle_webhook(payload, sig)


def test_webhook_accepts_valid_signature(monkeypatch, paddle_ready, fake_db):
    payload = json.dumps({"notification_id": "ntf_3", "event_type": "subscription.updated", "data": {
        "id": "sub_1", "status": "active", "customer_id": "ctm_1",
        "items": [{"price": {"id": "pri_growth"}, "quantity": 1}],
        "custom_data": {"autofix_user_id": "user-1", "plan": "growth"},
        "current_billing_period": {"starts_at": "2026-01-01T00:00:00Z", "ends_at": "2026-02-01T00:00:00Z"},
    }}).encode()
    sig = _sign(payload, "whsec_paddle")
    result = pb.process_paddle_webhook(payload, sig)
    assert result["status"] == "processed"


def test_webhook_idempotent(monkeypatch, paddle_ready, fake_db):
    fake_db.rows["paddle_webhook_events"] = [{"id": "r", "event_id": "ntf_dup"}]
    payload = json.dumps({"notification_id": "ntf_dup", "event_type": "subscription.updated", "data": {}}).encode()
    sig = _sign(payload, "whsec_paddle")
    result = pb.process_paddle_webhook(payload, sig)
    assert result["status"] == "already_processed"


def test_webhook_releases_claim_on_failure(monkeypatch, paddle_ready, fake_db):
    payload = json.dumps({"notification_id": "ntf_fail", "event_type": "subscription.updated", "data": {}}).encode()
    sig = _sign(payload, "whsec_paddle")
    # Force handler failure by making db update blow up? Instead patch _handle_paddle_event.
    monkeypatch.setattr(pb, "_handle_paddle_event", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(RuntimeError):
        pb.process_paddle_webhook(payload, sig)
    assert fake_db.rows["paddle_webhook_events"] == []


# ---------------------------------------------------------------------------
# Entitlement mapping
# ---------------------------------------------------------------------------
def test_active_subscription_grants_plan_limit(paddle_ready, fake_db):
    data = {
        "id": "sub_1", "status": "active", "customer_id": "ctm_1",
        "items": [{"price": {"id": "pri_growth"}, "quantity": 1}],
        "custom_data": {"autofix_user_id": "user-1", "plan": "growth"},
        "current_billing_period": {"starts_at": "2026-01-01T00:00:00Z", "ends_at": "2026-02-01T00:00:00Z"},
    }
    fake_db.rows["users"] = [{"id": "user-1", "paddle_customer_id": "ctm_1"}]
    result = pb._handle_paddle_subscription(data)
    assert result["status"] == "active"
    assert result["limit"] == 50
    assert fake_db.writes_for("users", "update")[-1]["monitored_api_limit"] == 50


def test_past_due_keeps_cap(paddle_ready, fake_db):
    data = {
        "id": "sub_1", "status": "past_due", "customer_id": "ctm_1",
        "items": [{"price": {"id": "pri_growth"}, "quantity": 1}],
        "custom_data": {"autofix_user_id": "user-1", "plan": "growth"},
    }
    fake_db.rows["users"] = [{"id": "user-1", "paddle_customer_id": "ctm_1"}]
    result = pb._handle_paddle_subscription(data)
    assert result["status"] == "past_due"
    # limit None → not overwritten
    assert "monitored_api_limit" not in fake_db.writes_for("users", "update")[-1]


def test_canceled_revokes_access(paddle_ready, fake_db):
    data = {
        "id": "sub_1", "status": "canceled", "customer_id": "ctm_1",
        "items": [{"price": {"id": "pri_growth"}, "quantity": 1}],
        "custom_data": {"autofix_user_id": "user-1", "plan": "growth"},
    }
    fake_db.rows["users"] = [{"id": "user-1", "paddle_customer_id": "ctm_1"}]
    result = pb._handle_paddle_subscription(data)
    assert result["status"] == "canceled"
    assert result["limit"] == 0
    upd = fake_db.writes_for("users", "update")[-1]
    assert upd["monitored_api_limit"] == 0
    assert upd["paddle_subscription_id"] is None


def test_price_wins_over_stale_custom_data(paddle_ready, fake_db):
    data = {
        "id": "sub_1", "status": "active", "customer_id": "ctm_1",
        "items": [{"price": {"id": "pri_starter"}, "quantity": 1}],
        "custom_data": {"autofix_user_id": "user-1", "plan": "enterprise"},
    }
    fake_db.rows["users"] = [{"id": "user-1", "paddle_customer_id": "ctm_1"}]
    result = pb._handle_paddle_subscription(data)
    assert result["limit"] == 10


# ---------------------------------------------------------------------------
# Checkout payload
# ---------------------------------------------------------------------------
def test_checkout_creates_customer_and_transaction(monkeypatch, paddle_ready, fake_db):
    fake_db.rows["users"] = [{"id": "user-1", "email": "a@b.test"}]
    calls = []

    def _fake_request(method, path, json=None):
        calls.append((method, path, json))
        if method == "POST" and path == "/customers":
            return {"data": {"id": "ctm_new"}}
        if method == "POST" and path == "/transactions":
            return {"data": {"id": "txn_1", "checkout": {"url": "https://checkout.paddle.com/txn_1"}}}
        raise AssertionError((method, path))

    monkeypatch.setattr(pb, "_request", _fake_request)

    txn_id, url = pb.create_paddle_checkout(
        "user-1", "growth", "https://breaklytix.site/dashboard/billing?success=true", "https://breaklytix.site/dashboard/billing",
        customer_email="a@b.test",
    )
    assert (txn_id, url) == ("txn_1", "https://checkout.paddle.com/txn_1")

    # customer stored
    assert fake_db.rows["users"][0]["paddle_customer_id"] == "ctm_new"

    # transaction payload shape
    txn_call = [c for c in calls if c[1] == "/transactions"][0]
    payload = txn_call[2]
    assert payload["items"] == [{"price_id": "pri_growth", "quantity": 1}]
    assert payload["customer_id"] == "ctm_new"
    assert payload["custom_data"]["autofix_user_id"] == "user-1"
    assert payload["custom_data"]["plan"] == "growth"
    assert payload["checkout"]["url"].endswith("/checkout")


def test_checkout_reuses_existing_customer(monkeypatch, paddle_ready, fake_db):
    fake_db.rows["users"] = [{"id": "user-1", "email": "a@b.test", "paddle_customer_id": "ctm_existing"}]
    calls = []

    def _fake_request(method, path, json=None):
        calls.append((method, path, json))
        if method == "POST" and path == "/transactions":
            return {"data": {"id": "txn_2", "checkout": {"url": "https://checkout.paddle.com/txn_2"}}}
        raise AssertionError((method, path))

    monkeypatch.setattr(pb, "_request", _fake_request)

    pb.create_paddle_checkout("user-1", "starter", "https://x/ok", "https://x/no")
    assert not any(c[1] == "/customers" for c in calls)


# ---------------------------------------------------------------------------
# Portal
# ---------------------------------------------------------------------------
def test_portal_returns_overview_url(monkeypatch, paddle_ready, fake_db):
    fake_db.rows["users"] = [{"id": "user-1", "paddle_customer_id": "ctm_1", "paddle_subscription_id": "sub_1"}]

    def _fake_request(method, path, json=None):
        assert method == "POST"
        assert path == "/customers/ctm_1/portal-sessions"
        return {"data": {"urls": {"general": {"overview": "https://portal.paddle.com/overview"}}}}

    monkeypatch.setattr(pb, "_request", _fake_request)
    url = pb.create_paddle_portal_session("user-1", "https://x")
    assert url == "https://portal.paddle.com/overview"


def test_portal_raises_without_customer(monkeypatch, paddle_ready, fake_db):
    fake_db.rows["users"] = [{"id": "user-1"}]
    with pytest.raises(ValueError):
        pb.create_paddle_portal_session("user-1", "https://x")
