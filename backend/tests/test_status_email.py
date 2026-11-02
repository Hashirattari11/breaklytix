"""Daily status email tests: compose, once-per-day guard, dispatch counting.

Offline: the Supabase client and the alert-email transport are monkeypatched.
"""
from datetime import datetime, timezone

from app import status_email


def test_compose_contains_repo_rows_and_links():
    rows = [
        {"repo": "acme/api", "rescan": {"status": "ok", "reason": "", "files_scanned": 40, "detections": 3},
         "breaking_today": 2, "code_issues": 1},
        {"repo": "acme/web", "rescan": {"status": "fallback", "reason": "no_github_token"},
         "breaking_today": 0, "code_issues": 0},
    ]
    subject, html, text = status_email.compose_daily_status_email(rows, "2026-11-02")

    assert subject == "Breaklytix daily status — 2026-11-02"
    assert "acme/api" in html and "acme/web" in html
    assert "Breaking today" in html
    assert "1 of 2" in html  # headline counts repos needing attention
    # rescan wording
    assert "Fresh re-scan from GitHub completed — 3 detection(s) from 40 file(s)" in html
    assert "Stored results only (no usable GitHub token)" in html
    # text mirror
    assert "acme/api" in text and "breaking today: 2" in text
    assert "/dashboard/settings" in text


def test_compose_empty_repos_connect_copy():
    subject, html, text = status_email.compose_daily_status_email([], "2026-11-02")

    assert subject == "Breaklytix daily status — 2026-11-02"
    assert "No repositories are connected yet." in html
    assert "/dashboard/repos" in html
    assert "/dashboard/repos" in text
    assert "Connect a repo" in text


def test_rescan_text_labels():
    assert status_email._rescan_text({"status": "ok", "reason": "", "detections": 2, "files_scanned": 9}) == (
        "Fresh re-scan from GitHub completed — 2 detection(s) from 9 file(s)"
    )
    assert status_email._rescan_text({"status": "ok_partial", "reason": "time_budget", "files_scanned": 3}) == (
        "Partial fresh re-scan (daily time budget reached) — 3 file(s) so far"
    )
    assert status_email._rescan_text({"status": "stored_only", "reason": "not_requested"}) == "Stored results only"
    assert status_email._rescan_text(None) == "Stored results only"
    assert status_email._rescan_text({"status": "fallback", "reason": "github_error"}) == (
        "Stored results only (GitHub was unreachable)"
    )


class _RowsDB:
    """Fake db: email_deliveries lookups return canned rows."""

    def __init__(self, data):
        self._data = data

    def __call__(self):
        return self

    def table(self, name):
        return self

    def select(self, *cols, **kw):
        return self

    def eq(self, *a, **kw):
        return self

    def in_(self, *a, **kw):
        return self

    def gte(self, *a, **kw):
        return self

    def limit(self, n):
        return self

    def execute(self):
        class _Resp:
            data = self._data
        return _Resp()


class _RaisingDB(_RowsDB):
    def table(self, name):
        raise RuntimeError("db down")


def test_already_sent_true_when_rows(monkeypatch):
    monkeypatch.setattr(status_email, "db", _RowsDB([{"id": "row-1"}]))
    assert status_email._daily_status_already_sent("u1", "2026-11-02") is True


def test_already_sent_fails_open_on_db_error(monkeypatch):
    monkeypatch.setattr(status_email, "db", _RaisingDB([]))
    assert status_email._daily_status_already_sent("u1", "2026-11-02") is False


def _no_capture(monkeypatch):
    sent_calls = []
    monkeypatch.setattr(status_email, "send_alert_email", lambda **kw: sent_calls.append(kw) or {"ok": True, "status": "sent", "provider_message_id": "m-1"})
    return sent_calls


def test_dispatch_sends_only_to_opted_in_users(monkeypatch):
    calls = _no_capture(monkeypatch)
    monkeypatch.setattr(status_email, "_daily_status_already_sent", lambda uid, day: False)

    reports = {
        "user-A": {"email": "a@x.test", "notify": True, "repos": [
            {"repo": "acme/api", "rescan": {"status": "ok", "reason": "", "files_scanned": 5, "detections": 1},
             "breaking_today": 0, "code_issues": 0}]},
        "user-B": {"email": "b@x.test", "notify": False, "repos": []},
        "user-C": {"email": "  ", "notify": True, "repos": []},   # no email -> skipped silently
    }
    out = status_email.send_daily_status_reports(reports)

    assert out == {"sent": 1, "skipped": 0, "failed": 0}
    assert len(calls) == 1
    call = calls[0]
    assert call["user_id"] == "user-A"
    assert call["recipient"] == "a@x.test"
    assert call["alert_type"] == "daily_status"
    # Daily status is a scheduled summary, not a burst alert: the 5/day cap
    # must not block it (its own once-per-day guard applies instead).
    assert call["enforce_daily_cap"] is False
    today = datetime.now(timezone.utc).date().isoformat()
    assert call["fingerprint"] == f"daily_status:user-A:{today}"


def test_dispatch_skips_when_already_sent_today(monkeypatch):
    _no_capture(monkeypatch)
    seen = []
    monkeypatch.setattr(
        status_email, "_daily_status_already_sent",
        lambda uid, day: (seen.append((uid, day)) or True),
    )
    reports = {"user-A": {"email": "a@x.test", "notify": True, "repos": []}}
    out = status_email.send_daily_status_reports(reports)
    assert out == {"sent": 0, "skipped": 1, "failed": 0}
    assert seen == [("user-A", datetime.now(timezone.utc).date().isoformat())]


def test_dispatch_counts_outcomes(monkeypatch):
    outcomes = [
        {"ok": False, "status": "failed", "error_category": "rejected"},
        {"ok": True, "status": "skipped", "skipped_duplicate": True},
        {"ok": False, "status": "failed", "error_category": "rate_limit"},
    ]
    recorded = []

    def fake_send(**kw):
        recorded.append(kw)
        return outcomes[len(recorded) - 1]

    monkeypatch.setattr(status_email, "send_alert_email", fake_send)
    monkeypatch.setattr(status_email, "_daily_status_already_sent", lambda uid, day: False)

    reports = {
        f"user-{i}": {"email": f"u{i}@x.test", "notify": True, "repos": []}
        for i in range(3)
    }
    out = status_email.send_daily_status_reports(reports)
    assert out == {"sent": 0, "skipped": 1, "failed": 2}
    assert len(recorded) == 3


def test_dispatch_tolerates_compose_error(monkeypatch):
    _no_capture(monkeypatch)
    monkeypatch.setattr(status_email, "_daily_status_already_sent", lambda uid, day: False)
    monkeypatch.setattr(
        status_email, "compose_daily_status_email",
        lambda rows, day: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    reports = {"user-A": {"email": "a@x.test", "notify": True, "repos": []}}
    out = status_email.send_daily_status_reports(reports)
    assert out == {"sent": 0, "skipped": 0, "failed": 1}
