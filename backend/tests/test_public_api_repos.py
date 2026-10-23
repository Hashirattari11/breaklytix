"""Offline tests for public repository endpoints used by the CLI."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import deps
from app import routers
from app import routers as routers_pkg
from app.main import app
from app.routers import public_api
from app.routers import repos as repos_router


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _DB:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        assert name == "repos"
        return _Query(self._rows)


def test_public_repos_requires_bearer():
    res = TestClient(app).get("/api/public/v1/repos")
    assert res.status_code == 401
    assert res.headers.get("www-authenticate") == "Bearer"


def test_public_repos_lists_only_authenticated_users_repos(monkeypatch):
    app.dependency_overrides[public_api._authenticate_bearer] = lambda: "user-1"
    monkeypatch.setattr(public_api, "_get_rate_limit", lambda user_id: 100)
    monkeypatch.setattr(public_api, "db", lambda: _DB([
        {
            "id": "repo-1",
            "full_name": "acme/app",
            "default_branch": "main",
            "connected_at": "2026-01-01T00:00:00Z",
        }
    ]))

    try:
        res = TestClient(app).get("/api/public/v1/repos", headers={"Authorization": "Bearer afx_live_test"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json() == [
        {
            "id": "repo-1",
            "full_name": "acme/app",
            "default_branch": "main",
            "connected_at": "2026-01-01T00:00:00Z",
        }
    ]


def test_public_repo_scan_delegates_to_owned_repo_scan(monkeypatch):
    app.dependency_overrides[public_api._authenticate_bearer] = lambda: "user-1"
    monkeypatch.setattr(public_api, "_get_rate_limit", lambda user_id: 100)

    called = {}

    def fake_scan(repo_id, user_id):
        called["repo_id"] = repo_id
        called["user_id"] = user_id
        return {
            "repo_id": repo_id,
            "files_scanned": 1,
            "detections_found": 0,
            "apis_detected": [],
            "last_scanned_at": "2026-01-01T00:00:00Z",
            "plan_limit_exceeded": False,
            "plan_warning": None,
            "new_apis_detected": 0,
            "monitoring_limit": 0,
        }

    monkeypatch.setattr(repos_router, "scan_repo", fake_scan)

    try:
        res = TestClient(app).post(
            "/api/public/v1/repos/repo-1/scan",
            headers={"Authorization": "Bearer afx_live_test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200
    assert called == {"repo_id": "repo-1", "user_id": "user-1"}
    assert res.json()["repo_id"] == "repo-1"
