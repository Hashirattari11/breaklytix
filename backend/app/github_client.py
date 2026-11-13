"""GitHub REST API client (OAuth + lightweight repo reading).

Design choice (a "sensible fix" over the original spec):
The spec suggested GitHub's *code search* API. In practice code search (a) only
indexes the default branch, (b) is heavily rate-limited (~30 req/min), and (c)
can miss files. For deterministic, complete scanning of a single connected repo
we instead use the **Git Trees API** (one call lists every file) + the **Blobs
API** (fetch only the source files we care about). No full `git clone`, still
lightweight, and far more reliable. See README "Deviations from the spec".

All calls are synchronous (httpx.Client); FastAPI runs our route handlers in a
threadpool, so this never blocks the event loop.
"""
from __future__ import annotations

import base64
import logging
from collections.abc import Callable, Iterable
from typing import TypeVar

import httpx

from .config import settings

logger = logging.getLogger("autofix.github")

GITHUB_API = "https://api.github.com"
GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"
API_VERSION = "2022-11-28"
TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class GitHubError(RuntimeError):
    pass


class GitHubAuthError(GitHubError):
    """Every candidate token was rejected with 401 Bad credentials."""


T = TypeVar("T")


def call_with_token_fallback(
    tokens: Iterable[str],
    call: Callable[[str], T],
) -> tuple[T, str]:
    """Invoke ``call(token)`` against GitHub, trying fresher tokens when the
    current one is rejected with 401. Returns ``(result, winning_token)`` so
    callers can reuse the exact token that worked for subsequent calls.

    - Empty candidate list -> ``GitHubAuthError`` (nothing to authenticate with).
    - Non-auth GitHub errors (404/422/5xx...) raise immediately, unchanged.
    - Every candidate rejected -> ``GitHubAuthError`` with a reconnect hint.
    """
    candidates = [t for t in tokens if t]
    if not candidates:
        raise GitHubAuthError("No GitHub connection on file. Re-authenticate.")
    last: GitHubError | None = None
    for t in candidates:
        try:
            return call(t), t
        except GitHubError as exc:
            last = exc
            if "401" in str(exc) or "Bad credentials" in str(exc):
                continue
            raise
    assert last is not None
    raise GitHubAuthError(
        "Your GitHub connection has expired. Please reconnect your account."
    )


