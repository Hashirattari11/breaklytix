"""Email service + notification preferences + test-email endpoint tests.

Pure unit tests (no live DB / no live email provider): the Supabase client,
settings, and the email transport are monkeypatched, matching the project's
existing offline test style. Real sends are verified end-to-end against deployment.
"""
import pytest

from app import email_service
from app.email_service import (
    NOTIFICATION_CATEGORIES,
    SENDER_NOT_CONFIGURED,
    category_enabled,
    preferences_map,
    resolve_user_email,
    sender_is_sandbox,
    sender_problem,
    send_alert_email,
)


class _Resp:
    def __init__(self, rows, count=None):
        self.data = rows
        self.count = count


class _FakeDB:
    """Fluent fake for db().table(...).select(...).eq(...).execute()."""
    def __init__(self, rows, count=None):
        self._rows = rows
        self._count = count
        self.calls = []

    def table(self, name):
        self.calls.append(("table", name))
        return self

    def select(self, *cols, **kwargs):
        self.calls.append(("select", cols, kwargs))
        return self

    def eq(self, col, val):
        self.calls.append(("eq", col, val))
        return self

    def gte(self, col, val):
        self.calls.append(("gte", col, val))
        return self

    def in_(self, col, vals):
        self.calls.append(("in", col, vals))
        return self

    def limit(self, n):
        self.calls.append(("limit", n))
        return self

    def execute(self):
        return _Resp(self._rows, count=self._count)


# ---------------------------------------------------------------------------
# sender_problem / sender_is_sandbox
# ---------------------------------------------------------------------------
def test_sender_problem_missing_key(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "")
    problem = sender_problem()
    assert problem and problem.startswith(SENDER_NOT_CONFIGURED)


def test_sender_problem_missing_from(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "")
    problem = sender_problem()
    assert problem and problem.startswith(SENDER_NOT_CONFIGURED)


def test_sender_problem_malformed_from(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "not-an-email")
    problem = sender_problem()
    assert problem and problem.startswith(SENDER_NOT_CONFIGURED)


def test_sender_problem_valid(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <no-reply@autofix.dev>")
    assert sender_problem() is None


def test_sender_problem_valid_name_with_spaces(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(
        email_service.settings, "brevo_from_email",
        "Breaklytix Labs <onboarding@brevo.com>",
    )
    assert sender_problem() is None
    assert sender_is_sandbox() is False


def test_sender_is_sandbox_resend_provider(monkeypatch):
    # Brevo has no sandbox sender; the Resend sandbox only applies to Resend.
    monkeypatch.setattr(email_service.settings, "email_provider", "resend")
    monkeypatch.setattr(email_service.settings, "resend_from_email", "Breaklytix <onboarding@resend.dev>")
    assert sender_is_sandbox() is True
    monkeypatch.setattr(email_service.settings, "resend_from_email", "Breaklytix <a@b.dev>")
    assert sender_is_sandbox() is False


# ---------------------------------------------------------------------------
# preferences
# ---------------------------------------------------------------------------
def test_preferences_map_defaults_all_true(monkeypatch):
    monkeypatch.setattr(email_service, "db", lambda: _FakeDB([]))
    prefs = preferences_map("u1")
    assert set(prefs) == set(NOTIFICATION_CATEGORIES)
    assert all(prefs.values())


def test_preferences_map_db_override(monkeypatch):
    monkeypatch.setattr(
        email_service, "db",
        lambda: _FakeDB([{"category": "digest", "email_enabled": False}]),
    )
    prefs = preferences_map("u1")
    assert prefs["digest"] is False
    assert prefs["breaking_changes"] is True


def test_category_enabled_off(monkeypatch):
    monkeypatch.setattr(
        email_service, "db",
        lambda: _FakeDB([{"category": "digest", "email_enabled": False}]),
    )
    assert category_enabled("u1", "digest") is False
    assert category_enabled("u1", "breaking_changes") is True


def test_resolve_user_email(monkeypatch):
    monkeypatch.setattr(email_service, "db", lambda: _FakeDB([{"email": "user@example.com"}]))
    assert resolve_user_email("u1") == "user@example.com"
    monkeypatch.setattr(email_service, "db", lambda: _FakeDB([]))
    assert resolve_user_email("u1") is None


# ---------------------------------------------------------------------------
# send_alert_email
# ---------------------------------------------------------------------------
def test_send_fails_closed_on_sender_config(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "")
    inserted = []
    monkeypatch.setattr(
        email_service, "_insert_delivery",
        lambda **kw: inserted.append(kw),
    )
    result = send_alert_email(user_id="u1", recipient="a@b.com", alert_type="test",
                              subject="s", html="<p>h</p>", text="t")
    assert result["ok"] is False
    assert result["error_category"] == "sender_config"
    assert inserted and inserted[0]["status"] == "failed"


def test_send_success_returns_message_id(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <a@b.dev>")
    monkeypatch.setattr(email_service, "_recent_same_fingerprint", lambda fp: False)
    monkeypatch.setattr(email_service, "_daily_count", lambda uid: 0)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg_123"))

    result = send_alert_email(
        user_id="u1", recipient="a@b.com", alert_type="alert",
        subject="s", html="<p>h</p>", text="t", fingerprint="fp1",
    )
    assert result["ok"] is True
    assert result["provider_message_id"] == "msg_123"


def test_send_failure_categorizes_rejected(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <a@b.dev>")
    monkeypatch.setattr(email_service, "_recent_same_fingerprint", lambda fp: False)
    monkeypatch.setattr(email_service, "_daily_count", lambda uid: 0)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (False, "403: rejected by Brevo"))

    result = send_alert_email(
        user_id="u1", recipient="a@b.com", alert_type="alert",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is False
    assert result["error_category"] == "rejected"


def test_send_failure_categorizes_rate_limit(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <a@b.dev>")
    monkeypatch.setattr(email_service, "_recent_same_fingerprint", lambda fp: False)
    monkeypatch.setattr(email_service, "_daily_count", lambda uid: 0)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (False, "429: rate limited"))

    result = send_alert_email(
        user_id="u1", recipient="a@b.com", alert_type="alert",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is False
    assert result["error_category"] == "rate_limit"


def test_send_dedup_suppresses_duplicate(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <a@b.dev>")
    sent = []
    monkeypatch.setattr(email_service, "_recent_same_fingerprint", lambda fp: True)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: sent.append(k) or (True, "msg"))

    result = send_alert_email(
        user_id="u1", recipient="a@b.com", alert_type="alert",
        subject="s", html="<p>h</p>", text="t", fingerprint="dup-fp",
    )
    assert result.get("skipped_duplicate") is True
    assert sent == []  # transport never called


def test_send_daily_cap(monkeypatch):
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <a@b.dev>")
    monkeypatch.setattr(email_service, "_recent_same_fingerprint", lambda fp: False)
    monkeypatch.setattr(email_service, "_daily_count", lambda uid: email_service.MAX_ALERT_EMAILS_PER_DAY + 1)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg"))

    result = send_alert_email(
        user_id="u1", recipient="a@b.com", alert_type="alert",
        subject="s", html="<p>h</p>", text="t",
    )
    assert result["ok"] is False
    assert result["error_category"] == "rate_limit"