"""Offline tests for the transactional email path (master pass §15).

Agency invites / welcome / scan-confirmation emails previously called
`email_client.send_email` DIRECTLY (no delivery logging, no sender check).
They now route through `email_service.send_transactional_email`. These tests
verify the dict contract + fail-closed behavior with mocked transport/DB.
"""
import pytest

from app import email_service
from app.email_service import (
    SENDER_NOT_CONFIGURED,
    send_transactional_email,
)
from app.email import (
    send_detection_confirmation_email,
    send_invite_email,
    send_welcome_email,
)


class _Resp:
    def __init__(self, rows, count=None):
        self.data = rows
        self.count = count


class _FakeDB:
    """Fluent fake for db().table(...).insert(...).execute()."""
    def __init__(self):
        self.calls = []

    def table(self, name):
        self.calls.append(("table", name))
        return self

    def insert(self, row):
        self.calls.append(("insert", row))
        return self

    def execute(self):
        return _Resp([])


def _cfg_ok(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(
        email_service.settings, "brevo_from_email", "Breaklytix <no-reply@autofix.dev>"
    )


# ---------------------------------------------------------------------------
# send_transactional_email
# ---------------------------------------------------------------------------
def test_transactional_fails_closed_on_sender_config(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "")
    inserted = []
    monkeypatch.setattr(
        email_service, "_insert_delivery",
        lambda **kw: inserted.append(kw),
    )
    result = send_transactional_email(
        user_id="u1", recipient="client@example.com", alert_type="agency_invite",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is False
    assert result["status"] == "failed"
    assert result["error_category"] == "sender_config"
    assert result["detail"].startswith(SENDER_NOT_CONFIGURED)
    assert inserted and inserted[0]["status"] == "failed"


def test_transactional_success_returns_accepted_status(monkeypatch):
    _cfg_ok(monkeypatch)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg_txn_1"))

    result = send_transactional_email(
        user_id="u1", recipient="client@example.com", alert_type="agency_invite",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is True
    # Honest wording — never claim delivered.
    assert result["status"] == "accepted by provider"
    assert result["provider_message_id"] == "msg_txn_1"
    assert "sender_warning" not in result


def test_transactional_sandbox_warning(monkeypatch):
    monkeypatch.setattr(email_service.settings, "email_provider", "resend")
    monkeypatch.setattr(
        email_service.settings, "resend_api_key", "re_abc",
    )
    monkeypatch.setattr(
        email_service.settings, "resend_from_email",
        "Breaklytix <onboarding@resend.dev>",  # sandbox sender
    )
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg_txn_2"))

    result = send_transactional_email(
        user_id="u1", recipient="me@example.com", alert_type="welcome",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is True
    assert result["status"] == "accepted by provider"
    assert "sandbox" in result["sender_warning"]


def test_transactional_failure_categorizes(monkeypatch):
    _cfg_ok(monkeypatch)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(
        email_service, "send_email",
        lambda *a, **k: (False, "422: from address not verified"),
    )

    result = send_transactional_email(
        user_id="u1", recipient="client@example.com", alert_type="agency_invite",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is False
    assert result["status"] == "failed"
    assert result["error_category"] == "rejected"
    assert "422" in result["detail"]


def test_transactional_logs_delivery(monkeypatch):
    _cfg_ok(monkeypatch)
    inserted = []
    monkeypatch.setattr(
        email_service, "_insert_delivery",
        lambda **kw: inserted.append(kw),
    )
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg_txn_3"))

    send_transactional_email(
        user_id="u1", recipient="client@example.com", alert_type="agency_invite",
        subject="s", html="<p>h</p>", text="t",
    )
    # queued then sent — two delivery log rows, no secrets.
    assert len(inserted) == 2
    assert inserted[0]["status"] == "queued"
    assert inserted[1]["status"] == "sent"
    assert inserted[1]["provider_message_id"] == "msg_txn_3"


# ---------------------------------------------------------------------------
# email.py template functions now route through the service + return dicts
# ---------------------------------------------------------------------------
def test_email_templates_route_through_service(monkeypatch):
    _cfg_ok(monkeypatch)
    monkeypatch.setattr(email_service, "db", lambda: _FakeDB())
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg_tpl"))

    inv = send_invite_email(
        to_email="c@example.com", agency_name="Acme", client_name="Bob",
        auth_link="https://frontend.example/authorize/abc", user_id="u1",
    )
    assert inv["ok"] is True
    assert inv["status"] == "accepted by provider"

    det = send_detection_confirmation_email(
        to_email="c@example.com", repo_name="acme/my-app",
        api_counts={"stripe": 3, "github": 1}, user_id="u1",
    )
    assert det["ok"] is True
    assert det["status"] == "accepted by provider"

    wel = send_welcome_email("c@example.com", "Bob", user_id="u1")
    assert wel["ok"] is True
    assert wel["status"] == "accepted by provider"


def test_email_templates_fail_closed_without_config(monkeypatch):
    monkeypatch.setattr(email_service.settings, "resend_api_key", "")
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)

    inv = send_invite_email(
        to_email="c@example.com", agency_name="Acme", client_name="Bob",
        auth_link="https://frontend.example/authorize/abc", user_id="u1",
    )
    assert inv["ok"] is False
    assert inv["detail"].startswith(SENDER_NOT_CONFIGURED)