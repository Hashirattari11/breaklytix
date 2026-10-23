"""GitHub App authentication helpers for agency mode.

Generates JWTs and installation access tokens per GitHub's App auth docs.
No secret values are logged or stored — only used in-memory for API calls.
"""
from __future__ import annotations

import time
from typing import Optional
from urllib.parse import quote

import httpx
import jwt

from .config import settings


def _app_jwt() -> str:
    """Create a short-lived JWT signed with the App's private key.

    GitHub Apps authenticate to the API by signing a JWT with their private
    key (RS256). This JWT is valid for up to 10 minutes.
    """
    now = int(time.time())
    payload = {
        "iat": now - 60,          # Issued at (60s clock drift allowance)
        "exp": now + 600,         # Expires in 10 minutes
        "iss": settings.github_app_id,  # App ID
    }
    return jwt.encode(
        payload,
        settings.github_app_private_key,
        algorithm="RS256",
    )


def get_installation_access_token(installation_id: str) -> Optional[str]:
    """Exchange an installation_id for a short-lived installation access token.

    Returns the token string, or None on failure.
    """
    token = _app_jwt()
    url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        resp = httpx.post(url, headers=headers, timeout=15)
        if resp.status_code == 201:
            return resp.json().get("token")
    except Exception:
        pass
    return None


def list_installation_repos(installation_id: str) -> list[dict]:
    """List repos accessible to a GitHub App installation.

    Returns a list of repo dicts with keys: id, full_name, default_branch, private.
    """
    token = get_installation_access_token(installation_id)
    if not token:
        return []

    repos: list[dict] = []
    url = "https://api.github.com/installation/repositories"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        while url:
            resp = httpx.get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                break
            data = resp.json()
            for r in data.get("repositories", []):
                repos.append({
                    "id": r["id"],
                    "full_name": r["full_name"],
                    "default_branch": r.get("default_branch", "main"),
                    "private": r.get("private", False),
                })
            url = resp.links.get("next", {}).get("url")
    except Exception:
        pass
    return repos


def build_install_url(state: str) -> str:
    """Build the GitHub App installation URL for the client to pick repos.

    Both the App slug and OAuth state are URL-encoded so a missing/odd slug or
    a state containing reserved characters can never change the redirect target.
    """
    slug = (settings.github_app_slug or "").strip()
    if not slug:
        raise ValueError("GitHub App is not configured (GITHUB_APP_SLUG is empty)")
    return (
        f"https://github.com/apps/{quote(slug, safe='')}/installations/new"
        f"?state={quote(state, safe='')}"
    )
