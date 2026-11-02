"""Unit tests for the fresh GitHub re-scan core (app.rescan).

Offline: GitHub client calls, router token helpers, billing, and the Supabase
client are all monkeypatched. Detection runs through a controlled fake
scan_file so detection outcomes are deterministic.
"""
import time
from datetime import datetime, timedelta, timezone

import pytest

from app import rescan as rescan_mod
from app.detection import Detection
from app.github_client import GitHubAuthError, GitHubError

REPO_ID = "11111111-1111-1111-1111-111111111111"
REPO = {"id": REPO_ID, "full_name": "acme/api", "default_branch": "main"}
TREE = [
    {"path": "src/foo.py", "sha": "s1", "size": 120},
    {"path": "img/logo.png", "sha": "s2", "size": 50},          # not scannable
    {"path": "big/main.py", "sha": "s3", "size": 10_000_000},   # over max_file_bytes
]


class _Resp:
    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class _FakeDB:
    """Fluent fake for the tables rescan touches."""

    def __init__(self, existing_detections=None):
        self._table = None
        self.existing_detections = list(existing_detections or [])
        self.upserts = []
        self.repo_updates = []

    def __call__(self):
        return self

    def table(self, name):
        self._table = name
        return self

    def select(self, *cols, **kw):
        self._select = True
        return self

    def eq(self, *a, **kw):
        return self

    def update(self, payload):
        self._pending_update = payload
        return self

    def upsert(self, rows, on_conflict=None):
        if self._table == "api_detections":
            self.upserts.append((rows, on_conflict))
        return self

    def execute(self):
        if self._table == "repos" and getattr(self, "_pending_update", None) is not None:
            self.repo_updates.append(self._pending_update)
            self._pending_update = None
            return _Resp([])
        if self._table == "api_detections" and getattr(self, "_select", False):
            self._select = False
            return _Resp(list(self.existing_detections))
        return _Resp([])


class _Recorder:
    def __init__(self):
        self.rows = []

    def __call__(self, repo_id, status, **kw):
        self.rows.append({"repo_id": repo_id, "status": status, **kw})


def _patch_happy_github(monkeypatch, blob_ok=True):
    monkeypatch.setattr(
        "app.routers.repos._repo_scan_tokens", lambda repo, user_id: ["tok"]
    )
    monkeypatch.setattr(
        "app.github_client.list_repo_tree",
        lambda tok, full, branch: list(TREE),
    )

    if blob_ok:
        monkeypatch.setattr(
            "app.github_client.get_blob_text", lambda tok, full, sha: "x = 1"
        )
    else:
        def raiser(tok, full, sha):
            raise GitHubError("blob fetch failed")
        monkeypatch.setattr("app.github_client.get_blob_text", raiser)


def _fake_scan(path, text):
    if path.endswith("foo.py"):
        return [
            Detection(
                api_name="stripe",
                file_path=path,
                line_number=3,
                matched_snippet="stripe.api_key = 'sk_test'",
                symbols=["stripe"],
            )
        ]
    return []


def _install_fake_scanner(monkeypatch):
    monkeypatch.setattr(rescan_mod, "scan_file", _fake_scan)


def test_ok_rescan_upserts_detections_and_records_completed_scan(monkeypatch):
    _patch_happy_github(monkeypatch)
    _install_fake_scanner(monkeypatch)
    fake = _FakeDB(existing_detections=[{"api_name": "stripe"}])
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    result = rescan_mod.rescan_repo_fresh(REPO, "user-1")

    assert result["status"] == "ok"
    assert result["files_scanned"] == 1          # png excluded, oversized excluded
    assert result["detections"] == 1
    assert result["new_apis"] == 0               # stripe already stored -> no billing churn
    assert len(fake.upserts) == 1
    rows, on_conflict = fake.upserts[0]
    assert rows[0]["api_name"] == "stripe"
    assert rows[0]["repo_id"] == REPO_ID
    assert on_conflict == "repo_id,api_name,file_path,line_number"
    assert fake.repo_updates and "last_scanned_at" in fake.repo_updates[0]
    assert rec.rows[0]["status"] == "COMPLETED"
    assert rec.rows[0]["stats"]["daily_rescan"] is True
    assert result["plan_warning"] is None


