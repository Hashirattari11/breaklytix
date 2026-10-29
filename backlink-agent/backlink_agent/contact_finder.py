"""Step 5 - find a human contact.

Only public, business-facing addresses: mailto links and addresses printed on
contact/about/contribute pages. No guessing (no firstname@domain.com), no
scraping of private data, no email-hunting services.
"""

from __future__ import annotations

from urllib.parse import urljoin

from .config import Config
from .htmlx import CODE_HOSTS, NOT_FOR_OUTREACH, ROLE_PREFIXES, parse_page
from .http import PoliteFetcher
from .log import Log
from .util import registrable_domain

CANDIDATE_PATHS = ("/contact", "/contact-us", "/about", "/write-for-us", "/guest-post", "/contribute", "/submit")
MAX_PAGES = 4


def _rank_email(email: str, domain: str) -> tuple[int, str]:
    local = email.split("@")[0]
    score = 0
    if email.endswith("@" + domain) or email.endswith("." + domain):
        score += 10
    if local in ROLE_PREFIXES:
        score += 5
    if local.startswith(("editor", "submit", "write", "content", "hello")):
        score += 4
    if len(email) > 60:
        score -= 5
    return score, local


def _pick(emails: set[str], domain: str) -> tuple[str, str]:
    usable = {e for e in emails if e.split("@")[0].split("+")[0] not in NOT_FOR_OUTREACH}
    if not usable:
        return "", ""
    ranked = sorted((_rank_email(e, domain) + (e,) for e in usable), key=lambda x: (-x[0], x[2]))
    best = ranked[0]
    return best[2], best[1]


def find(cfg: Config, fetcher: PoliteFetcher, prospect: dict, log: Log) -> dict:
    """Return {email, source_url, kind, notes}."""
    url = prospect.get("url", "")
    domain = prospect.get("domain") or registrable_domain(url) or ""
    if not domain:
        return {"email": "", "source_url": "", "kind": "", "notes": "no domain"}

    if domain.split("/")[0] in CODE_HOSTS:
        log.info("contact_manual_pr", domain=domain, url=url)
        return {
            "email": "",
            "source_url": url,
            "kind": "manual_pr",
            "notes": "code-hosted list - needs a pull request, not an email",
        }

    # 1. addresses already seen on the scored page
    known = set(prospect.get("emails") or [])
    email, local = _pick(known, domain)
    if email:
        log.info("contact_found", domain=domain, email=email, where="prospect page")
        return {"email": email, "source_url": url, "kind": local, "notes": "found on the scored page"}

    # 2. contact-ish pages on the same site
    base = f"https://{domain}"
    checked = 0
    for path in CANDIDATE_PATHS:
        if checked >= MAX_PAGES:
            break
        candidate = urljoin(base, path)
        fetch = fetcher.get(candidate)
        checked += 1
        if not fetch.ok:
            continue
        page = parse_page(fetch.final_url, fetch.html, fetch.headers)
        email, local = _pick(page.emails, domain)
        if email:
            log.action("contact_found", domain=domain, email=email, where=fetch.final_url)
            return {
                "email": email,
                "source_url": fetch.final_url,
                "kind": local,
                "notes": f"found on {path}",
            }
        if page.has_contact_form:
            log.info("contact_form_only", domain=domain, url=fetch.final_url)
            return {
                "email": "",
                "source_url": fetch.final_url,
                "kind": "form",
                "notes": "contact form only - needs manual submission",
            }

    log.info("no_contact", domain=domain)
    return {"email": "", "source_url": "", "kind": "none", "notes": "no public email or form found"}
