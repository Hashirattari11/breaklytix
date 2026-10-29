"""Step 1 - learn what the site actually offers, from the site itself.

No product claims are invented here: every field is copied from a page we
fetched, and the source URL is stored next to it.
"""

from __future__ import annotations

import re
from collections import Counter
from urllib.parse import urlsplit

from .config import Config
from .http import PoliteFetcher
from .htmlx import WORD_RE, parse_page
from .log import Log
from .util import iso, write_json

STOPWORDS = {
    "the", "and", "for", "with", "your", "you", "that", "this", "from", "are", "was", "were",
    "will", "can", "not", "but", "all", "any", "our", "out", "how", "what", "when", "why",
    "who", "its", "it's", "into", "over", "than", "then", "them", "they", "their", "there",
    "here", "have", "has", "had", "been", "being", "more", "most", "less", "also", "just",
    "only", "very", "each", "every", "such", "some", "about", "after", "before", "between",
    "through", "under", "again", "against", "because", "while", "where", "which", "would",
    "should", "could", "does", "did", "doing", "done", "get", "gets", "got", "make", "makes",
    "made", "use", "used", "uses", "using", "one", "two", "new", "now", "see", "get", "per",
}

# Pages that explain the product best, in priority order.
PRIORITY_PATHS = (
    "/", "/pricing", "/providers", "/docs", "/about", "/security", "/contact",
)


def _same_site(url: str, domain: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    domain = domain.lower()
    return host == domain or host.endswith("." + domain)


def _top_terms(texts: list[str], limit: int = 18) -> list[str]:
    counts: Counter[str] = Counter()
    for text in texts:
        for word in WORD_RE.findall((text or "").lower()):
            if len(word) < 4 or word in STOPWORDS or word.isdigit():
                continue
            counts[word] += 1
    return [word for word, _ in counts.most_common(limit)]


def _sitemap_urls(cfg: Config, fetcher: PoliteFetcher, log: Log) -> list[str]:
    urls: list[str] = []
    for path in ("/sitemap.xml", "/sitemap_index.xml"):
        fetch = fetcher.get(cfg.site_url + path)
        if not fetch.ok or "<" not in fetch.html:
            continue
        if "<sitemapindex" in fetch.html:
            for child in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", fetch.html)[:10]:
                child_fetch = fetcher.get(child)
                urls.extend(re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", child_fetch.html or ""))
        else:
            urls.extend(re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", fetch.html))
        if urls:
            log.info("sitemap_found", count=len(urls), path=path)
            break
    return list(dict.fromkeys(u for u in urls if _same_site(u, cfg.my_domain)))


def crawl(cfg: Config, fetcher: PoliteFetcher, log: Log) -> dict:
    """Fetch the homepage + a handful of key pages, return a profile dict."""
    home_fetch = fetcher.get(cfg.site_url)
    if not home_fetch.ok:
        raise RuntimeError(f"Could not fetch {cfg.site_url}: {home_fetch.error or home_fetch.status}")

    home = parse_page(home_fetch.final_url, home_fetch.html, home_fetch.headers)
    sitemap = _sitemap_urls(cfg, fetcher, log)

    # Choose pages: priority paths that exist in the sitemap first, then sitemap order.
    chosen: list[str] = []
    pool = sitemap or [cfg.site_url]
    for path in PRIORITY_PATHS:
        candidate = cfg.site_url if path == "/" else cfg.site_url + path
        for url in pool:
            if urlsplit(url).path.rstrip("/") == urlsplit(candidate).path.rstrip("/"):
                if url not in chosen:
                    chosen.append(url)
                break
    for url in pool:
        if len(chosen) >= min(8, cfg.politeness.max_pages_per_domain):
            break
        if url not in chosen:
            chosen.append(url)

    pages: list[dict] = []
    for url in chosen:
        if url.rstrip("/") == cfg.site_url.rstrip("/"):
            page = home
        else:
            fetch = fetcher.get(url)
            if not fetch.ok:
                log.warn("page_unreachable", url=url, status=fetch.status, error=fetch.error)
                continue
            page = parse_page(fetch.final_url, fetch.html, fetch.headers)
        pages.append(
            {
                "url": page.url,
                "title": page.title,
                "description": page.description,
                "h1": page.h1,
                "h2": page.h2[:12],
                "word_count": page.word_count,
            }
        )
        log.info("page_profiled", url=page.url, words=page.word_count)

    headings_all = [h for p in pages for h in (p["h1"] + p["h2"])]
    corpus = [home.title, home.description] + headings_all + [p["title"] for p in pages]
    terms = _top_terms(corpus)

    profile = {
        "domain": cfg.my_domain,
        "site_url": cfg.site_url,
        "fetched_at": iso(),
        "title": home.title,
        "description": home.description,
        "h1": home.h1,
        "main_headings": headings_all[:30],
        "canonical": home.canonical,
        "noindex": home.noindex,
        "word_count_home": home.word_count,
        "pages": pages,
        "page_count": len(pages),
        "docs_pages": [p["url"] for p in pages if "/docs" in urlsplit(p["url"]).path],
        "key_terms": terms,
        "evidence": [p["url"] for p in pages],
    }
    write_json(cfg.profile_path, profile)
    log.action("site_profiled", pages=len(pages), terms=len(terms), path=str(cfg.profile_path))

    if home.noindex:
        log.warn("homepage_noindex", url=home.url, note="a noindex homepage cannot earn anything from backlinks")
    return profile
