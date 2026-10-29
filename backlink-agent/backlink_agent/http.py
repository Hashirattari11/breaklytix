"""Polite HTTP layer.

Every outbound request in this project goes through PoliteFetcher so that four
rules cannot be forgotten in one module:

1. robots.txt is consulted before the request.
2. Requests to the same host are spaced by at least `delay_seconds`.
3. Responses are cached on disk, so a second run does not re-hammer anyone.
4. Every request is logged (url, status, ms) to the audit log.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.robotparser as robotparser
from dataclasses import dataclass
from pathlib import Path

from urllib.parse import urljoin, urlsplit

import requests

from .config import Config
from .log import Log
from .util import now_utc, parse_iso


@dataclass
class Fetch:
    url: str
    final_url: str
    status: int | None
    html: str
    headers: dict[str, str]
    error: str | None = None
    from_cache: bool = False
    robots_blocked: bool = False

    @property
    def ok(self) -> bool:
        return self.status is not None and 200 <= self.status < 300 and not self.error


class RobotsCache:
    """Per-host robots.txt, fetched once, failing open but logged."""

    def __init__(self, cfg: Config, log: Log) -> None:
        self.cfg = cfg
        self.log = log
        self._parsers: dict[str, robotparser.RobotFileParser | None] = {}

    def _parser(self, scheme: str, host: str) -> robotparser.RobotFileParser | None:
        if host in self._parsers:
            return self._parsers[host]
        parser = robotparser.RobotFileParser()
        robots_url = f"{scheme}://{host}/robots.txt"
        try:
            resp = requests.get(
                robots_url,
                headers={"User-Agent": self.cfg.politeness.user_agent},
                timeout=self.cfg.politeness.timeout_seconds,
            )
            if resp.status_code == 200 and resp.text.strip():
                parser.parse(resp.text.splitlines())
            elif resp.status_code in (401, 403):
                # Explicit refusal: treat the whole host as off limits.
                parser.parse(["User-agent: *", "Disallow: /"])
                self.log.warn("robots_denied", host=host, status=resp.status_code)
            else:
                parser.parse(["User-agent: *", "Allow: /"])
            delay = parser.crawl_delay(self.cfg.politeness.user_agent)
            if delay:
                self.log.info("robots_crawl_delay", host=host, seconds=delay)
        except requests.RequestException as exc:
            # Unreachable robots.txt is common; standard practice is to proceed.
            parser.parse(["User-agent: *", "Allow: /"])
            self.log.warn("robots_unreachable", host=host, error=str(exc))
        self._parsers[host] = parser
        return parser

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        if not parts.scheme or not parts.hostname:
            return False
        parser = self._parser(parts.scheme, parts.netloc)
        if parser is None:
            return True
        return parser.can_fetch(self.cfg.politeness.user_agent, url)

    def delay_for(self, url: str) -> float:
        """robots.txt Crawl-delay, or 0 when the host does not ask for one."""
        parts = urlsplit(url)
        if not parts.scheme or not parts.hostname:
            return 0.0
        parser = self._parser(parts.scheme, parts.netloc)
        if parser is None:
            return 0.0
        try:
            return float(parser.crawl_delay(self.cfg.politeness.user_agent) or 0)
        except (TypeError, ValueError):
            return 0.0


class PoliteFetcher:
    def __init__(self, cfg: Config, log: Log, page_budget: int | None = None) -> None:
        self.cfg = cfg
        self.log = log
        self.robots = RobotsCache(cfg, log)
        self._last_request: dict[str, float] = {}
        self._page_count: dict[str, int] = {}
        # Own-site crawling needs a bigger budget than a stranger's site.
        self.page_budget = page_budget or cfg.politeness.max_pages_per_domain
        self._session = requests.Session()
        self._session.headers.update(
            {
                "User-Agent": cfg.politeness.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )

    # -- cache ---------------------------------------------------------------
    def _cache_paths(self, url: str) -> tuple[Path, Path]:
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
        return (
            self.cfg.cache_dir / f"{key}.json",
            self.cfg.cache_dir / f"{key}.html",
        )

    def _read_cache(self, url: str) -> Fetch | None:
        meta_path, body_path = self._cache_paths(url)
        if not meta_path.exists() or not body_path.exists():
            return None
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        fetched = parse_iso(meta.get("fetched_at"))
        if not fetched:
            return None
        age_h = (now_utc() - fetched).total_seconds() / 3600
        if age_h > self.cfg.politeness.cache_ttl_hours:
            return None
        return Fetch(
            url=url,
            final_url=meta.get("final_url", url),
            status=meta.get("status"),
            html=body_path.read_text(encoding="utf-8", errors="replace"),
            headers=meta.get("headers", {}),
            from_cache=True,
        )

    def _write_cache(self, fetch: Fetch) -> None:
        meta_path, body_path = self._cache_paths(fetch.url)
        body_path.write_text(fetch.html, encoding="utf-8")
        meta_path.write_text(
            json.dumps(
                {
                    "url": fetch.url,
                    "final_url": fetch.final_url,
                    "status": fetch.status,
                    "headers": fetch.headers,
                    "fetched_at": now_utc().replace(microsecond=0).isoformat(),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    # -- rate limiting -------------------------------------------------------
    def _wait_turn(self, url: str) -> None:
        host = urlsplit(url).netloc
        # Honour a host's robots.txt Crawl-delay when it is slower than ours.
        delay = max(self.cfg.politeness.delay_seconds, self.robots.delay_for(url))
        last = self._last_request.get(host)
        if last is not None:
            elapsed = time.monotonic() - last
            remaining = delay - elapsed
            if remaining > 0:
                time.sleep(remaining)
        self._last_request[host] = time.monotonic()

    # -- public --------------------------------------------------------------
    def get(
        self,
        url: str,
        *,
        use_cache: bool = True,
        allow_redirects: bool = True,
        headers: dict[str, str] | None = None,
    ) -> Fetch:
        if use_cache:
            cached = self._read_cache(url)
            if cached is not None:
                self.log.info("cache_hit", url=url)
                return cached

        if not self.robots.allowed(url):
            self.log.warn("robots_blocked", url=url)
            return Fetch(url=url, final_url=url, status=None, html="", headers={}, robots_blocked=True)

        host = urlsplit(url).netloc
        count = self._page_count.get(host, 0)
        if count >= self.page_budget:
            self.log.warn("domain_page_cap", host=host, cap=self.page_budget)
            return Fetch(url=url, final_url=url, status=None, html="", headers={}, error="page cap reached")
        self._page_count[host] = count + 1

        last_error: str | None = None
        for attempt in range(self.cfg.politeness.retries + 1):
            self._wait_turn(url)
            started = time.monotonic()
            try:
                resp = self._session.get(
                    url,
                    timeout=self.cfg.politeness.timeout_seconds,
                    allow_redirects=allow_redirects,
                    headers=headers,
                )
                elapsed_ms = int((time.monotonic() - started) * 1000)
                ctype = resp.headers.get("content-type", "")
                html = resp.text if "html" in ctype or "xml" in ctype or not ctype else ""
                fetch = Fetch(
                    url=url,
                    final_url=str(resp.url),
                    status=resp.status_code,
                    html=html,
                    headers={k.lower(): v for k, v in resp.headers.items()},
                )
                self.log.action(
                    "fetch", url=url, status=resp.status_code, ms=elapsed_ms, bytes=len(html), final=fetch.final_url
                )
                if fetch.ok and html:
                    self._write_cache(fetch)
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < self.cfg.politeness.retries:
                    backoff = 5 * (attempt + 1)
                    self.log.warn("backoff", url=url, status=resp.status_code, sleep=backoff)
                    time.sleep(backoff)
                    continue
                return fetch
            except requests.RequestException as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                self.log.warn("fetch_error", url=url, attempt=attempt, error=last_error)
                if attempt < self.cfg.politeness.retries:
                    time.sleep(2 * (attempt + 1))

        return Fetch(url=url, final_url=url, status=None, html="", headers={}, error=last_error)

    def head(self, url: str) -> int | None:
        if not self.robots.allowed(url):
            return None
        self._wait_turn(url)
        try:
            resp = self._session.head(
                url, timeout=self.cfg.politeness.timeout_seconds, allow_redirects=True
            )
            if resp.status_code == 405:  # some servers reject HEAD; fall back
                resp = self._session.get(
                    url, timeout=self.cfg.politeness.timeout_seconds, allow_redirects=True, stream=True
                )
            self.log.info("head", url=url, status=resp.status_code)
            return resp.status_code
        except requests.RequestException as exc:
            self.log.warn("head_error", url=url, error=str(exc))
            return None

    def absolute(self, base: str, href: str) -> str:
        return urljoin(base, href)
