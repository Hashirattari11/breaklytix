"""Notification preferences + test-email router tests (offline, monkeypatched)."""
import pytest
from fastapi import HTTPException

from app.routers import notifications
from app.routers.notifications import PreferencesUpdate, send_test_email, put_preferences
from app import email_service


class _Resp:
    def __init__(self, rows=None):
        self.data = rows or []


class _FakeUpsert:
    """Fluent fake for db().table(..).upsert(..).on_conflict(..).execute()."""
    def __init__(self):
        self.seen = []
        self._payload = None
        self._conflict = None

    def table(self, name):
        return self

    def upsert(self, payload, on_conflict=None):
        self.seen.append(payload)
        self._payload = payload
        self._conflict = on_conflict
        return self

    def on_conflict(self, cols):
        return self

    def execute(self):
        return _Resp(self.seen)


def test_put_preferences_persists_override(monkeypatch):
    fake = _FakeUpsert()

    def fake_db():
        return fake

    monkeypatch.setattr(notifications, "db", fake_db)
    monkeypatch.setattr(
        email_service, "db",
        lambda: _RespDB([{"category": "digest", "email_enabled": False}]),
    )

    body = PreferencesUpdate(preferences={"digest": False})
    resp = put_preferences(body, user_id="u1")
    assert resp.categories["digest"] is False
    assert resp.categories["breaking_changes"] is True
    assert fake.seen and fake.seen[0]["category"] == "digest"
    assert fake.seen[0]["email_enabled"] is False


class _RespDB:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _ChainDB(self._rows)


class _ChainDB:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *cols, **kwargs):
        return self

    def eq(self, col, val):
        return self

    def limit(self, n):
        return self

    def execute(self):
        return _Resp(self._rows)


def test_put_preferences_rejects_unknown_category():
    body = PreferencesUpdate(preferences={"not_a_category": True})
    with pytest.raises(HTTPException) as exc:
        put_preferences(body, user_id="u1")
    assert exc.value.status_code == 422


def test_test_email_fails_closed_without_address(monkeypatch):
    monkeypatch.setattr(email_service, "db", lambda: _RespDB([]))
    with pytest.raises(HTTPException) as exc:
        send_test_email(user_id="u1")
    assert exc.value.status_code == 400


def test_test_email_sends_real(monkeypatch):
    monkeypatch.setattr(email_service, "db", lambda: _RespDB([{"email": "a@b.com"}]))
    monkeypatch.setattr(email_service.settings, "brevo_api_key", "re_abc")
    monkeypatch.setattr(email_service.settings, "brevo_from_email", "Breaklytix <a@b.dev>")
    monkeypatch.setattr(email_service, "_recent_same_fingerprint", lambda fp: False)
    monkeypatch.setattr(email_service, "_daily_count", lambda uid: 0)
    monkeypatch.setattr(email_service, "_insert_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (True, "msg_ttt"))

    resp = send_test_email(user_id="u1")
    assert resp.ok is True
    assert resp.provider_message_id == "msg_ttt"