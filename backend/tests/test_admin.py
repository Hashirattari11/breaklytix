"""Admin role / admin-panel tests.

These are pure unit tests (no live DB): the Supabase client and session lookup
are monkeypatched so the tests run offline, matching the project's existing
test style. Full 403/access behaviour is verified end-to-end against the
deployed environment instead.
"""
import pytest
from fastapi import HTTPException

from app import deps
from app.changelog import admin as changelog_admin
from app.routers import admin as admin_router


class FakeAdminUser:
    """Bag exposing .data like a PostgREST response."""
    def __init__(self, row):
        self.data = row


def _fake_fetch_user(user_dict):
    """Return a fetch_one that returns a specific user row (or None)."""
    def _fetch(table, match):
        assert table == "users"
        assert "id" in match
        return user_dict
    return _fetch


# ---------------------------------------------------------------------------
# require_admin dependency
# ---------------------------------------------------------------------------
def test_require_admin_ok(monkeypatch):
    monkeypatch.setattr(
        deps, "fetch_one",
        _fake_fetch_user({"id": "u1", "email": "a@b.com", "is_admin": True}),
    )
    result = deps.require_admin(user_id="u1")
    assert result["is_admin"] is True


def test_require_admin_rejects_non_admin(monkeypatch):
    monkeypatch.setattr(
        deps, "fetch_one",
        _fake_fetch_user({"id": "u1", "email": "a@b.com", "is_admin": False}),
    )
    with pytest.raises(HTTPException) as exc:
        deps.require_admin(user_id="u1")
    assert exc.value.status_code == 403


def test_require_admin_rejects_missing_user(monkeypatch):
    monkeypatch.setattr(deps, "fetch_one", _fake_fetch_user(None))
    with pytest.raises(HTTPException) as exc:
        deps.require_admin(user_id="nobody")
    assert exc.value.status_code == 403


def test_require_admin_owner_fallback(monkeypatch):
    """Owner UUID is granted access even if is_admin is False in the DB (OR fallback)."""
    monkeypatch.setattr(
        deps, "fetch_one",
        _fake_fetch_user({"id": "3d206f17-7abc-4857-be29-00c8406ce16f", "is_admin": False}),
    )
    result = deps.require_admin(user_id="3d206f17-7abc-4857-be29-00c8406ce16f")
    # Owner is allowed even though is_admin is False (owner OR fallback).
    assert result["is_admin"] is False
    assert result["id"] == "3d206f17-7abc-4857-be29-00c8406ce16f"


# ---------------------------------------------------------------------------
# changelog/admin.is_admin()
# ---------------------------------------------------------------------------
def test_changelog_is_admin_true(monkeypatch):
    monkeypatch.setattr(
        changelog_admin, "db",
        lambda: _FakeTable(FakeAdminUser([{"is_admin": True}])),
    )
    assert changelog_admin.is_admin("u1") is True


def test_changelog_is_admin_false(monkeypatch):
    monkeypatch.setattr(
        changelog_admin, "db",
        lambda: _FakeTable(FakeAdminUser([{"is_admin": False}])),
    )
    assert changelog_admin.is_admin("u1") is False


def test_changelog_is_admin_owner(monkeypatch):
    # Owner short-circuits to True without a DB query dependency.
    monkeypatch.setattr(
        changelog_admin, "db",
        lambda: _raise_if_called(),
    )
    assert changelog_admin.is_admin("3d206f17-7abc-4857-be29-00c8406ce16f") is True


class _FakeTable:
    """Fluent fake for db().table(...).select(...).eq(...).execute()."""
    def __init__(self, response):
        self._response = response

    def table(self, name):
        return self

    def select(self, *cols, **kwargs):
        return self

    def eq(self, col, val):
        return self

    def execute(self):
        return self._response


def _raise_if_called():
    raise AssertionError("DB should not be called for owner shortcut")


# ---------------------------------------------------------------------------
# Pre-migration schema degradation (missing admin columns -> no 500 crash)
# ---------------------------------------------------------------------------
class _SchemaError(Exception):
    """Stands in for postgrest APIError PGRST204 (missing column)."""
    code = "PGRST204"

    def __str__(self):
        return "Could not find the 'is_admin' column of 'users' in the schema cache"


class _ScriptedUsersTable:
    """Fluent fake: full-column select raises, base-column select returns rows."""
    def __init__(self, base_rows):
        self._base_rows = base_rows
        self._selected = None

    def table(self, name):
        assert name == "users"
        return self

    def select(self, cols, **kwargs):
        self._selected = cols
        return self

    def order(self, col, desc=False):
        return self

    def limit(self, n):
        return self

    def execute(self):
        if admin_router._ADMIN_USER_COLUMNS in self._selected:
            raise _SchemaError()
        assert self._selected == admin_router._ADMIN_USER_BASE_COLUMNS
        return FakeAdminUser(self._base_rows)


def test_fetch_admin_users_degrades_on_missing_columns(monkeypatch):
    table = _ScriptedUsersTable([{"id": "u1", "email": "a@b.com", "created_at": "2024-01-01"}])
    monkeypatch.setattr(admin_router, "db", lambda: table)
    users, degraded = admin_router._fetch_admin_users(limit=50)
    assert degraded is True
    assert users[0]["is_admin"] is False
    assert users[0]["is_suspended"] is False
    assert users[0]["suspended_reason"] is None
    assert users[0]["email"] == "a@b.com"


def test_fetch_admin_users_propagates_other_errors(monkeypatch):
    class _Boom(Exception):
        code = None

        def __str__(self):
            return "connection reset by peer"

    class _T:
        def table(self, name):
            return self

        def select(self, cols, **kwargs):
            return self

        def order(self, col, desc=False):
            return self

        def limit(self, n):
            return self

        def execute(self):
            raise _Boom()

    monkeypatch.setattr(admin_router, "db", lambda: _T())
    with pytest.raises(_Boom):
        admin_router._fetch_admin_users(limit=50)


def test_update_user_status_schema_mismatch_is_503(monkeypatch):
    class _T:
        def table(self, name):
            return self

        def update(self, payload):
            return self

        def eq(self, col, val):
            return self

        def execute(self):
            raise _SchemaError()

    monkeypatch.setattr(admin_router, "db", lambda: _T())
    body = admin_router.UserStatusUpdate(suspended=True, reason="spam")
    with pytest.raises(HTTPException) as exc:
        admin_router.update_user_status("u1", body, admin={"id": "admin1"})
    assert exc.value.status_code == 503
    assert "migration" in exc.value.detail.lower()


def test_system_health_schema_mismatch_is_503(monkeypatch):
    class _T:
        def table(self, name):
            assert name == "system_health"
            return self

        def select(self, *cols, **kwargs):
            return self

        def order(self, col, desc=False):
            return self

        def limit(self, n):
            return self

        def execute(self):
            raise _SchemaError()

    monkeypatch.setattr(admin_router, "db", lambda: _T())
    with pytest.raises(HTTPException) as exc:
        admin_router.system_health()
    assert exc.value.status_code == 503
    assert "migration" in exc.value.detail.lower()
