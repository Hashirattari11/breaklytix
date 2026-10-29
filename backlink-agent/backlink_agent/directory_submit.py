"""Step 9 - fill vetted directory forms with Playwright.

This module is intentionally the most restricted part of the project:

  * only entries with `approved: true` in data/directories.yaml are touched
  * nothing is submitted unless `--live` is passed (dry-run fills the fields,
    screenshots them, and stops)
  * a captcha is never solved programmatically - the browser stays open and the
    script waits for you to solve it, then waits again for email verification
  * every attempt is appended to data/directory_attempts.jsonl

Playwright is optional: the rest of the agent runs without it.
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml

from .config import Config
from .log import Log
from .util import append_jsonl, iso, slug

CAPTCHA_SELECTORS = (
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "iframe[src*='turnstile']",
    "div.g-recaptcha",
    "div.h-captcha",
    "input[name='cf-turnstile-response']",
    "#challenge-form",
    "text=Verify you are human",
)

LOGIN_SELECTORS = (
    "input[type='password']",
    "text=Sign in",
    "text=Log in",
    "text=Continue with GitHub",
    "text=Continue with Google",
)


def _load_directories(cfg: Config, log: Log) -> list[dict]:
    path = cfg.data_dir / "directories.yaml"
    if not path.exists():
        log.warn("directories_missing", path=str(path))
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(raw, list):
        log.error("directories_invalid", note="expected a YAML list")
        return []
    return raw


def _first_present(page, selectors: tuple[str, ...]) -> str | None:
    for selector in selectors:
        try:
            if page.locator(selector).first.is_visible(timeout=1200):
                return selector
        except Exception:
            continue
    return None


def _pause(prompt: str) -> None:
    input(f"\n>>> {prompt}\n    Press ENTER to continue (Ctrl+C aborts)... ")


def run(cfg: Config, profile: dict, log: Log, *, live: bool = False, only: str | None = None) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.error("playwright_missing", note="pip install playwright && playwright install chromium")
        return {"attempted": 0, "submitted": 0, "skipped": 0}

    entries = [e for e in _load_directories(cfg, log) if e.get("approved") is True]
    if only:
        entries = [e for e in entries if e.get("name") == only]
    if not entries:
        log.warn("no_approved_directories", note="set approved: true in data/directories.yaml for the ones you vetted")
        return {"attempted": 0, "submitted": 0, "skipped": 0}

    shots = cfg.data_dir / "screenshots"
    shots.mkdir(parents=True, exist_ok=True)
    submitted = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context(user_agent=cfg.politeness.user_agent)
        page = context.new_page()

        for entry in entries:
            name = entry.get("name", "unnamed")
            url = entry.get("submit_url", "")
            attempt = {"at": iso(), "name": name, "url": url, "live": live, "result": ""}
            log.action("directory_open", name=name, url=url, live=live)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(1500)

                login = _first_present(page, LOGIN_SELECTORS)
                if login or entry.get("requires_login"):
                    _pause(
                        f"{name}: log in in the browser window, then continue. "
                        "The agent will not enter your password."
                    )
                    page.wait_for_timeout(1000)

                fields = entry.get("fields") or {}
                filled = 0
                for logical, selector in fields.items():
                    value = _value_for(logical, cfg, profile)
                    if not value or not selector:
                        continue
                    try:
                        page.fill(selector, value, timeout=6000)
                        filled += 1
                    except Exception as exc:
                        log.warn("field_fill_failed", name=name, field=logical, error=str(exc))
                attempt["fields_filled"] = filled

                screenshot = shots / f"{slug(name)}-filled.png"
                page.screenshot(path=str(screenshot), full_page=True)
                attempt["screenshot"] = str(screenshot)

                captcha = _first_present(page, CAPTCHA_SELECTORS)
                if captcha:
                    _pause(f"{name}: captcha detected. Solve it yourself in the browser, then continue.")
                    attempt["captcha_paused"] = True

                if not live:
                    attempt["result"] = "dry_run"
                    log.action("directory_dry_run", name=name, filled=filled)
                    append_jsonl(cfg.data_dir / "directory_attempts.jsonl", attempt)
                    continue

                selector = entry.get("submit_selector")
                if not selector:
                    attempt["result"] = "no_submit_selector"
                    log.warn("directory_no_submit_selector", name=name)
                    append_jsonl(cfg.data_dir / "directory_attempts.jsonl", attempt)
                    continue

                page.click(selector, timeout=15000)
                page.wait_for_timeout(3000)
                attempt["after_submit_url"] = page.url
                page.screenshot(path=str(shots / f"{slug(name)}-submitted.png"), full_page=True)

                _pause(
                    f"{name}: submission sent. Check the inbox for {cfg.outreach_email} and complete "
                    "email verification if required, then continue."
                )
                attempt["result"] = "submitted_pending_review"
                submitted += 1
                log.action("directory_submitted", name=name, after_url=page.url)

            except KeyboardInterrupt:
                log.warn("directory_aborted", name=name)
                attempt["result"] = "aborted_by_user"
                append_jsonl(cfg.data_dir / "directory_attempts.jsonl", attempt)
                raise
            except Exception as exc:
                attempt["result"] = f"error: {type(exc).__name__}: {exc}"
                log.error("directory_error", name=name, error=str(exc))
            finally:
                append_jsonl(cfg.data_dir / "directory_attempts.jsonl", attempt)

        context.close()
        browser.close()

    log.action("directory_run_done", attempted=len(entries), submitted=submitted)
    return {"attempted": len(entries), "submitted": submitted, "skipped": 0}


def _value_for(logical: str, cfg: Config, profile: dict) -> str:
    product = cfg.outreach.product_name or "Breaklytix"
    values = {
        "name": product,
        "product_name": product,
        "url": cfg.site_url,
        "website": cfg.site_url,
        "tagline": (profile.get("title") or "").split("—")[0].strip()[:80],
        "description": (profile.get("description") or "")[:500],
        "long_description": (profile.get("description") or "")[:1500],
        "email": cfg.outreach_email,
        "category": "Developer Tools",
        "twitter": "",
    }
    return values.get(logical, "")


def report_attempts(cfg: Config) -> list[dict]:
    path = Path(cfg.data_dir / "directory_attempts.jsonl")
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows
