"""Slack integration routes (Phase 5, Section 2).

Endpoints:
- GET  /slack/install       — returns the Slack App install URL for the current user
- GET  /slack/oauth/callback — Slack redirects here after user authorizes the app
- GET  /slack/connection     — returns current Slack connection status (or null)
- DELETE /slack/connection   — disconnect Slack
- POST /slack/interactions  — handle interactive button payloads (e.g. "Approve Fix")
"""
from __future__ import annotations

import json
import time
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from ..config import settings
from ..deps import get_current_user_id
from ..slack_integration import (
    SlackError,
    disconnect,
    exchange_install_code,
    get_connection,
    get_install_url_absolute,
    parse_interaction,
    save_connection,
    verify_slack_signature,
)

router = APIRouter(prefix="/slack", tags=["slack"])


def _signed_state(user_id: str) -> str:
    """Short-lived, signed OAuth state (never a raw user id)."""
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="Slack OAuth signing is not configured.")
    now = int(time.time())
    return jwt.encode(
        {
            "scope": "slack_install",
            "sub": user_id,
            "iat": now,
            "exp": now + 15 * 60,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def _state_user_id(state: str) -> str | None:
    if not settings.jwt_secret:
        return None
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("scope") != "slack_install":
        return None
    return payload.get("sub") or None


def _frontend_redirect(**params: str) -> str:
    base = (settings.frontend_base_url or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=500, detail="FRONTEND_BASE_URL is not configured")
    return f"{base}/dashboard/settings/integrations?{urlencode(params)}"


# ---------------------------------------------------------------------------
# Install / OAuth flow
# ---------------------------------------------------------------------------
@router.get("/install")
def slack_install_url(user_id: str = Depends(get_current_user_id)) -> dict:
    """Return the Slack App install URL for the current user.
    The frontend redirects the user to this URL to start the OAuth flow.
    """
    if not settings.slack_client_id or not settings.slack_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Slack integration not configured on the server.",
        )
    # Signed state: the callback can associate the connection with the right
    # account, while an attacker cannot forge a state for another user.
    state = _signed_state(user_id)
    return {"install_url": get_install_url_absolute(state=state)}


@router.get("/oauth/callback")
async def slack_oauth_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
) -> Response:
    """Slack OAuth callback.

    Slack redirects the user here after they authorize the app. `state` is a
    signed, short-lived token identifying the account; a raw user id was
    forgeable (account-binding CSRF).
    """
    if error:
        return RedirectResponse(
            url=_frontend_redirect(error=error),
            status_code=302,
        )
    if not code or not state:
        return RedirectResponse(
            url=_frontend_redirect(error="Slack did not return a code and state."),
            status_code=302,
        )

    callback_user_id = _state_user_id(state)
    if not callback_user_id:
        return RedirectResponse(
            url=_frontend_redirect(error="This Slack install link is invalid or expired. Try again."),
            status_code=302,
        )

    try:
        # Exchange the install code for a bot token + channel info.
        data = exchange_install_code(code)
    except SlackError as exc:
        return RedirectResponse(
            url=_frontend_redirect(error=str(exc)),
            status_code=302,
        )

    # Save the connection for the user bound by the signed state.
    try:
        save_connection(
            user_id=callback_user_id,
            access_token=data["access_token"],
            team_id=data["team_id"],
            team_name=data["team_name"],
            channel_id=data["channel_id"],
            channel_name=data["channel_name"],
        )
    except SlackError as exc:
        return RedirectResponse(
            url=_frontend_redirect(error=str(exc)),
            status_code=302,
        )

    # Redirect back to the integrations page with success.
    return RedirectResponse(
        url=_frontend_redirect(connected="true"),
        status_code=302,
    )


# ---------------------------------------------------------------------------
# Connection status & disconnect
# ---------------------------------------------------------------------------
@router.get("/connection")
def slack_connection_status(user_id: str = Depends(get_current_user_id)) -> dict:
    """Return the current user's Slack connection info (or null)."""
    conn = get_connection(user_id)
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "team_id": conn["slack_team_id"],
        "team_name": conn["slack_team_name"],
        "channel_id": conn["slack_channel_id"],
        "channel_name": conn["slack_channel_name"],
        "connected_at": conn.get("connected_at"),
    }


