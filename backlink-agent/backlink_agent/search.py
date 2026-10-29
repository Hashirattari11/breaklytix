"""Search providers.

Deliberately not default. Scraping Google or DuckDuckGo result pages breaks
their terms, so the only built-in providers are paid APIs you opt into.
With provider=none the agent still works from seeds, CSV exports and the
competitor gap - it just does not discover brand-new pages on its own.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import requests

from .config import Config
from .log import Log


@dataclass
class Result:
    url: str
    title: str
    snippet: str
    query: str


class NoSearch:
    name = "none"
    available = False

    def __init__(self, cfg: Config, log: Log) -> None:
        self.cfg = cfg
        self.log = log

    def search(self, query: str) -> list[Result]:
        return []


class SerperSearch:
    """serper.dev - Google results via API. Requires SERPER_API_KEY."""

    name = "serper"
    endpoint = "https://google.serper.dev/search"

    def __init__(self, cfg: Config, log: Log, key: str) -> None:
        self.cfg = cfg
        self.log = log
        self.key = key
        self.available = True

    def search(self, query: str) -> list[Result]:
        try:
            resp = requests.post(
                self.endpoint,
                headers={"X-API-KEY": self.key, "Content-Type": "application/json"},
                json={"q": query, "num": self.cfg.search.results_per_query},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            self.log.warn("search_failed", provider=self.name, query=query, error=str(exc))
            return []
        self.log.action("search", provider=self.name, query=query, results=len(data.get("organic", [])))
        return [
            Result(
                url=item.get("link", ""),
                title=item.get("title", ""),
                snippet=item.get("snippet", ""),
                query=query,
            )
            for item in data.get("organic", [])
            if item.get("link")
        ]


class BraveSearch:
    """Brave Search API. Requires BRAVE_API_KEY."""

    name = "brave"
    endpoint = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, cfg: Config, log: Log, key: str) -> None:
        self.cfg = cfg
        self.log = log
        self.key = key
        self.available = True

    def search(self, query: str) -> list[Result]:
        try:
            resp = requests.get(
                self.endpoint,
                headers={"X-Subscription-Token": self.key, "Accept": "application/json"},
                params={"q": query, "count": self.cfg.search.results_per_query},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            self.log.warn("search_failed", provider=self.name, query=query, error=str(exc))
            return []
        items = (data.get("web") or {}).get("results") or []
        self.log.action("search", provider=self.name, query=query, results=len(items))
        return [
            Result(url=i.get("url", ""), title=i.get("title", ""), snippet=i.get("description", ""), query=query)
            for i in items
            if i.get("url")
        ]


class IncompleteSearch(NoSearch):
    """Provider configured but its API key is missing - fail visibly."""

    def __init__(self, cfg: Config, log: Log, name: str, env: str) -> None:
        super().__init__(cfg, log)
        self.name = name
        log.warn("search_key_missing", provider=name, env=env, note="falling back to seeds/CSV only")


def get_provider(cfg: Config, log: Log):
    provider = cfg.search.provider
    if provider == "serper":
        key = os.environ.get(cfg.search.api_key_env) or os.environ.get("SERPER_API_KEY", "")
        if key:
            return SerperSearch(cfg, log, key)
        return IncompleteSearch(cfg, log, "serper", cfg.search.api_key_env or "SERPER_API_KEY")
    if provider == "brave":
        key = os.environ.get("BRAVE_API_KEY", "")
        if key:
            return BraveSearch(cfg, log, key)
        return IncompleteSearch(cfg, log, "brave", "BRAVE_API_KEY")
    return NoSearch(cfg, log)
