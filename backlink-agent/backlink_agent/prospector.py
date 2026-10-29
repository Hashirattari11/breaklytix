"""Step 3 - build the prospect list.

Sources, in order of trust:
  seed file  -> pages you added yourself (data/seeds.txt)
  search     -> query results, only if a search provider is configured
  gap        -> competitor gap candidates
  broken     -> resource pages that link to a dead URL on a competitor domain

Nothing is stored twice: the registrable domain is the dedupe key.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from .config import Config
from .htmlx import CODE_HOSTS, is_junk_host, parse_page
from .http import PoliteFetcher
from .log import Log
from .util import domain_of, iso, normalize_url, read_jsonl, registrable_domain, write_json

# Pages that look like they curate links - these are worth a broken-link scan.
RESOURCE_HINTS = ("resource", "resources", "links", "tools", "awesome", "directory", "collection", "list")

# Hard exclusions. Not "low score" - never contacted.
ALWAYS_BLOCK = (
    "pinterest.com", "quora.com", "slideshare.net", "scoop.it", "blogspot.com",
    "wordpress.com", "weebly.com", "wixsite.com", "tumblr.com", "medium.com",
)


def load_seeds(cfg: Config) -> list[str]:
    path = cfg.data_dir / "seeds.txt"
    if not path.exists():
        return []
    urls: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(normalize_url(line.split()[0]))
    return urls


def load_blocklist(cfg: Config) -> set[str]:
    blocked = set(ALWAYS_BLOCK)
    path = cfg.data_dir / "blocklist.txt"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip().lower()
            if line and not line.startswith("#"):
                blocked.add(registrable_domain(line) or line)
    return blocked


def _is_resource_page(title: str, url: str) -> bool:
    haystack = f"{title} {url}".lower()
    return any(hint in haystack for hint in RESOURCE_HINTS)


def identity_of(url: str) -> str | None:
    """Dedupe key: registrable domain, except per-repo on code hosts."""
    domain = registrable_domain(url)
    if not domain:
        return None
    if domain in CODE_HOSTS:
        path = urlsplit(url).path.strip("/")
        if path:
            return f"{domain}/{path}"
    return domain


def _scan_broken_links(
    cfg: Config, fetcher: PoliteFetcher, page_url: str, competitors: list[str], log: Log
) -> list[dict]:
    """Return broken-link opportunities found on one resource page."""
    if not competitors:
        return []
    fetch = fetcher.get(page_url)
    if not fetch.ok:
        return []
    page = parse_page(fetch.final_url, fetch.html, fetch.headers)
    out: list[dict] = []
    checked = 0
    for link in page.links:
        if checked >= 5:
            break
        target = registrable_domain(link.href)
        if not target or target not in competitors:
            continue
        checked += 1
        status = fetcher.head(link.href)
        if status in (404, 410):
            out.append(
                {
                    "url": page.url,
                    "domain": registrable_domain(page.url),
                    "title": page.title,
                    "source": "broken_link",
                    "opportunity": "broken_link",
                    "evidence": f"page links {link.href} which returns HTTP {status}",
                    "dead_url": link.href,
                    "anchor_text": link.text,
                    "found_at": iso(),
                }
            )
            log.action("broken_link_found", page=page.url, dead=link.href, status=status)
    return out


def _classify(url: str, title: str, snippet: str) -> str:
    haystack = f"{url} {title} {snippet}".lower()
    if "github.com/" in haystack or "gitlab.com/" in haystack:
        return "awesome_list"
    if "write for us" in haystack or "guest post" in haystack or "contribute" in haystack:
        return "guest_post"
    if "directory" in haystack or "submit" in haystack:
        return "directory"
    if "resource" in haystack or "tools" in haystack or "links" in haystack or "awesome" in haystack:
        return "resource_list"
    return "article"


def discover(
    cfg: Config,
    fetcher: PoliteFetcher,
    provider,
    keywords: dict,
    gap_rows: list[dict],
    log: Log,
) -> list[dict]:
    found: list[dict] = []
    blocked = load_blocklist(cfg)
    seen_domains: set[str] = set()
    seen_urls: set[str] = set()

    # Existing prospects must not be re-added.
    for row in read_jsonl(cfg.data_dir / "prospects_raw.jsonl"):
        if row.get("domain"):
            seen_domains.add(row["domain"])
        if row.get("url"):
            seen_urls.add(row["url"])

    def add(url: str, *, source: str, title: str = "", snippet: str = "", query: str = "", extra: dict | None = None) -> None:
        url = normalize_url(url)
        domain = registrable_domain(url)
        identity = identity_of(url)
        if not domain or not identity or domain == cfg.my_domain:
            return
        if domain in blocked or identity in seen_domains or url in seen_urls:
            return
        if is_junk_host(domain):
            return
        seen_domains.add(identity)
        seen_urls.add(url)
        record = {
            "url": url,
            "domain": identity,
            "title": title,
            "snippet": snippet,
            "query": query,
            "source": source,
            "opportunity": _classify(url, title, snippet),
            "found_at": iso(),
        }
        if extra:
            record.update(extra)
        found.append(record)

    # 1. seeds
    for url in load_seeds(cfg):
        add(url, source="seed")

    # 2. search results
    if getattr(provider, "available", False):
        for query in keywords.get("queries", []):
            for result in provider.search(query):
                add(result.url, source="search", title=result.title, snippet=result.snippet, query=query)
    else:
        log.info("search_disabled", note="no provider; prospecting from seeds, CSV and gap only")

    # 3. competitor gap
    for row in gap_rows:
        add(
            row.get("url", ""),
            source="competitor_gap",
            title=row.get("title", ""),
            snippet=row.get("snippet", ""),
            extra={"competitor": row.get("competitor", ""), "evidence": row.get("evidence", "")},
        )

    # 4. broken links on the resource pages we just found
    resource_pages = [f["url"] for f in found if _is_resource_page(f.get("title", ""), f["url"])][:10]
    for page_url in resource_pages:
        for broken in _scan_broken_links(cfg, fetcher, page_url, cfg.competitor_domains, log):
            domain = broken.get("domain")
            if domain in seen_domains:
                # Already a prospect - upgrade it instead of adding a duplicate.
                for record in found:
                    if record["domain"] == domain:
                        record["opportunity"] = "broken_link"
                        record["evidence"] = broken["evidence"]
                        record["dead_url"] = broken["dead_url"]
                continue
            add(
                broken["url"],
                source="broken_link",
                title=broken["title"],
                extra={
                    "opportunity": "broken_link",
                    "evidence": broken["evidence"],
                    "dead_url": broken.get("dead_url", ""),
                    "anchor_text": broken.get("anchor_text", ""),
                },
            )

    for record in found:
        from .util import append_jsonl

        append_jsonl(cfg.data_dir / "prospects_raw.jsonl", record)

    write_json(
        cfg.data_dir / "prospect_run.json",
        {"generated_at": iso(), "added": len(found), "total_raw": len(read_jsonl(cfg.data_dir / "prospects_raw.jsonl"))},
    )
    log.action(
        "prospecting_done",
        added=len(found),
        by_source={s: sum(1 for f in found if f["source"] == s) for s in {f["source"] for f in found}},
    )
    return found


def interesting_domain(url: str) -> str | None:
    host = domain_of(url)
    if not host or re.search(r"\.(pdf|jpg|png|zip|exe)$", url, re.I):
        return None
    return host
