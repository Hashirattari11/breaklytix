"""Step 2 - domains that link to competitors but not to us.

Two honest sources:

1. CSV exports (Ahrefs / Semrush / Moz "backlinks" export). This is the reliable
   one: the relationships are observed data, not inference.
2. Mention search, only when a search provider is configured. We search for
   pages mentioning the competitor, fetch them, and accept the page only after
   confirming in the HTML that it really links to the competitor and does not
   link to us. No guessing from snippets.

Every candidate carries where it came from, so the outreach email can say
something true about why we are writing.
"""

from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass
from pathlib import Path

from .config import Config
from .htmlx import parse_page
from .http import PoliteFetcher
from .log import Log
from .util import iso, normalize_url, registrable_domain, write_json

SOURCE_KEYS = ("source_url", "source", "from", "referring_page", "referring_url", "url", "page")
TARGET_KEYS = ("target_url", "target", "to", "destination", "linked_page", "target_domain")


@dataclass
class GapCandidate:
    url: str
    domain: str
    title: str = ""
    competitor: str = ""
    source: str = "competitor_gap"
    detected_via: str = ""
    evidence: str = ""
    snippet: str = ""


def _pick(row: dict, keys: tuple[str, ...]) -> str:
    lowered = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
    for key in keys:
        if lowered.get(key):
            return lowered[key]
    return ""


def read_backlink_csv(path: Path) -> list[dict]:
    """Tolerant CSV reader: different tools use different column names."""
    try:
        raw = path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return []
    if not raw.strip():
        return []
    dialect = "\t" if raw.count("\t") > raw.count(",") else ","
    try:
        rows = list(csv.DictReader(io.StringIO(raw), dialect=dialect))
    except csv.Error:
        return []
    out: list[dict] = []
    for row in rows:
        source = _pick(row, SOURCE_KEYS)
        target = _pick(row, TARGET_KEYS)
        if not source:
            continue
        if not source.startswith("http"):
            source = "https://" + source.lstrip("/")
        out.append(
            {
                "source_url": normalize_url(source),
                "source_domain": registrable_domain(source),
                "target_domain": registrable_domain(target) if target else None,
            }
        )
    return out


def _my_linking_domains(cfg: Config) -> set[str]:
    domains: set[str] = set()
    for name in ("my_backlinks.csv", "my-backlinks.csv", "backlinks.csv"):
        path = cfg.data_dir / name
        if not path.exists():
            continue
        for row in read_backlink_csv(path):
            if row["source_domain"]:
                domains.add(row["source_domain"])
    return domains


def _gap_from_csv(cfg: Config, log: Log) -> list[GapCandidate]:
    import glob

    files = sorted(glob.glob(str(cfg.data_dir / "backlinks" / "*.csv")))
    if not files:
        log.info("gap_no_csv", dir=str(cfg.data_dir / "backlinks"))
        return []

    mine = _my_linking_domains(cfg)
    competitors = set(cfg.competitor_domains)
    by_source: dict[str, GapCandidate] = {}

    for file in files:
        rows = read_backlink_csv(Path(file))
        log.info("gap_csv_read", file=Path(file).name, rows=len(rows))
        for row in rows:
            target = row.get("target_domain")
            source_domain = row.get("source_domain")
            if not target or not source_domain:
                continue
            if target not in competitors:
                continue
            if source_domain == cfg.my_domain or source_domain in mine:
                continue
            if source_domain in by_source:
                # Remember every competitor this source links to.
                existing = by_source[source_domain]
                if target not in existing.competitor.split(","):
                    existing.competitor = f"{existing.competitor},{target}"
                continue
            by_source[source_domain] = GapCandidate(
                url=row["source_url"],
                domain=source_domain,
                competitor=target,
                detected_via="backlink_csv",
                evidence=f"{Path(file).name}: links to {target}, not to {cfg.my_domain}",
            )
    return list(by_source.values())


def _gap_from_mentions(cfg: Config, fetcher: PoliteFetcher, provider, log: Log) -> list[GapCandidate]:
    """Verify by fetching: page must link the competitor and must not link us."""
    if not getattr(provider, "available", False):
        return []
    out: list[GapCandidate] = []
    mine = _my_linking_domains(cfg)
    for competitor in cfg.competitor_domains:
        for result in provider.search(f'"{competitor}" -site:{competitor}')[:5]:
            domain = registrable_domain(result.url)
            if not domain or domain == cfg.my_domain or domain in mine:
                continue
            fetch = fetcher.get(result.url)
            if not fetch.ok:
                continue
            page = parse_page(fetch.final_url, fetch.html, fetch.headers)
            external = {registrable_domain(l.href) for l in page.links if l.is_external}
            links_competitor = competitor in external
            links_me = cfg.my_domain in external
            if links_competitor and not links_me:
                out.append(
                    GapCandidate(
                        url=fetch.final_url,
                        domain=domain,
                        title=page.title,
                        competitor=competitor,
                        detected_via="mention_search",
                        evidence=f"verified on page: links {competitor}, does not link {cfg.my_domain}",
                        snippet=result.snippet,
                    )
                )
                log.info("gap_verified", url=fetch.final_url, competitor=competitor)
    return out


def run(cfg: Config, fetcher: PoliteFetcher, provider, log: Log) -> list[dict]:
    if not cfg.has_competitors:
        log.warn("gap_skipped", reason="competitor_domains is empty")
        return []

    candidates = _gap_from_csv(cfg, log)
    candidates.extend(_gap_from_mentions(cfg, fetcher, provider, log))

    # Dedupe by registrable domain, keeping the strongest evidence.
    unique: dict[str, GapCandidate] = {}
    for cand in candidates:
        key = cand.domain or ""
        if not key:
            continue
        if key not in unique:
            unique[key] = cand

    rows = [asdict(c) for c in unique.values()]
    write_json(cfg.data_dir / "competitor_gap.json", {"generated_at": iso(), "count": len(rows), "candidates": rows})
    log.action("gap_done", competitors=len(cfg.competitor_domains), candidates=len(rows))
    return rows
