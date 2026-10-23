"""Fixes routes: create fixes from findings, list, approve (real PR), dismiss.

The old `_create_fix_pr` placeholder (which wrote the diff preview as the whole
file) is replaced by a real pipeline: fetch current content -> deterministic
rule-based replacement -> syntax validation -> real file change on a fresh
branch -> PR with a full body. No PR is created when validation fails (by spec).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..crypto import get_cipher
from ..db import db, fetch_one
from ..deps import get_current_user_id
from ..engine.fixer import generator, pr as pr_lib
from ..engine.fixer.validator import validate_syntax
from ..engine.rules.registry import RULES, BreakingRule
from ..github_client import (
    GitHubAuthError,
    GitHubError,
    call_with_token_fallback,
)
from ..schemas import (
    FixActionIn,
    FixActionOut,
    FixCreateIn,
    FixCreateOut,
    FixOut,
    FixesListOut,
    FindingOut,
)
from .repos import _repo_scan_tokens, assert_repo_access_active

router = APIRouter(prefix="/repos", tags=["fixes"])

RULE_NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # DNS namespace


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _owned_repo(user_id: str, repo_id: str) -> dict:
    repo = fetch_one("repos", {"id": repo_id})
    if not repo or repo["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Repo not found")
    return repo


def _rule_severity(rule: dict) -> str:
    """Resolve the real registry severity for a persisted fix rule.

    `fix_rules` has no severity column; the old expression accidentally used
    the description/status and silently reported every PR as "medium".
    """
    title = rule.get("title")
    if title:
        for candidate in RULES:
            if candidate.title == title:
                return candidate.severity
    return "medium"


def _user_github_token(user_id: str) -> str:
    user = fetch_one("users", {"id": user_id})
    if not user or not user.get("github_access_token"):
        raise HTTPException(status_code=400, detail="No GitHub connection on file. Re-authenticate.")
    return get_cipher().decrypt(user["github_access_token"])


def _rule_uuid(rule_id: str) -> str:
    return str(uuid.uuid5(RULE_NS, "autofix.rule." + rule_id))


def _ensure_fix_rule(rule: BreakingRule) -> None:
    """Upsert a fix_rules row so `fixes.fix_rule_id` (uuid FK) resolves cleanly."""
    db().table("fix_rules").upsert(
        {
            "id": _rule_uuid(rule.id),
            "api_name": rule.provider or rule.id,
            "title": rule.title,
            "description": rule.description,
            "confidence": f"{rule.confidence:.2f}",
            "old_value": rule.old_value,
            "new_value": rule.new_value,
            "source_url": rule.source_url,
            "pattern": "|".join(rule.patterns) if rule.patterns else None,
            "language": "python,js,ts" if rule.provider is None else "any",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="id",
    ).execute()


def _fix_out(f: dict) -> FixOut:
    rule = f.get("fix_rules") or {}
    return FixOut(
        id=f["id"],
        repo_id=f["repo_id"],
        fix_rule_id=f["fix_rule_id"],
        file_path=f["file_path"],
        diff_preview=f["diff_preview"],
        pr_url=f.get("pr_url"),
        pr_number=f.get("pr_number"),
        status=f["status"],
        created_at=f.get("created_at"),
        updated_at=f.get("updated_at"),
        rule_title=rule.get("title"),
        rule_description=rule.get("description"),
        rule_confidence=rule.get("confidence"),
        rule_old_value=rule.get("old_value"),
        rule_new_value=rule.get("new_value"),
        rule_source_url=rule.get("source_url"),
    )


async def _create_fix_pr(repo: dict, fix: dict, token: str) -> tuple[str, int]:
    """Create a REAL GitHub PR for the fix. Returns (pr_url, pr_number).

    Pipeline: fetch current file -> deterministic replacement -> syntax
    validation -> write file on branch -> open PR. Any failure raises
    GitHubError and NO PR is created (no half-applied changes).
    """
    full_name = repo["full_name"]
    base = repo.get("default_branch", "main")
    fix_id_short = fix["id"][:8]
    rule = fetch_one("fix_rules", {"id": fix["fix_rule_id"]})
    if not rule:
        raise GitHubError("Fix rule not found; cannot apply fix.")

    current = pr_lib.fetch_file_content(token, full_name, fix["file_path"], base)
    if current is None:
        raise GitHubError(
            f"File '{fix['file_path']}' no longer exists on branch '{base}'; PR not created."
        )

    new_content = generator.apply_fix_to_text(
        current["content"], rule.get("old_value"), rule.get("new_value")
    )
    if new_content is None:
        raise GitHubError(
            "Fix no longer applies — the target code was already updated or changed; PR not created."
        )

    ok, detail = validate_syntax(fix["file_path"], new_content)
    if not ok:
        raise GitHubError(f"Validation failed ({detail}); PR not created.")

    head_branch = f"autofix/{fix_id_short}-{int(datetime.now(timezone.utc).timestamp())}"
    title = f"Breaklytix: {rule.get('title')} ({fix_id_short})"
    body = pr_lib.build_pr_body(
        rule_title=rule.get("title") or "Breaklytix",
        description=rule.get("description") or "",
        file_path=fix["file_path"],
        diff=fix.get("diff_preview") or "",
        validation=detail,
        confidence=float(rule.get("confidence") or 0),
        severity=_rule_severity(rule),
    )
    result = pr_lib.create_pr_from_file_change(
        token=token,
        full_name=full_name,
        base_branch=base,
        head_branch=head_branch,
        file_path=fix["file_path"],
        new_content=new_content,
        commit_message=f"Breaklytix: {rule.get('title')}",
        title=title,
        body=body,
        current_sha=current["sha"],
    )

    # Record the PR for the dashboard (pull_requests table).
    try:
        db().table("pull_requests").insert({
            "repo_id": repo["id"],
            "fix_id": fix["id"],
            "number": result["number"],
            "url": result["url"],
            "title": title,
            "base_branch": base,
            "head_branch": head_branch,
            "status": "open",
        }).execute()
    except Exception:
        pass  # PR already open — row is informational

    return result["url"], result["number"]


# ---------------------------------------------------------------------------
# Create Fix from finding (review-before-apply; honor AUTO_CREATE_PR later)
# ---------------------------------------------------------------------------
@router.post("/{repo_id}/fixes", response_model=FixCreateOut)
def create_fix(
    repo_id: str,
    body: FixCreateIn,
    user_id: str = Depends(get_current_user_id),
) -> FixCreateOut:
    """Generate a deterministic fix for an open finding. Stored as
    'needs_review' — the user approves it to open the PR (review before apply)."""
    repo = _owned_repo(user_id, repo_id)

    finding = fetch_one("findings", {"id": body.finding_id, "repo_id": repo_id})
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    if finding.get("status") == "fixed":
        raise HTTPException(status_code=400, detail="Finding is already fixed")
    if finding.get("status") == "dismissed":
        raise HTTPException(status_code=400, detail="Finding was dismissed")

    rule = generator.find_rule(finding.get("rule_id"))
    if rule is None or not rule.old_value or rule.new_value is None:
        raise HTTPException(
            status_code=400,
            detail="No automated fix is available for this finding (review manually).",
        )

    try:
        current, token = call_with_token_fallback(
            _repo_scan_tokens(repo, user_id),
            lambda tok: pr_lib.fetch_file_content(
                tok, repo["full_name"], finding["file"], repo.get("default_branch", "main")
            ),
        )
    except GitHubAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    if current is None:
        raise HTTPException(
            status_code=400,
            detail="File not found on the default branch; fix cannot be generated.",
        )

    gen = generator.generate_fix(finding, current["content"])
    if gen is None:
        raise HTTPException(
            status_code=400,
            detail="No safe automated fix could be produced (target code changed).",
        )

    _ensure_fix_rule(rule)
    now = datetime.now(timezone.utc).isoformat()
    res = db().table("fixes").insert({
        "repo_id": repo_id,
        "fix_rule_id": _rule_uuid(rule.id),
        "file_path": finding["file"],
        "diff_preview": gen.diff,
        "status": "needs_review",
        "created_at": now,
        "updated_at": now,
    }).execute()
    fix = res.data[0]

    fix_out = _fix_out({**fix, "fix_rules": {
        "title": rule.title,
        "description": rule.description,
        "confidence": f"{rule.confidence:.2f}",
        "old_value": rule.old_value,
        "new_value": rule.new_value,
        "source_url": rule.source_url,
    }})
    finding_out = FindingOut(
        id=finding["id"],
        scan_id=finding.get("scan_id"),
        repo_id=finding["repo_id"],
        severity=finding["severity"],
        type=finding["type"],
        provider=finding.get("provider"),
        file=finding["file"],
        line=finding.get("line"),
        message=finding["message"],
        current_usage=finding.get("current_usage"),
        recommended_fix=finding.get("recommended_fix"),
        confidence=finding.get("confidence"),
        status=finding["status"],
        tech=finding.get("tech"),
        rule_id=finding.get("rule_id"),
        created_at=finding.get("created_at"),
        updated_at=finding.get("updated_at"),
    )
    return FixCreateOut(fix=fix_out, finding=finding_out, ai_status="disabled")


# ---------------------------------------------------------------------------
# List Fixes
# ---------------------------------------------------------------------------
@router.get("/{repo_id}/fixes", response_model=FixesListOut)
def list_fixes(
    repo_id: str,
    status: str | None = None,
    user_id: str = Depends(get_current_user_id),
) -> FixesListOut:
    """List all fixes for a repo, optionally filtered by status."""
    _owned_repo(user_id, repo_id)

    query = (
        db().table("fixes")
        .select("*, fix_rules(*)")
        .eq("repo_id", repo_id)
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)
    res = query.execute()
    return FixesListOut(fixes=[_fix_out(f) for f in (res.data or [])])


# ---------------------------------------------------------------------------
# Approve Fix -> Create PR
# ---------------------------------------------------------------------------
@router.post("/{repo_id}/fixes/{fix_id}/approve", response_model=FixActionOut)
async def approve_fix(
    repo_id: str,
    fix_id: str,
    body: FixActionIn | None = None,
    user_id: str = Depends(get_current_user_id),
) -> FixActionOut:
    """Approve a 'needs_review' fix by creating a REAL GitHub PR."""
    repo = _owned_repo(user_id, repo_id)
    assert_repo_access_active(repo)

    fix_res = (
        db().table("fixes")
        .select("*, fix_rules(*)")
        .eq("id", fix_id)
        .eq("repo_id", repo_id)
        .limit(1)
        .execute()
    )
    if not fix_res.data:
        raise HTTPException(status_code=404, detail="Fix not found")
    fix = fix_res.data[0]

    if fix["status"] not in ("needs_review", "pending"):
        raise HTTPException(
            status_code=400,
            detail=f"Fix cannot be approved from status '{fix['status']}'",
        )

    # Use the same ordered token resolution as scanning: installation token for
    # agency-managed repos, then the repo snapshot, then the user's freshest
    # token. The previous code only used the user token, so agency PRs failed.
    tokens = _repo_scan_tokens(repo, user_id)
    if not tokens:
        raise HTTPException(
            status_code=400,
            detail="No GitHub connection on file for this repository. Reconnect or re-authorize it.",
        )

    last_auth_error: GitHubAuthError | None = None
    result: tuple[str, int] | None = None
    for token in tokens:
        try:
            result = await _create_fix_pr(repo, fix, token)
            break
        except GitHubAuthError as exc:
            last_auth_error = exc
            continue
        except GitHubError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
    if result is None:
        raise HTTPException(
            status_code=502,
            detail=str(last_auth_error or "GitHub rejected the available credentials."),
        )
    pr_url, pr_number = result

    now = datetime.now(timezone.utc).isoformat()
    db().table("fixes").update({
        "status": "pr_created",
        "pr_url": pr_url,
        "pr_number": pr_number,
        "updated_at": now,
    }).eq("id", fix_id).eq("status", fix["status"]).execute()

    return FixActionOut(
        fix_id=fix_id,
        status="pr_created",
        pr_url=pr_url,
        message="Pull request created successfully",
    )


# ---------------------------------------------------------------------------
# Dismiss Fix
# ---------------------------------------------------------------------------
@router.post("/{repo_id}/fixes/{fix_id}/dismiss", response_model=FixActionOut)
def dismiss_fix(
    repo_id: str,
    fix_id: str,
    body: FixActionIn | None = None,
    user_id: str = Depends(get_current_user_id),
) -> FixActionOut:
    """Dismiss a 'needs_review' fix (mark as rejected, no PR created)."""
    repo = _owned_repo(user_id, repo_id)
    assert_repo_access_active(repo)

    fix_res = (
        db().table("fixes")
        .select("*")
        .eq("id", fix_id)
        .eq("repo_id", repo_id)
        .limit(1)
        .execute()
    )
    if not fix_res.data:
        raise HTTPException(status_code=404, detail="Fix not found")
    fix = fix_res.data[0]

    if fix["status"] not in ("needs_review", "pending"):
        raise HTTPException(
            status_code=400,
            detail=f"Fix cannot be dismissed from status '{fix['status']}'",
        )

    now = datetime.now(timezone.utc).isoformat()
    # Status filter closes the select-then-update race with a concurrent
    # approve: a fix that moved to pr_created cannot be overwritten as rejected.
    db().table("fixes").update({
        "status": "rejected",
        "updated_at": now,
    }).eq("id", fix_id).eq("status", fix["status"]).execute()

    return FixActionOut(
        fix_id=fix_id,
        status="rejected",
        message="Fix dismissed",
    )