"""Step 4 - score a prospect from 0 to 100 and explain every point.

The score is deliberately conservative and the breakdown is stored with the
number, because "why did this get 71?" must be answerable six weeks later.

Weights: relevance 35, domain age 15, technical 10, contactability 15,
link policy 10, minus spam penalties (up to -25).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import requests

from .config import Config
from .htmlx import (
    directory_hits,
    guest_post_hits,
    link_farm_hits,
    parse_page,
    spam_hits,
)
from .http import PoliteFetcher
from .log import Log
from .util import domain_of, iso, read_json, registrable_domain, write_json


class DomainAge:
    """RDAP lookup with an on-disk cache. Unknown is a valid answer."""

    def __init__(self, cfg: Config, log: Log) -> None:
        self.path = cfg.data_dir / "rdap_cache.json"
        self.log = log
        self.cache: dict[str, dict] = read_json(self.path, {}) or {}

    def years(self, domain: str) -> float | None:
        entry = self.cache.get(domain)
        if entry and entry.get("checked"):
            created = entry.get("created")
            return _age_years(created) if created else None

        created = self._lookup(domain)
        self.cache[domain] = {"created": created, "checked": iso()}
        write_json(self.path, self.cache)
        return _age_years(created) if created else None

    def _lookup(self, domain: str) -> str | None:
        try:
            resp = requests.get(
                f"https://rdap.org/domain/{domain}",
                timeout=15,
                headers={"Accept": "application/rdap+json"},
                allow_redirects=True,
            )
            if resp.status_code != 200:
                self.log.info("rdap_miss", domain=domain, status=resp.status_code)
                return None
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            self.log.info("rdap_error", domain=domain, error=str(exc))
            return None
        finally:
            time.sleep(0.5)  # be kind to the public RDAP bootstrap

        for event in data.get("events") or []:
            if (event.get("eventAction") or "").lower() == "registration":
                return event.get("eventDate")
        return None


def _age_years(created_iso: str | None) -> float | None:
    if not created_iso:
        return None
    try:
        created = datetime.fromisoformat(created_iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - created).days / 365.25)


def _factor(points: float, maximum: int, *reasons: str) -> dict:
    return {"points": round(max(0.0, min(float(maximum), points)), 1), "max": maximum, "reasons": [r for r in reasons if r]}


def score_prospect(
    cfg: Config,
    fetcher: PoliteFetcher,
    prospect: dict,
    niche_terms: list[str],
    domain_age: DomainAge,
    log: Log,
) -> dict:
    url = prospect.get("url", "")
    fetch = fetcher.get(url)
    if not fetch.ok:
        return {
            "url": url,
            "domain": prospect.get("domain") or registrable_domain(url),
            "score": 0,
            "dropped": True,
            "drop_reason": f"unreachable ({fetch.status or fetch.error})",
            "factors": {},
            "scored_at": iso(),
        }

    page = parse_page(fetch.final_url, fetch.html, fetch.headers)
    text_lower = page.text.lower()
    title_blob = " ".join([page.title] + page.h1 + page.h2).lower()
    # `domain` is the prospect identity (which may be a repo path); RDAP and
    # canonical checks need the real registrable domain.
    domain = prospect.get("domain") or registrable_domain(url) or ""
    site_domain = registrable_domain(url) or domain

    # -- relevance (35) ------------------------------------------------------
    matched = [t for t in niche_terms if t.lower() in text_lower]
    title_matched = [t for t in niche_terms if t.lower() in title_blob]
    rel_points = min(20, len(matched) * 4) + min(8, len(title_matched) * 4)
    rel_reasons = []
    if matched:
        rel_reasons.append(f"mentions {len(matched)} niche terms (e.g. {', '.join(matched[:3])})")
    if title_matched:
        rel_reasons.append(f"niche terms in headings: {', '.join(title_matched[:3])}")
    opportunity = prospect.get("opportunity", "article")
    if opportunity == "guest_post":
        rel_points += 6
        rel_reasons.append("page is about contributing / writing for them")
    elif opportunity == "resource_list":
        rel_points += 4
        rel_reasons.append("page is a curated resource list")
    elif opportunity == "directory":
        rel_points += 3
        rel_reasons.append("page is a directory or submission page")
    if not matched and opportunity == "article":
        rel_reasons.append("no topical overlap found on the page")
    relevance = _factor(rel_points, 35, *rel_reasons)

    # -- domain age (15) -----------------------------------------------------
    age = domain_age.years(site_domain)
    if age is None:
        age_factor = _factor(7, 15, "domain age unknown (RDAP had no answer)")
    else:
        if age < 0.5:
            pts, note = 3, f"very new domain ({age:.1f}y)"
        elif age < 1:
            pts, note = 5, f"under a year old ({age:.1f}y)"
        elif age < 2:
            pts, note = 8, f"{age:.1f}y old"
        elif age < 5:
            pts, note = 11, f"{age:.1f}y old"
        elif age < 10:
            pts, note = 13, f"{age:.1f}y old"
        else:
            pts, note = 15, f"{age:.0f}y old"
        age_factor = _factor(pts, 15, note)

    # -- technical (10) ------------------------------------------------------
    tech_points = 0
    tech_reasons = []
    if fetch.final_url.startswith("https://"):
        tech_points += 4
        tech_reasons.append("https")
    else:
        tech_reasons.append("no https")
    if page.noindex:
        tech_reasons.append("page is noindex - a link here is invisible to search")
    else:
        tech_points += 3
        tech_reasons.append("indexable")
    if page.h1:
        tech_points += 2
        tech_reasons.append("has an h1")
    canonical_ok = (not page.canonical) or (domain_of(page.canonical) or "") == site_domain
    if canonical_ok:
        tech_points += 1
    else:
        tech_reasons.append(f"canonical points to another domain ({domain_of(page.canonical)})")
    technical = _factor(tech_points, 10, *tech_reasons)

    # -- contactability (15) -------------------------------------------------
    emails = sorted(page.emails)
    contact_points = 0
    contact_reasons = []
    if emails:
        contact_points += 10
        contact_reasons.append(f"email on page: {emails[0]}")
        if any(e.split("@")[0] in {"editor", "hello", "contact", "info", "submissions"} for e in emails):
            contact_points += 0  # already counted; role address noted for reference
            contact_reasons.append("role address, appropriate for outreach")
    if page.has_contact_form:
        contact_points += 3
        contact_reasons.append("contact form present")
    if any(s in text_lower for s in ("twitter.com", "x.com/", "linkedin.com", "github.com")):
        contact_points += 2
        contact_reasons.append("social/profile presence")
    if not contact_points:
        contact_reasons.append("no email, form or profile found on the page")
    contactability = _factor(contact_points, 15, *contact_reasons)

    # -- link policy (10) ----------------------------------------------------
    link_points = 0
    link_reasons = []
    guest_hits = guest_post_hits(page.text)
    dir_hits = directory_hits(page.text)
    if guest_hits:
        link_points += 6
        link_reasons.append(f"publishes contributions ({', '.join(guest_hits[:2])})")
    if dir_hits:
        link_points += 4
        link_reasons.append(f"accepts listings ({', '.join(dir_hits[:2])})")
    external = [l for l in page.links if l.is_external]
    sample = external[:80]
    dofollow = [l for l in sample if not l.rel or "nofollow" not in l.rel.lower()]
    if sample and len(dofollow) / len(sample) > 0.5:
        link_points += 4
        link_reasons.append(f"{len(dofollow)}/{len(sample)} sampled external links are followed")
    elif sample:
        link_reasons.append("most sampled external links are nofollow")
    link_policy = _factor(link_points, 10, *link_reasons)

    # -- spam penalties (up to -25) -----------------------------------------
    penalty = 0
    spam_notes: list[str] = []
    hits = spam_hits(page.text)
    if hits:
        penalty += 12
        spam_notes.append(f"spam vocabulary: {', '.join(hits[:3])}")
    farm = link_farm_hits(page.text)
    if farm:
        penalty += 8
        spam_notes.append(f"link-farm wording: {', '.join(farm[:3])}")
    if len(external) > cfg.scoring.max_external_links:
        penalty += 8
        spam_notes.append(f"{len(external)} external links (cap {cfg.scoring.max_external_links}) - looks like a link list")
    if page.word_count < cfg.scoring.thin_content_words:
        penalty += 6
        spam_notes.append(f"thin content ({page.word_count} words)")
    if page.noindex:
        penalty += 6
        spam_notes.append("noindex")
    if any(word in text_lower for word in ("domain for sale", "this domain is parked", "buy this domain")):
        penalty += 15
        spam_notes.append("parked/for-sale page")
    penalty = min(25, penalty)

    raw = relevance["points"] + age_factor["points"] + technical["points"] + contactability["points"] + link_policy["points"]
    total = max(0, min(100, round(raw - penalty)))

    factors = {
        "relevance": relevance,
        "domain_age": age_factor,
        "technical": technical,
        "contactability": contactability,
        "link_policy": link_policy,
        "spam_penalty": {"points": -penalty, "max": 0, "reasons": spam_notes},
    }
    dropped = total < cfg.scoring.drop_below
    result = {
        "url": fetch.final_url,
        "domain": domain,
        "title": page.title,
        "score": total,
        "dropped": dropped,
        "drop_reason": f"below threshold {cfg.scoring.drop_below}" if dropped else "",
        "factors": factors,
        "word_count": page.word_count,
        "external_links": len(external),
        "emails": emails,
        "has_contact_form": page.has_contact_form,
        "noindex": page.noindex,
        "opportunity": prospect.get("opportunity", "article"),
        "source": prospect.get("source", ""),
        "evidence": prospect.get("evidence", ""),
        "scored_at": iso(),
    }
    log.info("scored", domain=domain, score=total, dropped=dropped)
    return result
