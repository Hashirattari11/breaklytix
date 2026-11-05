"""Unit tests for GitHub OAuth user/email resolution (app.github_client).

Offline: the httpx.Client transport is monkeypatched with a fake handler list,
so no real GitHub calls are made.
"""
from app.github_client import get_authenticated_user, GitHubError


class _Resp:
    def __init__(self, status_code: int = 200, data=None):
        self.status_code = status_code
        self._data = data
        self.text = ""

    def json(self):
        return self._data


class _Client:
    def __init__(self, handlers):
        self._handlers = handlers

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, url, **kwargs):
        # Exact path matching; longest pattern first so "/user/emails" wins over "/user".
        path = url.replace("https://api.github.com", "").rstrip("/")
        for pattern, resp in sorted(self._handlers, key=lambda h: -len(h[0])):
            if path == pattern.rstrip("/"):
                return resp
        raise AssertionError(f"unexpected GET {url}")


def _patch(monkeypatch, handlers):
    monkeypatch.setattr("app.github_client.httpx.Client", lambda **kw: _Client(handlers))


def test_returns_email_from_user_payload(monkeypatch):
    _patch(monkeypatch, [("/user", _Resp(200, {"id": 1, "login": "octocat", "email": "octo@x.com"}))])
    out = get_authenticated_user("tok")
    assert out == {"github_id": "1", "github_login": "octocat", "email": "octo@x.com"}


def test_prefers_primary_verified_email_from_user_emails(monkeypatch):
    _patch(
        monkeypatch,
        [
            ("/user", _Resp(200, {"id": 1, "login": "octocat", "email": None})),
            ("/user/emails", _Resp(200, [
                {"email": "unverified@x.com", "verified": False, "primary": False},
                {"email": "octo@x.com", "verified": True, "primary": True},
            ])),
        ],
    )
    assert get_authenticated_user("tok")["email"] == "octo@x.com"


def test_falls_back_to_first_email_when_none_verified(monkeypatch):
    _patch(
        monkeypatch,
        [
            ("/user", _Resp(200, {"id": 1, "login": "octocat", "email": None})),
            ("/user/emails", _Resp(200, [
                {"email": "fallback@x.com", "verified": False, "primary": True},
            ])),
        ],
    )
    assert get_authenticated_user("tok")["email"] == "fallback@x.com"


def test_email_none_when_user_emails_unavailable(monkeypatch):
    _patch(
        monkeypatch,
        [
            ("/user", _Resp(200, {"id": 1, "login": "octocat", "email": None})),
            ("/user/emails", _Resp(403, {"message": "Forbidden"})),
        ],
    )
    assert get_authenticated_user("tok")["email"] is None


def test_user_fetch_failure_raises_gh_error(monkeypatch):
    _patch(monkeypatch, [("/user", _Resp(401, {"message": "Bad credentials"}))])
    try:
        get_authenticated_user("tok")
        raise AssertionError("should have raised")
    except GitHubError as exc:
        assert "401" in str(exc)