@router.delete("/connection")
def slack_disconnect(user_id: str = Depends(get_current_user_id)) -> dict:
    """Disconnect the user's Slack workspace."""
    disconnect(user_id)
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# Interactive components (button clicks, etc.)
# ---------------------------------------------------------------------------
@router.post("/interactions")
async def slack_interactions(request: Request) -> Response:
    """Handle Slack interactive payloads (button clicks, etc.).
    Verifies the request signature, parses the payload, and dispatches.
    Currently supports: "approve_fix" action.
    """
    raw_body = await request.body()

    # Verify Slack signature (replay protection + authenticity).
    if not verify_slack_signature(dict(request.headers), raw_body):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")

    try:
        payload = parse_interaction(raw_body)
    except SlackError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # We only handle block_actions with action_id "approve_fix" for now.
    if payload.get("type") != "block_actions":
        return Response(content="", status_code=200)

    actions = payload.get("actions", [])
    for action in actions:
        if action.get("action_id") != "approve_fix":
            continue
        value = action.get("value", "")
        # value format: "repo_id:fix_id"
        if ":" not in value:
            continue
        repo_id, fix_id = value.split(":", 1)

        # Delegate to the existing fixes approve logic via internal call.
        # We need a user context to get the GitHub token. The Slack connection
        # belongs to a user_id; we find it from the connection table.
        # Since the interaction doesn't carry auth, we look up the connection
        # by the team/channel it came from.
        user_id = await _find_user_for_channel(
            payload.get("channel", {}).get("id"),
            payload.get("team", {}).get("id"),
        )
        if not user_id:
            continue

        # Call the internal approve logic.
        await _approve_fix_via_slack(user_id, repo_id, fix_id)

    # Acknowledge the interaction quickly (200 within 3s).
    return Response(content="", status_code=200)


async def _find_user_for_channel(channel_id: str | None, team_id: str | None) -> str | None:
    """Look up the connection owner for this exact workspace + channel.

    Channel IDs are only unique within a Slack workspace; matching on the
    channel alone could dispatch an approval to the wrong customer.
    """
    if not channel_id or not team_id:
        return None
    from ..db import db
    res = (
        db()
        .table("slack_connections")
        .select("user_id")
        .eq("slack_team_id", team_id)
        .eq("slack_channel_id", channel_id)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]["user_id"]
    return None


async def _approve_fix_via_slack(user_id: str, repo_id: str, fix_id: str) -> None:
    """Reuse the same approve logic as the dashboard's POST /repos/{id}/fixes/{id}/approve.
    We inline the essential steps here to avoid circular imports.
    """
    from ..db import db, fetch_one
    from ..github_client import GitHubAuthError, GitHubError
    from ..routers.fixes import _create_fix_pr
    from ..routers.repos import _repo_scan_tokens, assert_repo_access_active

    # Verify ownership
    repo = fetch_one("repos", {"id": repo_id})
    if not repo or repo["user_id"] != user_id:
        return
    try:
        assert_repo_access_active(repo)
    except HTTPException:
        return

    # Fetch fix with rule
    fix_res = (
        db()
        .table("fixes")
        .select("*, fix_rules(*)")
        .eq("id", fix_id)
        .eq("repo_id", repo_id)
        .limit(1)
        .execute()
    )
    if not fix_res.data:
        return
    fix = fix_res.data[0]

    if fix["status"] not in ("needs_review", "pending"):
        return

    pr_result: tuple[str, int] | None = None
    for token in _repo_scan_tokens(repo, user_id):
        try:
            pr_result = await _create_fix_pr(repo, fix, token)
            break
        except GitHubAuthError:
            continue
        except GitHubError:
            return
    if pr_result is None:
        return
    pr_url, pr_number = pr_result

    # Update fix status
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db().table("fixes").update({
        "status": "pr_created",
        "pr_url": pr_url,
        "pr_number": pr_number,
        "updated_at": now,
    }).eq("id", fix_id).eq("status", fix["status"]).execute()

    # Post back to Slack with the PR link (optional follow-up).
    conn = get_connection(user_id)
    if conn:
        try:
            from ..slack_integration import post_fix_to_slack
            rule_title = (fix.get("fix_rules") or {}).get("title") or "Breaklytix"
            post_fix_to_slack(
                conn,
                repo_name=repo["full_name"],
                rule_title=rule_title,
                file_path=fix["file_path"],
                fix_id=fix_id,
                repo_id=repo_id,
                pr_url=pr_url,
            )
        except Exception:
            pass  # best-effort