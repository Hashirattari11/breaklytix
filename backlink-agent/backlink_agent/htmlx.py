"""HTML helpers. One place for parsing quirks so modules stay readable."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from bs4 import BeautifulSoup

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"^\+?[\d\s().\-]{7,20}$")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9'\-]+")

# Addresses that are never worth a cold email.
EMAIL_BLOCKLIST = (
    "noreply", "no-reply", "donotreply", "wordpress@", "admin@localhost",
    "example.com", "sentry.io", "wixpress.com", "your-email", "email@",
)
ROLE_PREFIXES = (
    "editor", "editors", "hello", "hi", "contact", "info", "team", "press",
    "marketing", "partnerships", "submissions", "submit", "write", "content",
    "support", "community", "pr",
)

# Addresses that exist on a page but are the wrong desk for a pitch. Emailing
# donors@ about a guest post is worse than sending nothing.
NOT_FOR_OUTREACH = (
    "donors", "donate", "donations", "billing", "payments", "invoice", "legal",
    "privacy", "abuse", "security", "jobs", "careers", "recruiting", "dmca",
    "unsubscribe", "newsletter", "webmaster", "postmaster", "hostmaster",
    "root", "noreply", "no-reply", "donotreply", "sales", "refunds",
)
JUNK_HOSTS = (
    "facebook.com", "twitter.com", "x.com", "instagram.com", "pinterest.com",
    "youtube.com", "tiktok.com", "linkedin.com", "reddit.com", "medium.com",
    "wikipedia.org", "amazon.com", "apple.com", "google.com", "yandex.com",
)

# Code hosts host thousands of independent projects. Two repos on github.com
# are two different prospects, so they are deduped by repo path, not by domain.
CODE_HOSTS = {"github.com", "gitlab.com", "codeberg.org", "bitbucket.org"}

SPAM_TERMS = (
    "casino", "betting", "gambling", "essay writing service", "buy backlinks",
    "seo packages", "guest post packages", "link insertion", "pbn",
    "payday loan", "cbd gummies", "escort", "crypto pump",
)
LINK_FARM_MARKERS = (
    "add url", "submit url", "free directory list", "reciprocal link",
    "link partner", "web directory", "seo friendly directory",
)
GUEST_POST_MARKERS = ("write for us", "guest post", "contribute", "submit an article", "become a contributor")
DIRECTORY_MARKERS = ("submit your tool", "submit a tool", "add your product", "submit your product", "list your tool", "directory")


@dataclass
class Link:
    href: str
    text: str
    rel: str
    is_external: bool


@dataclass
class Page:
    url: str
    title: str
    description: str
    h1: list[str]
    h2: list[str]
    h3: list[str]
    text: str
    links: list[Link]
    emails: set[str]
    canonical: str
    noindex: bool
    has_contact_form: bool
    word_count: int


def _text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)) if node else ""


def soup_of(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "html.parser")


def page_title(soup: BeautifulSoup) -> str:
    if soup.title and soup.title.string:
        return re.sub(r"\s+", " ", soup.title.string).strip()
    og = soup.find("meta", attrs={"property": "og:title"})
    return (og.get("content") or "").strip() if og else ""


def meta_description(soup: BeautifulSoup) -> str:
    tag = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    return (tag.get("content") or "").strip() if tag else ""


def headings(soup: BeautifulSoup) -> tuple[list[str], list[str], list[str]]:
    def collect(tag: str, limit: int) -> list[str]:
        out: list[str] = []
        for node in soup.find_all(tag):
            value = _text(node)
            if value and value not in out:
                out.append(value)
            if len(out) >= limit:
                break
        return out

    return collect("h1", 3), collect("h2", 25), collect("h3", 40)


def visible_text(soup: BeautifulSoup) -> str:
    for bad in soup(["script", "style", "noscript", "svg"]):
        bad.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True))


def extract_links(soup: BeautifulSoup, base_url: str, page_host: str) -> list[Link]:
    from urllib.parse import urljoin, urlsplit

    out: list[Link] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = urljoin(base_url, anchor["href"]).strip()
        if not href.lower().startswith(("http://", "https://")):
            continue
        if href in seen:
            continue
        seen.add(href)
        host = (urlsplit(href).hostname or "").lower()
        out.append(
            Link(
                href=href,
                text=_text(anchor)[:200],
                rel=(anchor.get("rel") or [""])[0] if isinstance(anchor.get("rel"), list) else str(anchor.get("rel") or ""),
                is_external=bool(host) and host != page_host and not host.endswith("." + page_host),
            )
        )
    return out


def extract_emails(html: str, soup: BeautifulSoup) -> set[str]:
    found: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if href.lower().startswith("mailto:"):
            address = href[7:].split("?")[0].strip().lower()
            if EMAIL_RE.fullmatch(address):
                found.add(address)
    for match in EMAIL_RE.findall(html or ""):
        candidate = match.strip().lower().rstrip(".")
        found.add(candidate)
    return {e for e in found if not any(bad in e for bad in EMAIL_BLOCKLIST)}


def has_contact_form(soup: BeautifulSoup) -> bool:
    if soup.find("form"):
        for form in soup.find_all("form"):
            action = (form.get("action") or "").lower()
            if any(word in action for word in ("contact", "submit", "inquir")):
                return True
            if form.find("input", attrs={"type": "email"}) or form.find("textarea"):
                return True
    return False


def canonical_url(soup: BeautifulSoup, base_url: str) -> str:
    from urllib.parse import urljoin

    tag = soup.find("link", attrs={"rel": lambda v: v and "canonical" in (v if isinstance(v, list) else [v])})
    if tag and tag.get("href"):
        return urljoin(base_url, tag["href"]).strip()
    return ""


def is_noindex(soup: BeautifulSoup, headers: dict[str, str]) -> bool:
    if "noindex" in (headers.get("x-robots-tag") or "").lower():
        return True
    for tag in soup.find_all("meta", attrs={"name": re.compile("^robots$", re.I)}):
        if "noindex" in (tag.get("content") or "").lower():
            return True
    return False


def parse_page(url: str, html: str, headers: dict[str, str] | None = None) -> Page:
    from urllib.parse import urlsplit

    soup = soup_of(html)
    host = (urlsplit(url).hostname or "").lower()
    h1, h2, h3 = headings(soup)
    text = visible_text(soup)
    return Page(
        url=url,
        title=page_title(soup),
        description=meta_description(soup),
        h1=h1,
        h2=h2,
        h3=h3,
        text=text,
        links=extract_links(soup, url, host),
        emails=extract_emails(html, soup),
        canonical=canonical_url(soup, url),
        noindex=is_noindex(soup, headers or {}),
        has_contact_form=has_contact_form(soup),
        word_count=len(WORD_RE.findall(text)),
    )


def contains_any(text: str, terms: Iterable[str]) -> list[str]:
    lowered = (text or "").lower()
    return [term for term in terms if term in lowered]


def spam_hits(text: str) -> list[str]:
    return contains_any(text, SPAM_TERMS)


def link_farm_hits(text: str) -> list[str]:
    return contains_any(text, LINK_FARM_MARKERS)


def guest_post_hits(text: str) -> list[str]:
    return contains_any(text, GUEST_POST_MARKERS)


def directory_hits(text: str) -> list[str]:
    return contains_any(text, DIRECTORY_MARKERS)


def tokens(text: str) -> list[str]:
    return [w.lower() for w in WORD_RE.findall(text or "")]


def is_junk_host(host: str) -> bool:
    host = (host or "").lower()
    return any(host == j or host.endswith("." + j) for j in JUNK_HOSTS)
