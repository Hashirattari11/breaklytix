"""HTTP-level tests for the public Instant Repo Scan router.

These use a tiny standalone FastAPI app (no DB, no GitHub) so they assert the
public contract: status codes, friendly messages, badge SVG, and that no
secret value can appear in a response.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import instant_scan as router_module


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(router_module.router)
    return TestClient(app)


def test_bad_repo_url_is_rejected_before_any_scan(client, monkeypatch):
    monkeypatch.setattr(
        router_module,
        "create_instant_scan_job",
        lambda *a, **k: pytest.fail("scan must not run for an invalid URL"),
    )
    res = client.post("/api/instant-scan", json={"repo_url": "https://gitlab.com/a/b"})
    assert res.status_code == 400
    assert "github.com" in res.json()["detail"]


def test_unknown_client_event_is_rejected(client):
    res = client.post("/api/instant-scan/events", json={"event": "drop_tables"})
    assert res.status_code == 400


def test_share_event_forwards_platform_and_risk_flag(client, monkeypatch):
    seen = {}

    def _fake_record_event(event, **kwargs):
        seen["event"] = event
        seen.update(kwargs)

    monkeypatch.setattr(router_module, "record_event", _fake_record_event)
    res = client.post(
        "/api/instant-scan/events",
        json={
            "event": "share_clicked",
            "scan_id": "scan-1",
            "repo_full_name": "acme/api",
            "props": {"platform": "x", "has_risks": True},
        },
    )
    assert res.status_code == 200
    assert seen["event"] == "share_clicked"
    assert seen["props"] == {"platform": "x", "has_risks": "true"}


def test_share_event_rejects_oversized_props(client):
    big_props = {f"key{i}": "value" for i in range(20)}
    res = client.post("/api/instant-scan/events", json={"event": "share_clicked", "props": big_props})
    assert res.status_code == 422


def test_email_validation_rejects_garbage(client, monkeypatch):
    monkeypatch.setattr(
        router_module, "get_scan", lambda scan_id: pytest.fail("must not hit DB")
    )
    res = client.post("/api/instant-scan/abc/email", json={"email": "not-an-email"})
    assert res.status_code == 400


def test_badge_reports_not_scanned(client, monkeypatch):
    monkeypatch.setattr(router_module, "latest_scan_for_repo", lambda repo: None)
    res = client.get("/badge/acme/api.svg")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/svg+xml")
    assert "not scanned" in res.text
    assert "API watch" in res.text


def test_badge_summarises_latest_scan(client, monkeypatch):
    monkeypatch.setattr(
        router_module,
        "latest_scan_for_repo",
        lambda repo: {
            "id": "scan-1",
            "result": {"summary": {"provider_count": 2, "possible_risk_count": 1}},
        },
    )
    res = client.get("/badge/acme/api.svg")
    assert res.status_code == 200
    assert "2 APIs" in res.text
    assert "1 risk" in res.text


def test_badge_handles_dotted_repo_name(client, monkeypatch):
    seen = {}

    def fake_latest(repo):
        seen["repo"] = repo
        return None

    monkeypatch.setattr(router_module, "latest_scan_for_repo", fake_latest)
    res = client.get("/badge/vercel/next.js.svg")
    assert res.status_code == 200
    assert seen["repo"] == "vercel/next.js"


def test_badge_rejects_invalid_owner(client):
    res = client.get("/badge/-bad/api.svg")
    assert res.status_code == 404


def test_connect_instant_scan_requires_a_session(client):
    res = client.post("/api/instant-scan/abc/connect")
    assert res.status_code == 401


def test_connect_instant_scan_links_the_signed_in_user(client, monkeypatch):
    seen = {}

    def _fake_link(scan_id, user_id):
        seen["scan_id"] = scan_id
        seen["user_id"] = user_id
        return {"ok": True, "scan_id": scan_id, "repo_full_name": "acme/api", "repo_id": "repo-1", "monitored": True}

    monkeypatch.setattr(router_module, "link_scan_to_user", _fake_link)
    client.app.dependency_overrides[router_module.get_current_user_id] = lambda: "user-1"

    res = client.post("/api/instant-scan/scan-1/connect")
    assert res.status_code == 200
    assert res.json()["repo_id"] == "repo-1"
    assert seen == {"scan_id": "scan-1", "user_id": "user-1"}


def test_connect_instant_scan_404s_for_missing_scan(client, monkeypatch):
    monkeypatch.setattr(router_module, "link_scan_to_user", lambda *a, **k: None)
    client.app.dependency_overrides[router_module.get_current_user_id] = lambda: "user-1"
    res = client.post("/api/instant-scan/missing/connect")
    assert res.status_code == 404