def _headers(token: str) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "AutoFixAPI/1.0",
    }
    # Anonymous requests (no token configured) must NOT send an empty
    # `Authorization: Bearer ` header — GitHub rejects it as bad credentials.
    # This keeps the shared client usable for the public instant scanner.
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------
def exchange_code_for_token(code: str, redirect_uri: str | None = None) -> str:
    if not settings.github_client_id or not settings.github_client_secret:
        raise GitHubError("GitHub OAuth is not configured on the server.")
    payload = {
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "code": code,
    }
    if redirect_uri:
        payload["redirect_uri"] = redirect_uri
    with httpx.Client(timeout=TIMEOUT) as client:
        resp = client.post(
            GITHUB_OAUTH_TOKEN_URL,
            data=payload,
            headers={"Accept": "application/json", "User-Agent": "AutoFixAPI/1.0"},
        )
    if resp.status_code != 200:
        raise GitHubError(f"OAuth token exchange failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    if "error" in data:
        # Surface the machine error code so the router can map it to a safe,
        # actionable message (never includes the code or client secret).
        code = str(data.get("error") or "unknown_error")
        logger.warning("GitHub OAuth token exchange rejected: %s", code)
        raise GitHubError(f"OAuth error: {code}: {data.get('error_description', '')}")
    token = data.get("access_token")
    if not token:
        raise GitHubError("OAuth exchange returned no access_token.")
    return token


def get_authenticated_user(token: str) -> dict:
    """Return {id, login, email}. Falls back to /user/emails for a primary email.

    Email resolution is deliberately fail-soft: a missing email on /user or an
    empty/failed /user/emails list must surface as `email=None` (which the auth
    router turns into a clear, actionable 400) rather than an unhandled error.
    """
    with httpx.Client(timeout=TIMEOUT, headers=_headers(token)) as client:
        resp = client.get(f"{GITHUB_API}/user")
        if resp.status_code != 200:
            raise GitHubError(f"Failed to fetch user ({resp.status_code}): {resp.text}")
        user = resp.json()
        email = user.get("email") or None

        if not email:
            # Fall back to /user/emails (read via user:email scope) and pick the
            # primary *verified* address; otherwise use the first known address.
            try:
                em = client.get(f"{GITHUB_API}/user/emails")
                if em.status_code == 200:
                    raw = em.json()
                    emails = raw if isinstance(raw, list) else []
                    verified_primary = next(
                        (e for e in emails if e.get("primary") and e.get("verified")), None
                    )
                    fallback = verified_primary or (emails[0] if emails else None)
                    email = (fallback or {}).get("email") or None
            except Exception:  # noqa: BLE001 - email lookup must not mask auth errors
                email = None

    return {
        "github_id": str(user["id"]),
        "github_login": user.get("login"),
        "email": email,
    }


# ---------------------------------------------------------------------------
# Repos
# ---------------------------------------------------------------------------
def list_user_repos(token: str, limit: int = 100) -> list[dict]:
    """List repos the user can access (most recently pushed first)."""
    repos: list[dict] = []
    page = 1
    with httpx.Client(timeout=TIMEOUT, headers=_headers(token)) as client:
        while len(repos) < limit:
            resp = client.get(
                f"{GITHUB_API}/user/repos",
                params={"per_page": 100, "page": page, "sort": "pushed", "affiliation": "owner,collaborator,organization_member"},
            )
            if resp.status_code != 200:
                raise GitHubError(f"Failed to list repos ({resp.status_code}): {resp.text}")
            batch = resp.json()
            if not batch:
                break
            for r in batch:
                repos.append(
                    {
                        "github_repo_id": str(r["id"]),
                        "full_name": r["full_name"],
                        "default_branch": r.get("default_branch", "main"),
                        "private": bool(r.get("private")),
                    }
                )
            page += 1
    return repos[:limit]


def get_repo(token: str, full_name: str) -> dict:
    # follow_redirects: GitHub answers 301 for renamed/moved repositories.
    with httpx.Client(
        timeout=TIMEOUT, headers=_headers(token), follow_redirects=True
    ) as client:
        resp = client.get(f"{GITHUB_API}/repos/{full_name}")
    if resp.status_code != 200:
        raise GitHubError(f"Failed to fetch repo {full_name} ({resp.status_code}): {resp.text}")
    r = resp.json()
    return {
        "github_repo_id": str(r["id"]),
        "full_name": r["full_name"],
        "default_branch": r.get("default_branch", "main"),
        "private": bool(r.get("private")),
    }


def list_repo_tree(token: str, full_name: str, branch: str) -> tuple[list[dict], bool]:
    """Return ``(blob_entries, truncated)`` for the whole repo via one call.

    ``truncated`` is True when GitHub's git/trees API could not return the full
    tree (very large repos) — callers should treat results as partial.
    """
    with httpx.Client(
        timeout=TIMEOUT, headers=_headers(token), follow_redirects=True
    ) as client:
        resp = client.get(
            f"{GITHUB_API}/repos/{full_name}/git/trees/{branch}",
            params={"recursive": "1"},
        )
    if resp.status_code != 200:
        raise GitHubError(
            f"Failed to list tree for {full_name}@{branch} ({resp.status_code}): {resp.text}"
        )
    data = resp.json()
    truncated = bool(data.get("truncated"))
    entries = [
        {"path": e["path"], "sha": e["sha"], "size": e.get("size", 0)}
        for e in data.get("tree", [])
        if e.get("type") == "blob"
    ]
    return entries, truncated


def make_client(token: str = "") -> httpx.Client:
    """Create a pooled client for bulk calls (blobs, trees).

    Reusing one client across parallel workers avoids a TLS handshake per file,
    which is the difference between scanning a large repo in ~5s vs 30s+.
    The returned client is thread-safe and must be closed by the caller.
    """
    return httpx.Client(
        timeout=TIMEOUT,
        headers=_headers(token),
        limits=httpx.Limits(max_connections=16, max_keepalive_connections=16),
        follow_redirects=True,
    )


def get_blob_text(
    token: str,
    full_name: str,
    sha: str,
    *,
    client: httpx.Client | None = None,
) -> str | None:
    """Fetch a blob by sha and return decoded UTF-8 text (None if binary).

    Pass ``client`` (from :func:`make_client`) to reuse connections when
    fetching many blobs.
    """
    if client is not None:
        resp = client.get(f"{GITHUB_API}/repos/{full_name}/git/blobs/{sha}")
    else:
        with httpx.Client(
            timeout=TIMEOUT, headers=_headers(token), follow_redirects=True
        ) as own_client:
            resp = own_client.get(f"{GITHUB_API}/repos/{full_name}/git/blobs/{sha}")
    if resp.status_code != 200:
        raise GitHubError(f"Failed to fetch blob ({resp.status_code}): {resp.text}")
    data = resp.json()
    if data.get("encoding") != "base64":
        return data.get("content")
    try:
        raw = base64.b64decode(data["content"])
        return raw.decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None  # binary / non-utf8 — skip
