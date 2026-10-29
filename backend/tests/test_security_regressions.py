"""Regression tests for the security/behavior fixes in the hardening pass.

Every test is offline: Stripe/GitHub/DB are replaced with small fakes or the
relevant pure helper is exercised directly. The goal is to prevent a future
change from silently reintroducing these issues.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import email as email_templates
from app import billing as billing_service
from app import github_app
from app.changelog import router as changelog_router
from app.config import settings
from app.main import app
from app.routers import agency
from app.routers import billing as billing_router
from app.routers import repos
from app.routers import slack


# ---------------------------------------------------------------------------
# Agency: signed install state + callback binding
# ---------------------------------------------------------------------------
def test_agency_install_state_is_signed_and_tamper_evident(monkeypatch):
    monkeypatch.setattr(agency.settings, "jwt_secret", "unit-test-secret-0123456789abcdef")

    state = agency._sign_install_state(
        client_id="client-1", agency_owner_id="owner-1"
    )
    payload = agency._verify_install_state(state)
    assert payload["scope"] == "agency_install"
    assert payload["client_id"] == "client-1"
    assert payload["agency_owner_id"] == "owner-1"

    with pytest.raises(HTTPException) as exc:
        agency._verify_install_state(state + "x")
    assert exc.value.status_code == 400


def test_agency_callback_rejects_raw_client_id_state(monkeypatch):
    monkeypatch.setattr(agency.settings, "jwt_secret", "unit-test-secret-0123456789abcdef")

    with pytest.raises(HTTPException) as exc:
        agency.github_install_callback(installation_id="12345", state="raw-client-id")
    assert exc.value.status_code == 400


def test_agency_callback_rejects_state_for_a_different_owner(monkeypatch):
    """A valid signed state is still bound to the client's real owner."""
    secret = "unit-test-secret-0123456789abcdef"
    monkeypatch.setattr(agency.settings, "jwt_secret", secret)

    class _Result:
        data = [{
            "id": "client-1",
            "agency_owner_id": "owner-B",
            "status": "pending",
            "invite_token_hash": None,
            "invite_token_expires_at": None,
        }]

    class _Query:
        def select(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def execute(self):
            return _Result()

    class _DB:
        def table(self, name):
            assert name == "agency_clients"
            return _Query()

    monkeypatch.setattr(agency, "db", lambda: _DB())

    state = agency._sign_install_state(client_id="client-1", agency_owner_id="owner-A")
    with pytest.raises(HTTPException) as exc:
        agency.github_install_callback(installation_id="12345", state=state)
    assert exc.value.status_code == 403


def test_invite_expiry_fails_closed_for_missing_or_past_values():
    assert agency._invite_expired(None) is True
    assert agency._invite_expired("not-a-date") is True
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert agency._invite_expired(past) is True
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert agency._invite_expired(future) is False


def test_build_install_url_encodes_slug_and_state(monkeypatch):
    monkeypatch.setattr(github_app.settings, "github_app_slug", "breaklytix app")
    url = github_app.build_install_url("state/with space&chars")
    assert "breaklytix%20app" in url
    assert "state%2Fwith%20space%26chars" in url

    monkeypatch.setattr(github_app.settings, "github_app_slug", "")
    with pytest.raises(ValueError):
        github_app.build_install_url("state")


# ---------------------------------------------------------------------------
# Slack: signed OAuth state
# ---------------------------------------------------------------------------
def test_slack_state_is_signed_and_not_a_raw_user_id(monkeypatch):
    monkeypatch.setattr(slack.settings, "jwt_secret", "unit-test-secret-0123456789abcdef")
    state = slack._signed_state("user-123")
    assert state != "user-123"
    assert slack._state_user_id(state) == "user-123"
    assert slack._state_user_id("user-123") is None
    assert slack._state_user_id(state + "x") is None


# ---------------------------------------------------------------------------
# Repos: agency installation tokens and revocation fail-closed
# ---------------------------------------------------------------------------
def test_repo_scan_tokens_prefers_installation_token(monkeypatch):
    monkeypatch.setattr(
        repos,
        "fetch_one",
        lambda table, match: {"id": "c1", "status": "authorized", "github_installation_id": "99"},
    )
    monkeypatch.setattr(repos, "get_installation_access_token", lambda installation_id: "install-token")
    monkeypatch.setattr(repos, "_user_github_token", lambda user_id: "user-token")

    tokens = repos._repo_scan_tokens({"agency_client_id": "c1"}, "owner-1")
    assert tokens == ["install-token", "user-token"]


def test_repo_scan_tokens_fails_closed_when_client_revoked(monkeypatch):
    monkeypatch.setattr(
        repos,
        "fetch_one",
        lambda table, match: {"id": "c1", "status": "revoked", "github_installation_id": "99"},
    )
    monkeypatch.setattr(repos, "get_installation_access_token", lambda installation_id: "should-not-be-used")
    monkeypatch.setattr(repos, "_user_github_token", lambda user_id: "owner-token")

    assert repos._repo_scan_tokens({"agency_client_id": "c1", "access_token": "enc"}, "owner-1") == []


# ---------------------------------------------------------------------------
# Public API: missing credentials are 401, not 422
# ---------------------------------------------------------------------------
def test_public_api_missing_bearer_is_401_with_challenge():
    res = TestClient(app).get("/api/public/v1/alerts")
    assert res.status_code == 401
    assert res.headers.get("www-authenticate") == "Bearer"


# ---------------------------------------------------------------------------
# Changelog: shared review state is admin-only
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("handler", [changelog_router.review_event, changelog_router.dismiss_event])
def test_changelog_review_actions_require_admin(monkeypatch, handler):
    monkeypatch.setattr(changelog_router, "is_admin", lambda user_id: False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(handler("event-1", user_id="ordinary-user"))
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Billing: redirect allowlist + retry-safe webhook claim
# ---------------------------------------------------------------------------
def test_billing_redirects_only_to_configured_frontend_origins(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", "https://breaklytix.site")
    monkeypatch.setattr(
        settings,
        "frontend_origins",
        "https://breaklytix.site,http://localhost:3000",
    )

    assert (
        billing_router._validated_return_url(
            "https://breaklytix.site/dashboard/billing?x=1", field="success_url"
        )
        == "https://breaklytix.site/dashboard/billing?x=1"
    )
    with pytest.raises(HTTPException):
        billing_router._validated_return_url("https://evil.example/steal", field="success_url")
    with pytest.raises(HTTPException):
        billing_router._validated_return_url("javascript:alert(1)", field="success_url")
    with pytest.raises(HTTPException):
        billing_router._validated_return_url(
            "https://breaklytix.site@evil.example/steal", field="success_url"
        )


def test_stripe_webhook_removes_claim_when_handler_fails(monkeypatch):
    event = SimpleNamespace(
        id="evt_test_1",
        type="checkout.session.completed",
        to_dict=lambda: {"id": "evt_test_1"},
    )
    monkeypatch.setattr(billing_service.stripe.Webhook, "construct_event",
                        staticmethod(lambda payload, sig, secret: event))
    # The webhook route now refuses to run at all when the signing secret is
    # missing; this test is about claim handling, so configure it.
    monkeypatch.setattr(billing_service.settings, "stripe_webhook_secret", "whsec_test")

    actions: list[str] = []

    class _Query:
        def select(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def insert(self, row):
            actions.append("insert")
            return self

        def delete(self):
            actions.append("delete")
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    class _DB:
        def table(self, name):
            return _Query()

    monkeypatch.setattr(billing_service, "db", lambda: _DB())
    monkeypatch.setattr(
        billing_service,
        "_handle_stripe_event",
        lambda event: (_ for _ in ()).throw(RuntimeError("handler failed")),
    )

    with pytest.raises(RuntimeError):
        billing_service.process_stripe_webhook(b"{}", "sig")

    assert actions == ["insert", "delete"]


# ---------------------------------------------------------------------------
# Email templates: HTML escaping + header injection
# ---------------------------------------------------------------------------
def test_invite_email_escapes_html_and_strips_subject_newlines(monkeypatch):
    captured: dict = {}

    def fake_send(**kwargs):
        captured.update(kwargs)
        return {"ok": True}

    monkeypatch.setattr(email_templates, "send_transactional_email", fake_send)
    email_templates.send_invite_email(
        to_email="client@example.com",
        agency_name="Evil\r\nBcc: attacker@example.com <script>",
        client_name="<b>Client</b>",
        auth_link="https://breaklytix.site/authorize/token",
    )

    assert "\r" not in captured["subject"]
    assert "\n" not in captured["subject"]
    assert "<script>" not in captured["html"]
    assert "&lt;script&gt;" in captured["html"]
    assert "&lt;b&gt;Client&lt;/b&gt;" in captured["html"]
    assert "Bcc: attacker@example.com" in captured["subject"]
