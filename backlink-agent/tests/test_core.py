"""Offline tests: no network, no API keys, no sending."""

from __future__ import annotations

from pathlib import Path

import pytest

from backlink_agent import keywords as kw_mod
from backlink_agent.config import Config, load_config
from backlink_agent.htmlx import parse_page
from backlink_agent.outreach import validate_email
from backlink_agent.scorer import _age_years
from backlink_agent.tracker import Tracker
from backlink_agent.util import is_fill, normalize_url, registrable_domain


def _cfg(tmp_path: Path) -> Config:
    cfg = Config(root=tmp_path, my_domain="breaklytix.site", niche="developer tools")
    cfg.ensure_dirs()
    return cfg


# -- util -------------------------------------------------------------------
def test_registrable_domain_handles_subdomains_and_multi_label_suffixes():
    assert registrable_domain("https://blog.example.co.uk/post") == "example.co.uk"
    assert registrable_domain("https://www.example.com/a") == "example.com"
    assert registrable_domain("https://api.example.com") == "example.com"
    assert registrable_domain("https://example.com") == "example.com"


def test_normalize_url_drops_fragment_and_trailing_slash():
    assert normalize_url("https://Example.com/Path/#frag") == "https://example.com/Path"
    assert normalize_url("example.com") == "https://example.com/"


def test_is_fill_detects_placeholders():
    assert is_fill("")
    assert is_fill("FILL")
    assert is_fill([])
    assert is_fill(None)
    assert not is_fill("breaklytix.site")


# -- html parsing -----------------------------------------------------------
HTML = """
<html><head>
<title>Write for us - Example Dev Blog</title>
<meta name="description" content="Contribute guest posts about APIs.">
<link rel="canonical" href="https://example.com/write-for-us">
<meta name="robots" content="noindex,follow">
</head><body>
<h1>Write for us</h1><h2>Guidelines</h2>
<p>We publish guest posts about developer tooling.</p>
<a href="mailto:editor@devblog.io">Email the editor</a>
<a href="https://other.com/x" rel="nofollow">partner</a>
<form action="/contact"><input type="email" name="e"></form>
</body></html>
"""


def test_parse_page_extracts_the_fields_outreach_needs():
    page = parse_page("https://example.com/write-for-us", HTML, {})
    assert page.title.startswith("Write for us")
    assert page.h1 == ["Write for us"]
    assert page.noindex is True
    assert page.canonical.endswith("/write-for-us")
    assert "editor@devblog.io" in page.emails
    assert page.has_contact_form is True
    assert any(link.rel == "nofollow" for link in page.links)


def test_parse_page_ignores_noreply_addresses():
    page = parse_page("https://example.com", "<p>mail noreply@example.com</p>", {})
    assert page.emails == set()


# -- tracker ----------------------------------------------------------------
def test_tracker_dedupes_by_domain_and_never_downgrades_status(tmp_path):
    cfg = _cfg(tmp_path)
    tracker = Tracker(cfg, log=_NullLog())
    tracker.upsert({"domain": "a.com", "score": "70", "status": "scored", "url": "https://a.com"})
    tracker.upsert({"domain": "a.com", "score": "80"})
    tracker.set_status("a.com", "sent")
    tracker.upsert({"domain": "a.com", "status": "scored", "notes": "still here"})
    tracker.save()

    reloaded = Tracker(cfg, log=_NullLog())
    assert len(reloaded.rows) == 1
    row = reloaded.get("a.com")
    assert row["status"] == "sent"
    assert row["score"] == "80"
    assert row["notes"] == "still here"


def test_tracker_persists_csv_header(tmp_path):
    cfg = _cfg(tmp_path)
    tracker = Tracker(cfg, log=_NullLog())
    tracker.upsert({"domain": "b.com", "status": "found"})
    tracker.save()
    text = cfg.prospects_path.read_text(encoding="utf-8")
    assert text.splitlines()[0].startswith("domain,url,title,score,status")


# -- outreach validation ----------------------------------------------------
def test_validate_email_rejects_invented_numbers_and_prices():
    profile = {"description": "Monitors 44 providers.", "pages": [1, 2]}
    body = (
        "Hi,\n\nI read your page about API monitoring and had one specific idea. "
        "We already helped 2500 teams and cost $500 per month. " + "word " * 60 + "Would that work?\n"
    )
    problems = validate_email("Dead link on example.com", body, profile)
    assert any("price" in p for p in problems)
    assert any("numbers not present" in p for p in problems)