def test_deadline_enforced_partial_rescan(monkeypatch):
    _patch_happy_github(monkeypatch)
    _install_fake_scanner(monkeypatch)
    fake = _FakeDB(existing_detections=[{"api_name": "stripe"}])
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    result = rescan_mod.rescan_repo_fresh(
        REPO, "user-1", deadline=time.monotonic() - 1  # already expired
    )

    assert result["status"] == "ok_partial"
    assert result["reason"] == "time_budget"
    assert result["files_scanned"] == 0
    assert result["detections"] == 0
    assert fake.upserts == []                     # nothing to upsert
    # Real tree fetch happened -> last_scanned_at is still updated truthfully.
    assert fake.repo_updates
    assert rec.rows[0]["status"] == "COMPLETED"
    assert rec.rows[0]["stats"]["timed_out"] is True


def test_no_token_falls_back_without_scan_row(monkeypatch):
    monkeypatch.setattr("app.routers.repos._repo_scan_tokens", lambda repo, user_id: [])
    fake = _FakeDB()
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    result = rescan_mod.rescan_repo_fresh(REPO, "user-1")

    assert result == {
        "status": "fallback",
        "reason": "no_github_token",
        "files_scanned": 0,
        "detections": 0,
        "new_apis": 0,
        "plan_warning": None,
    }
    assert fake.upserts == []
    assert fake.repo_updates == []
    assert rec.rows == []                        # nothing attempted -> nothing recorded


def test_github_auth_error_records_failed_scan(monkeypatch):
    _patch_happy_github(monkeypatch)
    monkeypatch.setattr(
        "app.routers.repos._repo_scan_tokens", lambda repo, user_id: ["tok"]
    )

    def boom(tok, full, branch):
        raise GitHubAuthError("All GitHub tokens were rejected (401): expired or revoked")

    monkeypatch.setattr("app.github_client.list_repo_tree", boom)
    fake = _FakeDB()
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    result = rescan_mod.rescan_repo_fresh(REPO, "user-1")

    assert result["status"] == "fallback"
    assert result["reason"] == "github_auth"
    assert rec.rows[0]["status"] == "FAILED"
    assert fake.upserts == []
    assert fake.repo_updates == []               # no false last_scanned_at


def test_github_tree_error_falls_back(monkeypatch):
    monkeypatch.setattr(
        "app.routers.repos._repo_scan_tokens", lambda repo, user_id: ["tok"]
    )

    def boom(tok, full, branch):
        raise GitHubError("Failed (403): rate limited")

    monkeypatch.setattr("app.github_client.list_repo_tree", boom)
    fake = _FakeDB()
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    result = rescan_mod.rescan_repo_fresh(REPO, "user-1")

    assert result["status"] == "fallback"
    assert result["reason"] == "github_error"
    assert rec.rows[0]["status"] == "FAILED"


def test_blob_error_skips_file_not_run(monkeypatch):
    _patch_happy_github(monkeypatch, blob_ok=False)
    fake = _FakeDB(existing_detections=[{"api_name": "stripe"}])
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    result = rescan_mod.rescan_repo_fresh(REPO, "user-1")

    # The scannable candidate fails at blob fetch -> skip it, scan continues cleanly.
    assert result["status"] == "ok"
    assert result["files_scanned"] == 0
    assert result["detections"] == 0


def test_new_apis_checked_against_plan_limit(monkeypatch):
    _patch_happy_github(monkeypatch)
    _install_fake_scanner(monkeypatch)
    fake = _FakeDB(existing_detections=[])       # nothing stored -> truly new API
    monkeypatch.setattr(rescan_mod, "db", fake)
    rec = _Recorder()
    monkeypatch.setattr("app.routers.repos._record_scan_row", rec)

    calls = {"check": 0, "increment": []}
    monkeypatch.setattr("app.billing.check_plan_limit", lambda uid, n: calls.__setitem__("check", n) or (True, ""))
    monkeypatch.setattr("app.billing.increment_api_count", lambda uid, n: calls["increment"].append((uid, n)))

    result = rescan_mod.rescan_repo_fresh(REPO, "user-9")

    assert calls["check"] == 1
    assert calls["increment"] == [("user-9", 1)]
    assert result["new_apis"] == 1
    assert result["detections"] == 1


def test_missing_repo_identity_falls_back(monkeypatch):
    fake = _FakeDB()
    monkeypatch.setattr(rescan_mod, "db", fake)
    result = rescan_mod.rescan_repo_fresh({"id": None, "full_name": ""}, "u")

    assert result["status"] == "fallback"
    assert result["reason"] == "missing_repo_identity"
