"""Changelog monitoring scheduler — real detection for all 44 providers.

Pipeline per provider (isolated — one failing provider never kills the run):
  fetch (official adapter) -> RawEntry -> classify (evidence-based)
  -> fingerprint (external_id) -> dedup store -> provider status update

Budgeting is preserved for the Vercel cron (30s fetch / 60s daily-scan):
each provider is hard-capped, the whole fetch run is capped, and leftovers
are reported truthfully (timed_out) and picked up next tick.
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import time as _time
from concurrent.futures import Future, ThreadPoolExecutor, wait as futures_wait
from datetime import datetime, timezone
from typing import Optional

from ..config import settings
from ..db import db
from . import classify
from .base import FetchError, RawEntry
from .fingerprint import entry_fingerprint
from .sources import (ALL_PROVIDER_IDS, HTML_STRICT, NONE, PROVIDER_SOURCES_BY_ID,
                      STATUS_ACCESS_BLOCKED, STATUS_ACTIVE, STATUS_ERROR,
                      STATUS_LIMITED, STATUS_PARSER_ERROR, STATUS_RATE_LIMITED,
                      STATUS_SOURCE_NOT_FOUND, STATUS_SOURCE_UNAVAILABLE,
                      STATUS_TEMPORARILY_UNAVAILABLE, STATUS_TIMED_OUT)
# Budget is sized for the 60s Vercel cron function (vercel.json maxDuration):
# 44 network-bound fetches need more parallelism than a 25s/4-worker budget
# allowed — otherwise 15+ providers every run were marked TIMED_OUT and never
# caught up (external_id dedup makes partial runs safe, but a run that only
# ever reaches ~10 providers leaves the rest permanently stale).
# Budgets are env-tunable so local sweeps can go deeper than the cron.
FETCH_TIMEOUT_SECONDS = int(os.getenv("FETCH_TIMEOUT_SECONDS", "10"))
FETCH_MAX_WORKERS = int(os.getenv("FETCH_MAX_WORKERS", "8"))
TOTAL_BUDGET_SECONDS = int(os.getenv("TOTAL_BUDGET_SECONDS", "45"))

# Impact analysis runs inside the daily-scan endpoint (60s Vercel budget).
MAX_IMPACT_EVENTS_PER_RUN = int(__import__("os").getenv("MAX_IMPACT_EVENTS_PER_RUN", "20"))

# Fresh GitHub re-scans (see ../rescan.py) share the /internal/daily-scan
# Vercel function budget (60s maxDuration). Env-tunable so local sweeps can go
# deeper; repos outside the quota still receive the stored-snippet checks.
DAILY_RESCAN_MAX_REPOS = int(os.getenv("DAILY_RESCAN_MAX_REPOS", "5"))
DAILY_RESCAN_SECONDS_TOTAL = float(os.getenv("DAILY_RESCAN_SECONDS_TOTAL", "35"))
DAILY_RESCAN_SECONDS_PER_REPO = float(os.getenv("DAILY_RESCAN_SECONDS_PER_REPO", "20"))

# Failures before a provider is marked ERROR (then retried on next ticks).
MAX_CONSECUTIVE_ERRORS = 3


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def _db_retry(fn, *args, attempts: int = 3, **kwargs):
    """Run a Supabase call with retry-backoff on connectivity errors.

    The Supabase client's PostgREST connection can drop mid-sweep
    ("Server disconnected"); a single retry usually succeeds. Only
    transport-level errors are retried — API errors (4xx/5xx) pass through.
    """
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            retryable = (
                "Server disconnected" in msg or "Connection reset" in msg
                or "timed out" in msg.lower() or "connection" in msg.lower()
                or "network" in msg.lower()
            )
            if not retryable or i == attempts - 1:
                raise
            last = e
            _time.sleep(0.5 * (i + 1))
    raise last


# ---------------------------------------------------------------------------
# Store (with fingerprint dedup)
# ---------------------------------------------------------------------------
def store_entries(provider_id: str, entries: list[RawEntry], source_kind: str) -> dict:
    """Classify + store official entries with external-id dedup.

    Existing external_id/fingerprint -> update last_seen_at (not duplicate).
    Missing required fields are skipped (the invariant lives in RawEntry).
    Returns stats: {stored, duplicates, skipped, errors}
    """
    stats = {"stored": 0, "duplicates": 0, "skipped": 0, "errors": 0}
    if not entries:
        return stats

    # ONE bulk lookup per provider (was 3 queries per entry): collect all
    # ids that already exist by external_id or fingerprint.
    external_ids = [e.external_id for e in entries if e.external_id]
    fingerprints = [entry_fingerprint(provider_id, e) for e in entries]

    existing: set[str] = set()
    try:
        if external_ids:
            res = _db_retry(
                lambda: db()
                .table("changelog_events")
                .select("external_id")
                .eq("api_name", provider_id)
                .in_("external_id", external_ids)
                .execute()
            )
            existing.update(e["external_id"] for e in res.data if e.get("external_id"))
        if fingerprints:
            res = _db_retry(
                lambda: db()
                .table("changelog_events")
                .select("fingerprint")
                .eq("api_name", provider_id)
                .in_("fingerprint", fingerprints)
                .execute()
            )
            existing.update(e["fingerprint"] for e in res.data if e.get("fingerprint"))
    except Exception as e:  # noqa: BLE001 — lookup failure: fall back to insert path
        print(f"Bulk dedup lookup failed for {provider_id}: {e}")

    for entry in entries:
        try:
            cls = classify.classify_entry(entry.title, entry.summary, source_kind)
            fingerprint = entry_fingerprint(provider_id, entry)

            if entry.external_id in existing or fingerprint in existing:
                # Same official entry seen again — never a duplicate row.
                matched = entry.external_id if entry.external_id in existing else fingerprint
                try:
                    _db_retry(
                        lambda m=matched: db()
                        .table("changelog_events")
                        .update({"last_seen_at": _now_iso()})
                        .eq("api_name", provider_id)
                        .or_(f"external_id.eq.{matched},fingerprint.eq.{matched}")
                        .execute()
                    )
                except Exception as ue:  # noqa: BLE001 — best effort touch
                    print(f"Touch {provider_id} {matched}: {ue}")
                stats["duplicates"] += 1
                continue

            row = {
                "api_name": provider_id,
                "title": entry.title[:500],
                "description": entry.summary[:2000],
                "source_url": entry.url,
                "external_id": entry.external_id,
                "source_type": source_kind,
                "fingerprint": fingerprint,
                "content_hash": entry.external_id,
                "detected_at": entry.published_at,
                "first_seen_at": _now_iso(),
                "last_seen_at": _now_iso(),
                "change_type": cls.change_type,
                "severity": cls.severity,
                "confidence": cls.confidence,
                "severity_evidence": json.dumps(cls.evidence) if cls.evidence else None,
                "confidence_evidence": json.dumps(cls.evidence) if cls.evidence else None,
                "symbols": ",".join(cls.symbols) if cls.symbols else None,
                "old_value": cls.old_value,
                "new_value": cls.new_value,
                "processed_at": None,
                "provider_display": PROVIDER_SOURCES_BY_ID.get(provider_id).display_name,
            }
            if cls.affected_endpoints:
                row["affected_endpoints"] = json.dumps(cls.affected_endpoints)
            if cls.deadline:
                row["deadline"] = cls.deadline

            try:
                _db_retry(lambda r=row: db().table("changelog_events").insert(r).execute())
                stats["stored"] += 1
                existing.add(entry.external_id)
                existing.add(fingerprint)
            except Exception as ie:  # noqa: BLE001
                if "23505" in str(ie) or "duplicate" in str(ie).lower():
                    # Race with another worker/tick — treat as duplicate.
                    stats["duplicates"] += 1
                else:
                    stats["errors"] += 1
                    print(f"Error storing {provider_id} entry: {ie}")
        except Exception as e:  # noqa: BLE001 — one bad entry must not kill the run
            stats["errors"] += 1
            print(f"Error storing {provider_id} entry: {e}")
    return stats


def _update_status(provider_id: str, status: str, *, fetched: int, duration_ms: int,
                   error: str | None = None, http_ok: bool = True) -> None:
    """Update provider_monitoring_status (honest matrix row per provider)."""
    source = PROVIDER_SOURCES_BY_ID.get(provider_id)
    try:
        row = {
            "provider_id": provider_id,
            "display_name": source.display_name if source else provider_id,
            "status": status,
            "source_kind": source.source_kind if source else "NONE",
            "source_url": source.changelog_url if source else "",
            "feed_url": source.feed_url if source and source.feed_url else "",
            "last_fetch_at": _now_iso(),
            "duration_ms": duration_ms,
            # A timeout or fetch exception did not produce a successful HTTP
            # response.  Reporting 200 here made failures look healthy.
            "last_http_status": 200 if http_ok and not error else None,
            # Explicitly clear a previous failure after a clean fetch.  Omitting
            # this field during an upsert left stale errors beside ACTIVE badges.
            "last_error": error[:500] if error else None,
        }
        _db_retry(
            lambda: db().table("provider_monitoring_status").upsert(
                row, on_conflict="provider_id"
            ).execute()
        )
    except Exception as e:  # noqa: BLE001 — status logging is best-effort
        print(f"Status update failed for {provider_id}: {e}")


# ---------------------------------------------------------------------------
# Fetch orchestration (44 providers, isolated)
# ---------------------------------------------------------------------------
def _truthful_outcome(provider_id: str, entries: list, error: str | None) -> str:
    """Classify the outcome the monitor ACTUALLY observed — never a guess.

    Entries parsed+stored      -> STATUS_ACTIVE
    No entries, no error       -> STATUS_LIMITED (official source reachable,
                                  nothing new published)
    No entries + error         -> classified from what really failed:
                                  timeout         -> STATUS_TIMED_OUT
                                  404/not found   -> STATUS_SOURCE_NOT_FOUND
                                  403/401         -> STATUS_ACCESS_BLOCKED
                                  429/rate limit  -> STATUS_RATE_LIMITED
                                  parser failure  -> STATUS_PARSER_ERROR
                                  5xx/network     -> STATUS_TEMPORARILY_UNAVAILABLE
                                  anything else   -> STATUS_ERROR
    """
    if entries:
        return STATUS_ACTIVE
    if not error:
        return STATUS_LIMITED
    msg = error.lower()
    if "timed out" in msg or "timed_out" in msg or "cron budget" in msg:
        return STATUS_TIMED_OUT
    if "404" in msg or "not found" in msg or "no such" in msg:
        return STATUS_SOURCE_NOT_FOUND
    if "403" in msg or "forbidden" in msg or "401" in msg or "unauthorized" in msg:
        return STATUS_ACCESS_BLOCKED
    if "429" in msg or "too many requests" in msg or "rate limit" in msg:
        return STATUS_RATE_LIMITED
    if "parse" in msg or "select" in msg or "classif" in msg:
        return STATUS_PARSER_ERROR
    if "500" in msg or "502" in msg or "503" in msg or "unavailable" in msg:
        return STATUS_TEMPORARILY_UNAVAILABLE
    return STATUS_ERROR


def fetch_provider(provider_id: str, user_agent: str | None = None) -> list[RawEntry]:
    """Fetch official entries for one provider using its registered adapter."""
    from .parsers import FETCHERS

    adapter_cls = FETCHERS.get(provider_id)
    if not adapter_cls:
        return []
    source = PROVIDER_SOURCES_BY_ID.get(provider_id)
    if source is None or source.source_kind == NONE:
        return []
    ua = user_agent or settings.scraper_user_agent
    adapter = adapter_cls(source=source, user_agent=ua)
    return adapter.fetch()


def fetch_all_providers(user_agent: str | None = None) -> dict:
    """Fetch all 44 providers in parallel (bounded), update statuses honestly.

    Per provider returns: {fetched, stored, duplicates, skipped, errors,
    timed_out?, status, last_error?}
    """
    results: dict = {}
    deadline = _time.time() + TOTAL_BUDGET_SECONDS
    provider_ids = list(ALL_PROVIDER_IDS)

    def _work(pid: str) -> tuple[str, dict, str | None, int]:
        start = _time.time()
        error: str | None = None
        try:
            entries = _fetch_with_timeout(pid, user_agent)
            stats = store_entries(pid, entries, PROVIDER_SOURCES_BY_ID[pid].source_kind)
            stats["fetched"] = len(entries)
            status = _truthful_outcome(pid, entries, None)
            return pid, {**stats, "status": status}, None, int((_time.time() - start) * 1000)
        except Exception as e:  # noqa: BLE001
            error = str(e)[:500]
            return pid, {"fetched": 0, "stored": 0, "duplicates": 0,
                         "skipped": 0, "errors": 1, "status": _truthful_outcome(pid, [], error),
                         "last_error": error}, error, int((_time.time() - start) * 1000)

    pool = ThreadPoolExecutor(max_workers=FETCH_MAX_WORKERS)
    try:
        futures: dict[Future, str] = {pool.submit(_work, pid): pid for pid in provider_ids}
        pending = set(futures)
        # concurrent.futures.wait returns completed futures EXACTLY once, so a
        # result is never mislabeled TIMED_OUT after it actually finished (the
        # previous as_completed loop could break with finished futures still
        # sitting in `pending`).
        while pending and _time.time() < deadline:
            done, _not_done = futures_wait(
                pending,
                timeout=max(deadline - _time.time(), 0.1),
                return_when=concurrent.futures.ALL_COMPLETED,
            )
            for future in done:
                pid = futures[future]
                pending.discard(future)
                try:
                    pid_r, stats, error, duration_ms = future.result()
                except Exception as e:  # noqa: BLE001
                    error = str(e)[:500]
                    stats = {"fetched": 0, "stored": 0, "duplicates": 0,
                             "skipped": 0, "errors": 1,
                             "status": _truthful_outcome(pid, [], error),
                             "last_error": error}
                    duration_ms = 0
                results.setdefault(pid, stats)
                _update_status(pid, stats.get("status", STATUS_ERROR),
                               fetched=stats.get("fetched", 0), duration_ms=duration_ms,
                               error=error)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    # Pending work did not complete within this run's budget. Persist that
    # outcome so the matrix cannot show a stale ACTIVE/LIMITED badge.
    for future in pending:
        pid = futures[future]
        timeout_error = "timed out inside cron budget"
        stats = {"fetched": 0, "stored": 0, "duplicates": 0, "skipped": 0,
                 "errors": 1, "timed_out": True, "status": STATUS_TIMED_OUT,
                 "last_error": timeout_error}
        results.setdefault(pid, stats)
        _update_status(pid, STATUS_TIMED_OUT, fetched=0, duration_ms=TOTAL_BUDGET_SECONDS * 1000,
                       error=timeout_error, http_ok=False)

    # Providers with no source at all: mark SOURCE_UNAVAILABLE.
    for pid in provider_ids:
        src = PROVIDER_SOURCES_BY_ID.get(pid)
        if src and src.source_kind == NONE:
            results.setdefault(pid, {"fetched": 0, "stored": 0, "duplicates": 0, "skipped": 0,
                                     "errors": 0, "status": STATUS_SOURCE_UNAVAILABLE})
            _update_status(pid, STATUS_SOURCE_UNAVAILABLE, fetched=0, duration_ms=0)

    return results


_TimeoutError = TimeoutError  # noqa: N816


def _fetch_with_timeout(provider_id: str, user_agent: str | None) -> list[RawEntry]:
    """Run one provider fetch in a dedicated worker with a hard timeout."""
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        future = pool.submit(fetch_provider, provider_id, user_agent)
        try:
            return future.result(timeout=FETCH_TIMEOUT_SECONDS)
        except _TimeoutError:
            future.cancel()
            print(f"Provider {provider_id} exceeded {FETCH_TIMEOUT_SECONDS}s — skipping")
            raise FetchError(f"{provider_id}: fetch exceeded {FETCH_TIMEOUT_SECONDS}s")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def log_health(provider_id: str, status: str, duration_ms: int, error: str | None = None):
    """Legacy health log to system_health (best-effort, kept for compat)."""
    try:
        row = {
            "job_name": f"changelog:{provider_id}",
            "status": status,
            "duration_ms": duration_ms,
            "error_message": error,
            "ran_at": _now_iso(),
        }
        db().table("system_health").insert(row).execute()
    except Exception:
        pass  # Best-effort logging


# ---------------------------------------------------------------------------
# Daily scans + impact analysis (kept for the cron router). Since 2026-11 the
# daily pass also = (a) optional fresh GitHub re-scan per repo (quota/time
# budgeted, rotates through the stalest-scanned repos), then (b) the original
# stored-changelog/code-health checks, and (c) the opt-in daily status email
# (users.notify_daily_status, once per user/UTC day).
# ---------------------------------------------------------------------------
def _run_daily_rescan(
    repo: dict, user_id: str | None, rescan: bool, deadline: float | None
) -> dict:
    """Best-effort fresh re-scan wrapper. Never raises; returns a compact stat."""
    if not rescan:
        return {"status": "stored_only", "reason": "not_requested",
                "files_scanned": 0, "detections": 0, "new_apis": 0}
    try:
        from ..rescan import rescan_repo_fresh

        outcome = rescan_repo_fresh(repo, user_id or "", deadline=deadline)
    except Exception as exc:  # noqa: BLE001 - rescan failure never fails the run
        print(f"Error during fresh rescan for repo {repo.get('id')}: {exc}")
        return {"status": "fallback", "reason": "rescan_exception",
                "files_scanned": 0, "detections": 0, "new_apis": 0}
    return {
        "status": outcome.get("status", "fallback"),
        "reason": outcome.get("reason") or "",
        "files_scanned": int(outcome.get("files_scanned") or 0),
        "detections": int(outcome.get("detections") or 0),
        "new_apis": int(outcome.get("new_apis") or 0),
    }


def run_daily_scan(
    repo_id: str,
    rescan: bool = True,
    rescan_deadline: float | None = None,
) -> dict:
    from ..health.code_health import run_code_health_checks
    stats = {
        "rescan": {"status": "stored_only", "reason": "not_attempted",
                   "files_scanned": 0, "detections": 0, "new_apis": 0},
        "changelog_check_status": "skipped_no_providers",
        "code_check_status": "clear",
        "changelog_issues_count": 0,
        "code_issues_count": 0,
    }
    try:
        repo = db().table("repos").select("*").eq("id", repo_id).execute()
        if not repo.data:
            return stats
        repo_data = repo.data[0]
        user_id = repo_data.get("user_id")

        stats["rescan"] = _run_daily_rescan(repo_data, user_id, rescan, rescan_deadline)

        connections = db().table("provider_connections").select("provider").eq("user_id", user_id).execute()
        providers = [c["provider"] for c in connections.data] if connections.data else []
        if providers:
            breaking_changes = (
                db().table("changelog_events")
                .select("id")
                .in_("api_name", providers)
                .eq("severity", "breaking")
                .gte("detected_at", _now_iso()[:10])
                .execute()
            )
            if breaking_changes.data:
                stats["changelog_check_status"] = "breaking_change_found"
                stats["changelog_issues_count"] = len(breaking_changes.data)
            else:
                stats["changelog_check_status"] = "clear"

        detections = db().table("api_detections").select("*").eq("repo_id", repo_id).execute()
        detection_list = detections.data if detections.data else []
        if detection_list:
            file_contents = {}
            for det in detection_list:
                fp = det.get("file_path", "")
                if fp and fp not in file_contents:
                    file_contents[fp] = det.get("matched_snippet", "")
            issues = run_code_health_checks(repo_id, detection_list, file_contents)
            if issues:
                stats["code_check_status"] = "issue_found"
                stats["code_issues_count"] = len(issues)
                for issue in issues:
                    existing = (
                        db().table("code_health_issues")
                        .select("id")
                        .eq("repo_id", repo_id)
                        .eq("provider", issue.provider)
                        .eq("issue_type", issue.issue_type)
                        .eq("file_path", issue.file_path)
                        .eq("status", "open")
                        .limit(1)
                        .execute()
                    )
                    if not existing.data:
                        db().table("code_health_issues").insert({
                            "repo_id": repo_id,
                            "provider": issue.provider,
                            "issue_type": issue.issue_type,
                            "description": issue.description,
                            "file_path": issue.file_path,
                            "line_number": issue.line_number,
                            "status": "open",
                        }).execute()
        return stats
    except Exception as e:
        print(f"Error running daily scan for repo {repo_id}: {e}")
        return stats


def run_daily_scans() -> dict:
    """Run the scheduled daily pass and return a compact run summary.

    Per repo (24h-due only): optional fresh GitHub re-scan (quota/time-budgeted)
    on top of the original stored-changelog/code-health checks, then the
    daily_scan_runs row. Afterwards the opt-in daily status email goes out
    once per user per UTC day (users.notify_daily_status).
    """
    summary: dict = {
        "repos_total": 0,
        "repos_due": 0,
        "rescan_attempts": 0,
        "rescan_ok": 0,
        "rescan_partial": 0,
        "rescan_fallback": 0,
        "emails": {"sent": 0, "skipped": 0, "failed": 0},
    }
    reports: dict[str, dict] = {}
    try:
        repos = db().table("repos").select("*").execute()
        if not repos.data:
            return summary
        summary["repos_total"] = len(repos.data)
        # The rescan quota rotates fairly: repos scanned the longest time ago
        # come first, so every repo gets its turn across daily runs.
        repos_ordered = sorted(repos.data, key=lambda r: r.get("last_scanned_at") or "")
        rescan_deadline = _time.monotonic() + DAILY_RESCAN_SECONDS_TOTAL
        rescan_quota = DAILY_RESCAN_MAX_REPOS
        from datetime import timedelta
        latest = (
            db().table("daily_scan_runs")
            .select("repo_id, ran_at")
            .order("ran_at", desc=True)
            .limit(1000)
            .execute()
        ).data or []
        latest_by_repo: dict[str, str] = {}
        for row in latest:
            rid = row.get("repo_id")
            if rid and rid not in latest_by_repo:
                latest_by_repo[rid] = row.get("ran_at") or ""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        for repo in repos_ordered:
            repo_id = repo["id"]
            user_id = repo.get("user_id")
            last = latest_by_repo.get(repo_id)
            if last:
                try:
                    last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    if last_dt > cutoff:
                        continue
                except ValueError:
                    pass
            user = db().table("users").select("email,notify_daily_status").eq("id", user_id).execute()
            if not user.data:
                continue
            user_data = user.data[0]
            user_email = user_data.get("email")
            if not user_email:
                continue

            allow_rescan = True
            if rescan_quota <= 0:
                allow_rescan = False
            elif _time.monotonic() >= rescan_deadline:
                allow_rescan = False
            if allow_rescan:
                rescan_quota -= 1
                summary["rescan_attempts"] += 1
            repo_deadline = (
                min(rescan_deadline, _time.monotonic() + DAILY_RESCAN_SECONDS_PER_REPO)
                if allow_rescan else None
            )
            stats = run_daily_scan(repo_id, rescan=allow_rescan, rescan_deadline=repo_deadline)
            rescan_stat = stats.get("rescan") or {}
            if rescan_stat.get("status") == "ok":
                summary["rescan_ok"] += 1
            elif rescan_stat.get("status") == "ok_partial":
                summary["rescan_partial"] += 1
            elif allow_rescan:
                summary["rescan_fallback"] += 1

            # Per-user report feeding the daily status email.
            user_report = reports.setdefault(
                user_id,
                {
                    "email": user_email,
                    "notify": bool(user_data.get("notify_daily_status", False)),
                    "repos": [],
                },
            )
            user_report["repos"].append(
                {
                    "repo": repo.get("full_name") or repo_id,
                    "rescan": rescan_stat,
                    "breaking_today": int(stats.get("changelog_issues_count") or 0),
                    "code_issues": int(stats.get("code_issues_count") or 0),
                }
            )
            summary["repos_due"] += 1

            try:
                db().table("daily_scan_runs").insert({
                    "repo_id": repo_id,
                    "changelog_check_status": stats.get("changelog_check_status", "skipped_no_providers"),
                    "code_check_status": stats.get("code_check_status", "clear"),
                    "changelog_issues_count": stats.get("changelog_issues_count", 0),
                    "code_issues_count": stats.get("code_issues_count", 0),
                    "ran_at": _now_iso(),
                }).execute()
            except Exception as e:
                print(f"Error inserting daily scan run: {e}")

        # Daily status email: one per opted-in user per UTC day (best-effort).
        try:
            from ..status_email import send_daily_status_reports

            summary["emails"] = send_daily_status_reports(reports)
        except Exception as e:
            print(f"Error sending daily status emails: {e}")
            summary["emails"] = {"sent": 0, "skipped": 0, "failed": 0}
    except Exception as e:
        print(f"Error running daily scans: {e}")
        return summary
    return summary


def run_impact_analysis_for_recent_events():
    try:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        IMPACT_CHANGE_TYPES = ("BREAKING_CHANGE", "DEPRECATION", "SECURITY_CHANGE")
        events = (
            db().table("changelog_events")
            .select("*")
            .gte("detected_at", cutoff)
            .in_("change_type", IMPACT_CHANGE_TYPES)
            .order("detected_at", desc=True)
            .limit(MAX_IMPACT_EVENTS_PER_RUN)
            .execute()
        ).data or []
        if not events:
            return
        repos = (db().table("repos").select("*").execute()).data or []
        if not repos:
            return
        detections = (
            db().table("api_detections")
            .select("id, repo_id, api_name, file_path, line_number, matched_snippet, symbols")
            .execute()
        ).data or []
        by_provider: dict[str, list[dict]] = {}
        for d in detections:
            by_provider.setdefault((d.get("api_name") or "").lower(), []).append(d)
        existing = (
            db().table("impact_analyses").select("repo_id, changelog_event_id").execute()
        ).data or []
        done_pairs = {(a.get("repo_id"), a.get("changelog_event_id")) for a in existing}

        from ..impact.analyzer import analyze_changelog_event, persist_impact_analysis

        for event in events:
            provider = event.get("api_name") or event.get("provider", "")
            if not provider:
                continue
            provider_dets = by_provider.get(provider.lower(), [])
            if not provider_dets:
                continue
            by_repo: dict[str, list[dict]] = {}
            for d in provider_dets:
                rid = d.get("repo_id")
                if rid:
                    by_repo.setdefault(rid, []).append(d)
            for repo_id, dets in by_repo.items():
                if (repo_id, event["id"]) in done_pairs:
                    continue
                repo = next((r for r in repos if r["id"] == repo_id), None)
                if not repo:
                    continue
                try:
                    analysis = analyze_changelog_event(event=event, repo_id=repo_id, detections=dets)
                    persist_impact_analysis(analysis)
                    done_pairs.add((repo_id, event["id"]))
                    if analysis.severity in ("high", "breaking"):
                        _send_impact_alert(repo_id=repo_id, analysis=analysis,
                                           repo_name=repo.get("full_name", "Unknown"))
                except Exception as e:
                    print(f"Error analyzing impact for repo {repo_id}: {e}")
    except Exception as e:
        print(f"Error running impact analysis: {e}")


def _send_impact_alert(repo_id: str, analysis, repo_name: str):
    try:
        from ..email_service import send_alert_email
        repo = db().table("repos").select("user_id").eq("id", repo_id).execute()
        if not repo.data:
            return
        user_id = repo.data[0].get("user_id")
        user = db().table("users").select("email,notify_email_alerts").eq("id", user_id).execute()
        if not user.data:
            return
        user_data = user.data[0]
        user_email = user_data.get("email")
        notify_alerts = user_data.get("notify_email_alerts", True)
        if not user_email or not notify_alerts:
            return
        severity_text = "BREAKING" if analysis.severity == "breaking" else "HIGH RISK"
        subject = f"Breaklytix Impact Alert: {severity_text} — {repo_name}"
        affected_files = analysis.affected_files[:5]
        files_text = "\n".join([
            f"• {f.file_path}" + (f" (line {f.line_number})" if f.line_number else "")
            for f in affected_files
        ])
        html = f'''
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e;">
            <h2 style="margin:0 0 8px;color:#b91c1c;">{severity_text}: {analysis.provider} API Change</h2>
            <p style="color:#555;">Repository: <strong>{repo_name}</strong></p>
            <p style="color:#555;">Change: {analysis.change_type}</p>
            <p style="color:#555;">Confidence: {int(analysis.confidence * 100)}%</p>
            <p style="color:#555;">Potential impact: {analysis.impact_reason}</p>
            <h3 style="margin:16px 0 8px;">Affected Files:</h3>
            <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:13px;overflow-x:auto;">{files_text}</pre>
            <p style="color:#555;margin-top:16px;">Potential Failure: {analysis.potential_failure}</p>
            <p style="color:#555;">Recommended Fix: {analysis.recommended_fix or "Review required"}</p>
            <p style="margin-top:16px;">
                <a href="{settings.frontend_base_url}/dashboard/impact/{analysis.id}"
                   style="background:#1a1a2e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
                    View Impact Details
                </a>
            </p>
        </div>
        '''
        text = f"{severity_text}: {analysis.provider} API Change — {repo_name}"
        send_alert_email(
            user_id=user_id, recipient=user_email, alert_type="impact_alert",
            subject=subject, html=html, text=text,
        )
    except Exception as e:
        print(f"Error sending impact alert: {e}")