def test_validate_email_accepts_a_grounded_message():
    profile = {"description": "Monitors 44 providers.", "pages": [1, 2]}
    body = (
        "Hi,\n\nI was reading your resources page and one outbound link returns a 404. "
        "I work on a tool that monitors 44 providers. "
        + "It maps changes to the files that break. " * 12
        + "\n\nWould a one-line replacement snippet help?\n"
    )
    problems = validate_email("Dead link on example.com", body, profile)
    assert not [p for p in problems if "numbers" in p or "price" in p]


# -- keywords ---------------------------------------------------------------
def test_keywords_are_derived_from_the_crawled_profile(tmp_path):
    cfg = _cfg(tmp_path)
    profile = {
        "title": "Breaklytix - API change monitoring for developers",
        "description": "Monitors third-party API changelogs and maps breaking changes to your code.",
        "main_headings": ["How it works", "Breaking API changes", "Providers"],
        "key_terms": ["providers", "changelogs", "repositories"],
        "docs_pages": ["https://breaklytix.site/docs"],
        "pages": [{"url": "https://breaklytix.site/"}],
        "evidence": ["https://breaklytix.site/"],
    }
    built = kw_mod.build(cfg, profile, log=_NullLog())
    assert built["niche_terms"]
    assert any("write for us" in q for q in built["queries"])
    assert built["pitch"]["product"] == "Breaklytix" or built["pitch"]["site"].endswith("breaklytix.site")


# -- config -----------------------------------------------------------------
def test_config_warns_instead_of_guessing_missing_competitors(tmp_path):
    path = tmp_path / "config.yaml"
    path.write_text(
        "my_domain: breaklytix.site\nniche: developer tools\ncompetitor_domains: []\n"
        "outreach_email: support@breaklytix.site\ndaily_send_limit: 10\nAUTO_SEND: false\n",
        encoding="utf-8",
    )
    cfg = load_config(path)
    assert cfg.has_competitors is False
    assert any("competitor_domains" in w for w in cfg.warnings)
    assert cfg.auto_send is False


def test_config_rejects_bad_daily_limit(tmp_path):
    path = tmp_path / "config.yaml"
    path.write_text("my_domain: x.com\ndaily_send_limit: 9999\n", encoding="utf-8")
    with pytest.raises(Exception):
        load_config(path)


# -- scorer helper ----------------------------------------------------------
def test_domain_age_years_from_iso():
    assert _age_years("2026-09-19T08:38:04.475Z") is not None
    assert _age_years(None) is None
    assert _age_years("not-a-date") is None


# -- prospect identity ------------------------------------------------------
def test_github_repos_are_separate_prospects_while_domains_dedupe():
    from backlink_agent.prospector import identity_of

    a = identity_of("https://github.com/crazy-canux/awesome-monitoring")
    b = identity_of("https://github.com/Kikobeats/awesome-api")
    assert a != b
    assert a == "github.com/crazy-canux/awesome-monitoring"
    assert identity_of("https://blog.example.com/post") == identity_of("https://example.com/other")


def test_contact_finder_never_emails_a_code_host(tmp_path):
    from backlink_agent import contact_finder

    cfg = _cfg(tmp_path)
    result = contact_finder.find(
        cfg,
        fetcher=None,  # must not be reached
        prospect={"url": "https://github.com/a/b", "domain": "github.com/a/b"},
        log=_NullLog(),
    )
    assert result["email"] == ""
    assert result["kind"] == "manual_pr"


def test_contact_finder_ignores_the_wrong_desk(tmp_path):
    from backlink_agent.contact_finder import _pick

    assert _pick({"donors@freecodecamp.org"}, "freecodecamp.org") == ("", "")
    assert _pick({"donors@freecodecamp.org", "editor@example.org"}, "example.org")[0] == "editor@example.org"


def test_http_status_codes_are_not_treated_as_invented_metrics():
    from backlink_agent.outreach import _has_invented_numbers

    profile = {"description": "Monitors 44 providers.", "pages": [1]}
    body = "One outbound link returns a 404 and another returns 301."
    assert _has_invented_numbers(body, profile) == []
    assert _has_invented_numbers("We already have 2500 customers.", profile) == ["2500"]


def test_draft_length_proposals_and_thousands_separators():
    from backlink_agent.outreach import _has_invented_numbers

    profile = {"description": "Monitors 44 providers.", "pages": [1]}
    assert _has_invented_numbers("Would a 1,200-word draft be useful?", profile) == []
    assert _has_invented_numbers("We already have 2,500 customers.", profile) == ["2500"]



class _NullLog:
    def info(self, *a, **k):
        pass

    def warn(self, *a, **k):
        pass

    def error(self, *a, **k):
        pass

    def action(self, *a, **k):
        pass
