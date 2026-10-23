"""HTTP-level authorization tests for the admin API.

These exercise the real FastAPI stack (middleware + dependency graph) rather
than calling ``require_admin`` directly, so they prove the contract the
frontend relies on:

* no token                         -> 401
* malformed / forged token         -> 401
* valid token, ordinary user       -> 403
* valid token, suspended admin     -> 403
* valid token, database admin      -> 200
* valid token, ADMIN_USER_IDS      -> 200

The database layer is monkeypatched (no live Supabase); everything above it is
the production code path.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.deps import get_current_user_id
from app.main import app
from app.routers import admin as admin_router

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _override_user(user_id: str = "u1") -> None:
    """Bypass only token decoding; require_admin still hits the DB fake."""
    app.dependency_overrides[get_current_user_id] = lambda: user_id


def _patch_user(monkeypatch, row: dict | None) -> None:
    monkeypatch.setattr(deps, "fetch_one", lambda table, match: row)


def _patch_counts(monkeypatch) -> None:
    monkeypatch.setattr(admin_router, "_count", lambda table: 0)
    monkeypatch.setattr(admin_router, "_count_where", lambda table, **filters: 0)


# ---------------------------------------------------------------------------
# Unauthenticated / invalid credentials
# ---------------------------------------------------------------------------
def test_admin_overview_without_token_is_401():
    res = client.get("/admin/overview")
    assert res.status_code == 401


def test_admin_overview_with_invalid_token_is_401(monkeypatch):
    monkeypatch.setattr(deps.settings, "jwt_secret", "test-secret-0123456789abcdef0123456789abcdef")
    res = client.get(
        "/admin/overview", headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert res.status_code == 401


def test_admin_mutation_without_token_is_401():
    res = client.patch("/admin/users/u2/plan", json={"plan": "enterprise"})
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Authenticated but not an admin
# ---------------------------------------------------------------------------
def test_admin_overview_non_admin_is_403(monkeypatch):
    _override_user()
    _patch_user(monkeypatch, {"id": "u1", "email": "user@example.com", "is_admin": False})

    res = client.get("/admin/overview")
    assert res.status_code == 403
    assert res.json()["detail"] == "Admin access required"


def test_admin_mutation_non_admin_is_403(monkeypatch):
    """Authorization runs before the handler can touch the database."""
    _override_user()
    _patch_user(monkeypatch, {"id": "u1", "email": "user@example.com", "is_admin": False})

    res = client.patch("/admin/users/u2/plan", json={"plan": "enterprise"})
    assert res.status_code == 403


def test_admin_repo_delete_non_admin_is_403(monkeypatch):
    _override_user()
    _patch_user(monkeypatch, {"id": "u1", "email": "user@example.com", "is_admin": False})

    res = client.delete("/admin/repos/repo-1")
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Authorized admins
# ---------------------------------------------------------------------------
def test_admin_overview_db_admin_is_200(monkeypatch):
    _override_user()
    _patch_user(monkeypatch, {"id": "u1", "email": "admin@example.com", "is_admin": True})
    _patch_counts(monkeypatch)

    res = client.get("/admin/overview")
    assert res.status_code == 200
    assert res.json()["total_users"] == 0


def test_admin_overview_env_allowlist_is_200(monkeypatch):
    monkeypatch.setattr(deps.settings, "admin_user_ids", "u-allow, u-other")
    _override_user("u-allow")
    _patch_user(
        monkeypatch,
        {"id": "u-allow", "email": "owner@example.com", "is_admin": False},
    )
    _patch_counts(monkeypatch)

    res = client.get("/admin/overview")
    assert res.status_code == 200


def test_admin_overview_env_allowlist_does_not_grant_others(monkeypatch):
    monkeypatch.setattr(deps.settings, "admin_user_ids", "u-allow")
    _override_user("u1")
    _patch_user(monkeypatch, {"id": "u1", "email": "user@example.com", "is_admin": False})

    res = client.get("/admin/overview")
    assert res.status_code == 403


def test_admin_overview_valid_admin_jwt_is_200(monkeypatch):
    """End-to-end token decode + DB role check with a real signed JWT."""
    monkeypatch.setattr(deps.settings, "jwt_secret", "test-secret-0123456789abcdef0123456789abcdef")
    _patch_user(monkeypatch, {"id": "u1", "email": "admin@example.com", "is_admin": True})
    _patch_counts(monkeypatch)

    token = deps.issue_session_token("u1")
    res = client.get("/admin/overview", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200


def test_suspended_admin_jwt_is_403(monkeypatch):
    monkeypatch.setattr(deps.settings, "jwt_secret", "test-secret-0123456789abcdef0123456789abcdef")
    _patch_user(
        monkeypatch,
        {
            "id": "u1",
            "email": "admin@example.com",
            "is_admin": True,
            "is_suspended": True,
        },
    )

    token = deps.issue_session_token("u1")
    res = client.get("/admin/overview", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert res.json()["detail"] == "Account suspended"


# ---------------------------------------------------------------------------
# Changelog admin endpoints (outside /admin, same server-side role check)
# ---------------------------------------------------------------------------
CHANGELOG_ADMIN_ENDPOINTS = [
    ("get", "/internal/changelog/admin/pending"),
    ("post", "/internal/changelog/admin/approve/evt-1"),
    ("post", "/internal/changelog/admin/disable/evt-1"),
]


@pytest.mark.parametrize("method,path", CHANGELOG_ADMIN_ENDPOINTS)
def test_changelog_admin_requires_token(method, path):
    res = getattr(client, method)(path)
    assert res.status_code == 401


@pytest.mark.parametrize("method,path", CHANGELOG_ADMIN_ENDPOINTS)
def test_changelog_admin_non_admin_is_403(monkeypatch, method, path):
    _override_user()
    monkeypatch.setattr("app.changelog.router.is_admin", lambda _uid: False)
    res = getattr(client, method)(path)
    assert res.status_code == 403


def test_changelog_admin_pending_admin_is_200(monkeypatch):
    _override_user()
    monkeypatch.setattr("app.changelog.router.is_admin", lambda _uid: True)
    monkeypatch.setattr("app.changelog.router.get_pending_alerts", lambda: [])
    res = client.get("/internal/changelog/admin/pending")
    assert res.status_code == 200
    assert res.json() == {"events": []}


def test_changelog_admin_approve_admin_is_200(monkeypatch):
    _override_user()
    monkeypatch.setattr("app.changelog.router.is_admin", lambda _uid: True)
    monkeypatch.setattr("app.changelog.router.approve_alert", lambda _event, _user: True)
    monkeypatch.setattr("app.changelog.router.send_approved_alerts", lambda: {})
    res = client.post("/internal/changelog/admin/approve/evt-1")
    assert res.status_code == 200
