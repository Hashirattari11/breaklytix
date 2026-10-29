"""Step 10 - weekly: is the link still there, and what does it look like?

A placement is not a backlink until this script has seen the href in the served
HTML. It records rel attributes, anchor text and whether the hosting page is
indexable, then keeps a history so a link that disappears is noticed.
"""

from __future__ import annotations

from .config import Config
from .htmlx import parse_page
from .http import PoliteFetcher
from .log import Log
from .tracker import Tracker
from .util import iso, read_json, registrable_domain, write_json

HISTORY = "link_history.json"


def _find_links(html_page, my_domain: str) -> list[dict]:
    out: list[dict] = []
    for link in html_page.links:
        if registrable_domain(link.href) == my_domain:
            out.append(
                {
                    "href": link.href,
                    "anchor": link.text,
                    "rel": link.rel or "(none)",
                    "followed": not link.rel or "nofollow" not in link.rel.lower(),
                }
            )
    return out


def run(cfg: Config, fetcher: PoliteFetcher, tracker: Tracker, log: Log) -> dict:
    # Only pages we have actually recorded a placement on are checked. A
    # "replied" prospect does not have a link URL yet, and checking their
    # homepage would produce a false link_lost.
    rows = [r for r in tracker.rows.values() if r.get("link_url")]
    if not rows:
        log.info("link_check_none", note="no placements recorded yet")
        return {"checked": 0, "live": 0, "lost": 0}

    history_path = cfg.data_dir / HISTORY
    history: dict[str, list] = read_json(history_path, {}) or {}
    live = lost = 0

    for row in rows:
        page_url = row.get("link_url") or row.get("url")
        if not page_url:
            continue
        fetch = fetcher.get(page_url, use_cache=False)
        entry = {"checked_at": iso(), "page": page_url, "status": fetch.status, "found": []}

        if not fetch.ok:
            entry["note"] = f"page unreachable ({fetch.status or fetch.error})"
            status = "link_lost" if row.get("status") == "link_live" else row.get("status", "")
            log.warn("link_page_unreachable", domain=row["domain"], status=fetch.status)
        else:
            page = parse_page(fetch.final_url, fetch.html, fetch.headers)
            found = _find_links(page, cfg.my_domain)
            entry["found"] = found
            entry["page_noindex"] = page.noindex
            if found:
                best = next((f for f in found if f["followed"]), found[0])
                tracker.set_status(
                    row["domain"],
                    "link_live",
                    link_url=fetch.final_url,
                    link_rel=best["rel"],
                    link_status="live",
                    link_checked_at=iso(),
                )
                status = "link_live"
                live += 1
                log.action(
                    "link_live",
                    domain=row["domain"],
                    page=fetch.final_url,
                    rel=best["rel"],
                    anchor=best["anchor"][:60],
                )
            else:
                status = "link_lost"
                lost += 1
                tracker.set_status(
                    row["domain"], "link_lost", link_status="missing", link_checked_at=iso()
                )
                log.warn("link_missing", domain=row["domain"], page=fetch.final_url)

        entry["result"] = status
        history.setdefault(row["domain"], []).append(entry)
        history[row["domain"]] = history[row["domain"]][-12:]  # keep a year of weekly checks

    write_json(history_path, history)
    tracker.save()

    report = {
        "checked_at": iso(),
        "checked": len(rows),
        "live": live,
        "lost": lost,
        "observed_backlinks": live,
    }
    write_json(cfg.data_dir / "link_report.json", report)
    log.action("link_check_done", **{k: report[k] for k in ("checked", "live", "lost")})
    return report
