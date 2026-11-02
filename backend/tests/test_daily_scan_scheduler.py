"""Scheduler wiring tests: rescan quota/rotation + per-user daily email report.

Offline: db, the fresh re-scan core, code-health checks, and the email
dispatch are monkeypatched; this file verifies the ORCHESTRATION in
changelog.scheduler (quota gating, rotation order, report building, summary).
"""
from datetime import datetime, timedelta, timezone

from app.changelog import scheduler as sched


USER_A = "22222222-2222-2222-2222-222222222222"
USER_B = "33333333-3333-3333-3333-333333333333"

RESCAN_OK = {
    "status": "ok", "reason": "", "files_scanned": 42, "detections": 7, "new_apis": 1,
}
RESCAN_PARTIAL = dict(RESCAN_OK, status="ok_partial", reason="time_budget", files_scanned=3)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _make_store():
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    return {
        "repos": [
            {"id": "repo-1", "full_name": "acme/api", "user_id": USER_A,
             "default_branch": "main", "last_scanned_at": "2026-01-01T00:00:00+00:00"},
            {"id": "repo-2", "full_name": "acme/web", "user_id": USER_A,
             "default_branch": "main", "last_scanned_at": None},
            {"id": "repo-3", "full_name": "acme/fresh", "user_id": USER_B,
             "default_branch": "main", "last_scanned_at": one_hour_ago},
        ],
        "users": [
            {"id": USER_A, "email": "a@x.test", "notify_daily_status": True},
            {"id": USER_B, "email": "b@x.test", "notify_daily_status": False},
        ],
        "daily_scan_runs": [
            {"repo_id": "repo-3", "ran_at": _now_iso()},
        ],
        "provider_connections": [
            {"user_id": USER_A, "provider": "stripe"},
            {"user_id": USER_A, "provider": "openai"},
        ],
        "changelog_events": [],
        "api_detections": [],
        "code_health_issues": [],
    }


class _Query:
    def __init__(self, rows, store=None, name=None):
        self._rows = list(rows)
        self._store = store
        self._name = name
        self.filters: list[tuple] = []
        self._insert: dict | None = None

    def select(self, *cols, **kw):
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, vals))
        return self

    def gte(self, col, val):
        self.filters.append(("gte", col, val))
        return self

    def order(self, col, desc: bool = False):
        self._rows.sort(key=lambda r: r.get(col) or "")
        if desc:
            self._rows.reverse()
        return self

    def limit(self, n):
        self.filters.append(("limit", n))
        return self

    def insert(self, payload: dict):
        self._insert = dict(payload)
        return self

    def update(self, payload: dict):
        return self

    def upsert(self, payload, on_conflict=None):
        return self

    def execute(self):
        rows = self._rows
        for f in self.filters:
            op = f[0]
            if op == "eq":
                rows = [r for r in rows if r.get(f[1]) == f[2]]
            elif op == "in":
                rows = [r for r in rows if r.get(f[1]) in f[2]]
            elif op == "gte":
                rows = [r for r in rows if (r.get(f[1]) or "") >= f[2]]
            elif op == "limit":
                rows = rows[: f[1]]
        if self._insert is not None and self._store is not None:
            self._store.setdefault(self._name, []).append(self._insert)
            rows = [self._insert]
        class _Resp:
            data = rows
        return _Resp()


class _FakeDB:
    def __init__(self, tables: dict[str, list[dict]]):
        self.store = {name: list(rows) for name, rows in tables.items()}

    def __call__(self):
        return self

    def table(self, name: str):
        return _Query(self.store.get(name, []), store=self.store, name=name)


def _install_patches(monkeypatch, rescan_outcomes: list[dict] | None):
    """Point scheduler's collaborators at fakes; return the recorded artifacts."""
    fake_db = _FakeDB(_make_store())
    monkeypatch.setattr(sched, "db", fake_db)
    monkeypatch.setattr("app.health.code_health.run_code_health_checks", lambda *a, **k: [])

    rescan_calls = []
    if rescan_outcomes is not None:
        outcomes = list(rescan_outcomes)

        def fake_rescan(repo, user_id, deadline=None):
            rescan_calls.append({"repo": repo["id"], "user_id": user_id, "deadline": deadline})
            return outcomes.pop(0) if outcomes else dict(RESCAN_OK)

        monkeypatch.setattr("app.rescan.rescan_repo_fresh", fake_rescan)

    email_reports = []
    email_calls = []

    def fake_dispatch(reports):
        email_reports.append(reports)
        return {"sent": 1, "skipped": 0, "failed": 0}

    monkeypatch.setattr("app.status_email.send_daily_status_reports", fake_dispatch)
    monkeypatch.setattr(sched, "DAILY_RESCAN_MAX_REPOS", 5, raising=False)
    monkeypatch.setattr(sched, "DAILY_RESCAN_SECONDS_TOTAL", 35.0, raising=False)
    monkeypatch.setattr(sched, "DAILY_RESCAN_SECONDS_PER_REPO", 20.0, raising=False)
    return {"db": fake_db, "rescan_calls": rescan_calls, "email_reports": email_reports,
            "email_calls": email_calls}


