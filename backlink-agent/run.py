"""Backlink agent entry point.

    python run.py --daily          # the one command
    python run.py --daily --dry-run
    python run.py --crawl-only
    python run.py --check-links
    python run.py --submit-directories --live
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backlink_agent import competitor_gap, contact_finder, crawl_site, followup, keywords as kw_mod
from backlink_agent import link_checker, outreach, prospector, scorer, search, tracker as tracker_mod
from backlink_agent.config import Config, ConfigError, load_config
from backlink_agent.http import PoliteFetcher
from backlink_agent.log import Log
from backlink_agent.util import append_jsonl, iso, load_env_file, parse_iso, read_json, read_jsonl

PROFILE_REFRESH_DAYS = 7
LINK_CHECK_DAYS = 7


def _banner(cfg: Config, log: Log) -> None:
    print("=" * 66)
    print(f" backlink-agent  |  {cfg.my_domain}")
    print(f" niche: {cfg.niche or '(from crawl)'}")
    print(f" AUTO_SEND: {cfg.auto_send}   daily limit: {cfg.daily_send_limit}")
    print("=" * 66)
    for warning in cfg.warnings:
        log.warn("config", detail=warning)


def _ensure_profile(cfg: Config, log: Log, refresh: bool) -> dict:
    existing = read_json(cfg.profile_path)
    if existing and not refresh:
        fetched = parse_iso(existing.get("fetched_at"))
        if fetched and datetime.now(timezone.utc) - fetched < timedelta(days=PROFILE_REFRESH_DAYS):
            log.info("profile_cached", fetched_at=existing.get("fetched_at"))
            return existing
    log.action("crawl_start", url=cfg.site_url)
    fetcher = PoliteFetcher(cfg, log, page_budget=cfg.politeness.max_pages_per_domain + 6)
    return crawl_site.crawl(cfg, fetcher, log)


def _score_pending(
    cfg: Config,
    log: Log,
    keywords: dict,
    tracker: tracker_mod.Tracker,
    limit: int,
) -> dict:
    raw = read_jsonl(cfg.data_dir / "prospects_raw.jsonl")
    if not raw:
        log.info("score_nothing", note="no raw prospects")
        return {"scored": 0, "dropped": 0, "contacted": 0}

    fetcher = PoliteFetcher(cfg, log)
    age = scorer.DomainAge(cfg, log)
    niche_terms = keywords.get("niche_terms", [])

    pending = []
    for row in raw:
        domain = row.get("domain")
        if not domain:
            continue
        tracked = tracker.get(domain)
        if tracked and tracked.get("status") not in {"", "found"}:
            continue
        if tracked and tracked.get("score"):
            continue
        pending.append(row)

    # Highest-signal sources first.
    priority = {"competitor_gap": 0, "broken_link": 1, "guest_post_hint": 2, "search": 3, "seed": 4}
    pending.sort(key=lambda r: priority.get(r.get("source", ""), 5))

    scored = dropped = with_contact = 0
    for row in pending[:limit]:
        result = scorer.score_prospect(cfg, fetcher, row, niche_terms, age, log)
        domain = result["domain"]
        if not domain:
            continue

        # Full factor breakdown, kept separately so a score can be explained
        # months later without re-fetching the page.
        append_jsonl(cfg.data_dir / "scored.jsonl", {"identity": domain, **result})

        record = {
            "domain": domain,
            "url": result["url"],
            "title": result.get("title", ""),
            "score": result["score"],
            "opportunity": result.get("opportunity", ""),
            "source": result.get("source", ""),
            "evidence": result.get("evidence", ""),
            "last_scored": result["scored_at"],
            "status": "dropped" if result["dropped"] else "scored",
            "notes": result.get("drop_reason", ""),
        }

        if result["dropped"]:
            tracker.upsert(record)
            dropped += 1
            continue

        contact = contact_finder.find(cfg, fetcher, result, log)
        record.update(
            {
                "contact_email": contact.get("email", ""),
                "contact_source": contact.get("source_url", ""),
                "contact_kind": contact.get("kind", ""),
            }
        )
        if contact.get("email"):
            with_contact += 1
        else:
            record["notes"] = contact.get("notes", "")
        tracker.upsert(record)
        scored += 1

    tracker.save()
    log.action("score_done", scored=scored, dropped=dropped, with_contact=with_contact)
    return {"scored": scored, "dropped": dropped, "contacted": with_contact}


def _maybe_check_links(cfg: Config, log: Log, tracker: tracker_mod.Tracker, force: bool) -> dict:
    report = read_json(cfg.data_dir / "link_report.json", {}) or {}
    checked = parse_iso(report.get("checked_at"))
    stale = checked is None or datetime.now(timezone.utc) - checked > timedelta(days=LINK_CHECK_DAYS)
    if not (force or stale):
        return {"checked": 0, "skipped": True}
    fetcher = PoliteFetcher(cfg, log)
    return link_checker.run(cfg, fetcher, tracker, log)


def _print_summary(cfg: Config, tracker: tracker_mod.Tracker, report_path: str) -> None:
    data = tracker.summary()
    print("\n" + "-" * 66)
    print(f" tracked      : {data['total']}")
    print(f" avg score    : {data['avg_score']}")
    print(f" sent today   : {data['sent_today']} / {data['daily_limit']}")
    statuses = ", ".join(f"{k}={v}" for k, v in data["by_status"].items()) or "none"
    print(f" by status    : {statuses}")
    print(f" report       : {report_path}")
    print("-" * 66 + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="backlink-agent", description="White-hat backlink prospecting and outreach")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.yaml"))
    parser.add_argument("--daily", action="store_true", help="run the full pipeline (the one command)")
    parser.add_argument("--crawl-only", action="store_true")
    parser.add_argument("--prospect-only", action="store_true")
    parser.add_argument("--score-only", action="store_true")
    parser.add_argument("--outreach-only", action="store_true")
    parser.add_argument("--followup-only", action="store_true")
    parser.add_argument("--check-links", action="store_true")
    parser.add_argument("--submit-directories", action="store_true")
    parser.add_argument("--live", action="store_true", help="directory submit: actually click submit")
    parser.add_argument("--only", default=None, help="directory submit: one directory name")
    parser.add_argument("--refresh", action="store_true", help="force a fresh crawl of your own site")
    parser.add_argument("--dry-run", action="store_true", help="no drafts created outside, no sends, no submits")
    parser.add_argument("--limit", type=int, default=25, help="max prospects to score in this run")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    try:
        cfg = load_config(args.config)
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    log = Log(cfg.log_dir, verbose=args.verbose)
    _banner(cfg, log)

    loaded = load_env_file(cfg.root / ".env")
    if loaded:
        log.info("env_file_loaded", keys=loaded)

    tracker = tracker_mod.Tracker(cfg, log)
    profile = _ensure_profile(cfg, log, refresh=args.refresh)
    keywords = kw_mod.build(cfg, profile, log)

    if args.crawl_only:
        log.info("done", mode="crawl")
        return 0

    provider = search.get_provider(cfg, log)

    if args.daily or args.prospect_only:
        gap_rows = competitor_gap.run(cfg, PoliteFetcher(cfg, log), provider, log)
        fetcher = PoliteFetcher(cfg, log)
        prospector.discover(cfg, fetcher, provider, keywords, gap_rows, log)
        if args.prospect_only:
            return 0

    if args.daily or args.score_only:
        _score_pending(cfg, log, keywords, tracker, limit=args.limit)
        if args.score_only:
            tracker.write_report()
            return 0

    if args.daily or args.outreach_only:
        outreach.run(cfg, profile, keywords, tracker, log, dry_run=args.dry_run)

    if args.daily or args.followup_only:
        followup.run(cfg, profile, tracker, log, dry_run=args.dry_run)

    if args.daily or args.check_links:
        _maybe_check_links(cfg, log, tracker, force=args.check_links)

    if args.submit_directories:
        from backlink_agent import directory_submit

        directory_submit.run(cfg, profile, log, live=args.live, only=args.only)

    report_path = tracker.write_report()
    _print_summary(cfg, tracker, report_path)
    log.action("run_complete", mode="daily" if args.daily else "partial", at=iso())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
