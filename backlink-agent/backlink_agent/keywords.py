"""Turn the crawled profile into search queries, niche terms and a pitch angle.

Everything here is deterministic and derived from strings found on the site.
No LLM, no invented features, no made-up numbers.
"""

from __future__ import annotations

import re
from typing import Iterable

from .config import Config
from .log import Log
from .util import write_json

# Query templates. {kw} is replaced with each niche phrase.
QUERY_TEMPLATES = (
    "write for us {kw}",
    "{kw} resources",
    "best {kw} tools",
    "submit your tool",
    "{kw} directory",
    "{kw} blog guest post",
    "{kw} comparison",
    '"{kw}" intitle:resources',
)

# Words that make a bad standalone keyword phrase.
WEAK = {
    "breaklytix", "docs", "pricing", "login", "sign", "home", "page", "read",
    "learn", "more", "started", "overview", "guide", "example", "examples",
    # Generic site furniture: present on every page, so matching it says
    # nothing about topical relevance and makes the queries nonsense.
    "know", "legal", "privacy", "terms", "cookie", "cookies", "rights",
    "reserved", "frequently", "asked", "questions", "question", "works",
    "work", "product", "products", "security", "about", "contact", "blog",
    "company", "features", "feature", "faq", "support", "welcome", "today",
    "ready", "start", "free", "plans", "plan", "month", "year", "notice",
    "policy", "transparent", "simple", "email", "account", "accounts",
}

# Headings that look like phrases but are page furniture, not a niche.
GENERIC_PHRASES = {
    "how it works", "why this keeps happening", "frequently asked questions",
    "plans and pricing", "simple, transparent pricing", "supported apis",
    "communication & messaging", "sign in", "get started", "learn more",
}


def _clean_phrase(value: str) -> str:
    value = re.sub(r"\s+", " ", (value or "").strip(" -|·:—–"))
    value = re.sub(r"^(the|a|an)\s+", "", value, flags=re.I)
    return value.strip()


def build(cfg: Config, profile: dict, log: Log) -> dict:
    """Return {niche_terms, queries, pitch} and persist it."""
    terms: list[str] = []

    if cfg.niche and cfg.niche.strip().lower() not in {"fill", "auto"}:
        # Split "a / b / c" into individual phrases, keep the whole thing too.
        parts = [p.strip() for p in re.split(r"[/,|]", cfg.niche) if p.strip()]
        terms.append(cfg.niche.strip())
        terms.extend(parts)
    else:
        log.warn("niche_missing", note="falling back to crawled site terms only")

    # Crawled signals: title, description, headings.
    for source in (profile.get("title"), profile.get("description")):
        phrase = _clean_phrase(source or "")
        if 8 <= len(phrase) <= 90:
            terms.append(phrase)

    for heading in profile.get("main_headings") or []:
        phrase = _clean_phrase(heading)
        # Keep short, noun-ish headings; drop marketing sentences.
        if 2 <= len(phrase.split()) <= 5 and len(phrase) <= 60:
            terms.append(phrase)

    for term in profile.get("key_terms") or []:
        if len(term) >= 4 and term not in WEAK:
            terms.append(term)

    # Dedupe, preserve order, drop weak fragments.
    brand = cfg.my_domain.split(".")[0].lower()
    seen: set[str] = set()
    niche_terms: list[str] = []
    for term in terms:
        key = term.lower()
        if key in seen or key in WEAK or key in GENERIC_PHRASES or len(key) < 4:
            continue
        if brand and brand in key:
            continue  # your own name is not a niche phrase
        if key.startswith(("how ", "why ", "what ", "when ", "where ", "who ")):
            continue  # a question is a page heading, not a query term
        seen.add(key)
        niche_terms.append(term)

    # Queries use a small, focused subset so we do not spray hundreds of
    # near-duplicate searches at any search API. Core phrases come from the
    # configured niche first, then from single-word crawled terms - full
    # marketing sentences make nonsense queries ("write for us Why this works").
    cores: list[str] = []
    if cfg.niche and cfg.niche.strip().lower() not in {"fill", "auto"}:
        for part in re.split(r"[/,|]", cfg.niche):
            part = _clean_phrase(part)
            if 1 <= len(part.split()) <= 4 and part.lower() not in cores:
                cores.append(part)
    for term in profile.get("key_terms") or []:
        if len(cores) >= 6:
            break
        key = term.lower()
        if len(key) < 6 or key in WEAK or not key.isalpha():
            continue
        if key not in {c.lower() for c in cores}:
            cores.append(key)
    queries: list[str] = []
    for core in cores:
        for template in QUERY_TEMPLATES:
            query = template.format(kw=core)
            if query not in queries:
                queries.append(query)

    pitch = _pitch(cfg, profile)
    payload = {
        "niche_terms": niche_terms[:24],
        "queries": queries[: cfg.search.max_queries_per_run],
        "pitch": pitch,
        "generated_from": profile.get("evidence", []),
    }
    write_json(cfg.keywords_path, payload)
    log.action("keywords_built", terms=len(payload["niche_terms"]), queries=len(payload["queries"]))
    return payload


def _pitch(cfg: Config, profile: dict) -> dict:
    """A pitch angle grounded in the site's own words."""
    title = _clean_phrase(profile.get("title") or "")
    description = _clean_phrase(profile.get("description") or "")
    product = cfg.outreach.product_name or profile.get("domain", "")

    # Value offers we can honestly make. Which one is chosen per prospect
    # depends on what that prospect's page actually is.
    offers = [
        {
            "type": "guest_post",
            "idea": (
                "a practical article explaining how a third-party API change reaches "
                "production code, using one real changelog entry as the example"
            ),
        },
        {
            "type": "broken_link",
            "idea": "replacing a dead link with a maintained page that covers the same topic",
        },
        {
            "type": "tool_submission",
            "idea": f"adding {product} with a factual one-line description",
        },
    ]

    return {
        "product": product,
        "site": cfg.site_url,
        "one_liner": description or title,
        "proof_points": _proof_points(profile),
        "offers": offers,
        "tone_rules": [
            "reference the exact page you are writing to",
            "one concrete observation, not a compliment",
            "one ask, one sentence",
            "no superlatives, no growth numbers, no invented customers",
        ],
    }


def _proof_points(profile: dict) -> list[str]:
    """Facts that appear on the site itself, quoted rather than embellished."""
    points: list[str] = []
    text = " ".join(
        filter(
            None,
            [profile.get("title", ""), profile.get("description", "")]
            + (profile.get("main_headings") or []),
        )
    )
    for match in re.findall(r"\b(\d{1,3})\s+(?:third-party\s+)?(?:API\s+)?providers\b", text, re.I):
        points.append(f"{match} providers tracked (as stated on the site)")
    docs = profile.get("docs_pages") or []
    if docs:
        points.append(f"{len(docs)} documentation pages profiled")
    if profile.get("pages"):
        points.append(f"{len(profile['pages'])} public pages crawled")
    return points[:4]


def keywords_from(profile: dict) -> Iterable[str]:
    return profile.get("key_terms") or []