def test_full_run_rescans_due_repos_and_reports_opted_in_user(monkeypatch):
    arts = _install_patches(monkeypatch, rescan_outcomes=[dict(RESCAN_OK), dict(RESCAN_OK)])

    summary = sched.run_daily_scans()

    # repo-3 was scanned < 24h ago -> skipped; the other two are due.
    assert summary["repos_total"] == 3
    assert summary["repos_due"] == 2
    assert summary["rescan_attempts"] == 2
    assert summary["rescan_ok"] == 2
    assert summary["rescan_partial"] == 0
    assert summary["emails"] == {"sent": 1, "skipped": 0, "failed": 0}
    assert len(arts["rescan_calls"]) == 2

    # Rotation: never-scanned repo-2 gets its rescan first.
    assert arts["rescan_calls"][0]["repo"] == "repo-2"
    assert arts["rescan_calls"][1]["repo"] == "repo-1"

    # Per-user report: user-A opted in with both repo rows; skipped repo-3 excluded.
    reports = arts["email_reports"][0]
    assert reports[USER_A]["notify"] is True
    assert reports[USER_A]["email"] == "a@x.test"
    repo_names = [r["repo"] for r in reports[USER_A]["repos"]]
    assert set(repo_names) == {"acme/api", "acme/web"}
    # report rows carry rescan + today's issue counts
    api_row = next(r for r in reports[USER_A]["repos"] if r["repo"] == "acme/api")
    assert api_row["rescan"]["status"] == "ok"
    assert api_row["breaking_today"] == 0
    # user-B has no report entry (repo-3 skipped before report building)
    assert USER_B not in reports

    # daily_scan_runs bookkeeping grew by the two due repos
    runs = arts["db"].store["daily_scan_runs"]
    assert len([r for r in runs if r["repo_id"] in ("repo-1", "repo-2")]) == 2


def test_rescan_quota_gives_stored_only_to_leftover_repos(monkeypatch):
    arts = _install_patches(monkeypatch, rescan_outcomes=[dict(RESCAN_OK)])
    monkeypatch.setattr(sched, "DAILY_RESCAN_MAX_REPOS", 1, raising=False)

    summary = sched.run_daily_scans()

    assert summary["rescan_attempts"] == 1
    assert summary["rescan_ok"] == 1
    assert len(arts["rescan_calls"]) == 1          # repo-2 only (rotation order)

    reports = arts["email_reports"][0]
    web_row = next(r for r in reports[USER_A]["repos"] if r["repo"] == "acme/web")
    api_row = next(r for r in reports[USER_A]["repos"] if r["repo"] == "acme/api")
    assert web_row["rescan"]["status"] == "ok"
    assert api_row["rescan"]["status"] == "stored_only"   # quota exhausted, checked from stored data
    # Stored checks still ran for both repos:
    runs = arts["db"].store["daily_scan_runs"]
    assert len([r for r in runs if r["repo_id"] in ("repo-1", "repo-2")]) == 2


def test_run_daily_scan_passes_through_rescan_stat(monkeypatch):
    arts = _install_patches(monkeypatch, rescan_outcomes=[dict(RESCAN_PARTIAL)])
    monkeypatch.setattr(sched, "db", _FakeDB(_make_store()))

    stats = sched.run_daily_scan("repo-1", rescan=True, rescan_deadline=123.5)

    assert stats["rescan"]["status"] == "ok_partial"
    assert stats["rescan"]["reason"] == "time_budget"
    assert stats["code_check_status"] == "clear"

    stats_off = sched.run_daily_scan("repo-1", rescan=False)
    assert stats_off["rescan"]["status"] == "stored_only"


def test_empty_repo_table_returns_summary_without_email(monkeypatch):
    arts = _install_patches(monkeypatch, rescan_outcomes=[])
    arts["db"].store["repos"] = []

    summary = sched.run_daily_scans()

    assert summary["repos_total"] == 0
    assert summary["emails"] == {"sent": 0, "skipped": 0, "failed": 0}
    assert arts["email_reports"] == []
