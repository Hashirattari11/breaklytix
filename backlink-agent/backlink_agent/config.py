"""Config loading + validation.

Design rule: a placeholder is never silently treated as a real value. Anything
that is still a FILL token produces a warning and switches the dependent
feature off, instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


import yaml

from .util import is_fill


class ConfigError(RuntimeError):
    pass


@dataclass
class Politeness:
    user_agent: str = "BreaklytixBacklinkAgent/1.0 (+https://breaklytix.site)"
    delay_seconds: float = 2.0
    timeout_seconds: float = 20.0
    max_pages_per_domain: int = 6
    retries: int = 2
    cache_ttl_hours: int = 168


@dataclass
class ScoringCfg:
    drop_below: int = 50
    max_external_links: int = 120
    thin_content_words: int = 300


@dataclass
class SearchCfg:
    provider: str = "none"
    max_queries_per_run: int = 25
    results_per_query: int = 10
    api_key_env: str = "SERPER_API_KEY"


@dataclass
class OutreachCfg:
    sender_name: str = ""
    product_name: str = ""
    followup_after_days: int = 4
    from_email: str = ""


@dataclass
class Config:
    root: Path
    my_domain: str
    niche: str
    target_countries: list[str] = field(default_factory=list)
    competitor_domains: list[str] = field(default_factory=list)
    outreach_email: str = ""
    daily_send_limit: int = 25
    auto_send: bool = False
    politeness: Politeness = field(default_factory=Politeness)
    scoring: ScoringCfg = field(default_factory=ScoringCfg)
    search: SearchCfg = field(default_factory=SearchCfg)
    outreach: OutreachCfg = field(default_factory=OutreachCfg)
    warnings: list[str] = field(default_factory=list)

    # ---- derived paths -----------------------------------------------------
    @property
    def data_dir(self) -> Path:
        return self.root / "data"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def log_dir(self) -> Path:
        return self.root / "logs"

    @property
    def draft_dir(self) -> Path:
        return self.data_dir / "drafts"

    @property
    def report_dir(self) -> Path:
        return self.data_dir / "reports"

    @property
    def profile_path(self) -> Path:
        return self.data_dir / "site_profile.json"

    @property
    def keywords_path(self) -> Path:
        return self.data_dir / "keywords.json"

    @property
    def prospects_path(self) -> Path:
        return self.data_dir / "prospects.csv"

    @property
    def site_url(self) -> str:
        return f"https://{self.my_domain}"

    def ensure_dirs(self) -> None:
        for path in (self.data_dir, self.cache_dir, self.log_dir, self.draft_dir, self.report_dir):
            path.mkdir(parents=True, exist_ok=True)

    # ---- capability flags --------------------------------------------------
    @property
    def has_competitors(self) -> bool:
        return not is_fill(self.competitor_domains)

    @property
    def has_outreach_email(self) -> bool:
        return not is_fill(self.outreach_email)


def _section(raw: dict, key: str) -> dict:
    value = raw.get(key) or {}
    if not isinstance(value, dict):
        raise ConfigError(f"config.{key} must be a mapping")
    return value


def load_config(path: str | Path) -> Config:
    path = Path(path).resolve()
    if not path.exists():
        raise ConfigError(f"Config file not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ConfigError("config.yaml must contain a mapping at the top level")

    my_domain = str(raw.get("my_domain") or "").strip().lower()
    if is_fill(my_domain):
        raise ConfigError("config.my_domain is required")

    daily = raw.get("daily_send_limit", 25)
    try:
        daily_int = int(daily)
    except (TypeError, ValueError):
        raise ConfigError("config.daily_send_limit must be an integer") from None
    if not 1 <= daily_int <= 200:
        raise ConfigError("config.daily_send_limit must be between 1 and 200")

    pol = _section(raw, "politeness")
    sc = _section(raw, "scoring")
    se = _section(raw, "search")
    out = _section(raw, "outreach")

    cfg = Config(
        root=path.parent,
        my_domain=my_domain,
        niche=str(raw.get("niche") or "").strip(),
        target_countries=[str(c).strip() for c in (raw.get("target_countries") or []) if str(c).strip()],
        competitor_domains=[str(c).strip().lower() for c in (raw.get("competitor_domains") or []) if str(c).strip()],
        outreach_email=str(raw.get("outreach_email") or "").strip(),
        daily_send_limit=daily_int,
        auto_send=bool(raw.get("AUTO_SEND", False)),
        politeness=Politeness(
            user_agent=str(pol.get("user_agent", Politeness.user_agent)),
            delay_seconds=float(pol.get("delay_seconds", 2.0)),
            timeout_seconds=float(pol.get("timeout_seconds", 20)),
            max_pages_per_domain=int(pol.get("max_pages_per_domain", 6)),
            retries=int(pol.get("retries", 2)),
            cache_ttl_hours=int(pol.get("cache_ttl_hours", 168)),
        ),
        scoring=ScoringCfg(
            drop_below=int(sc.get("drop_below", 50)),
            max_external_links=int(sc.get("max_external_links", 120)),
            thin_content_words=int(sc.get("thin_content_words", 300)),
        ),
        search=SearchCfg(
            provider=str(se.get("provider", "none")).strip().lower(),
            max_queries_per_run=int(se.get("max_queries_per_run", 25)),
            results_per_query=int(se.get("results_per_query", 10)),
            api_key_env=str(se.get("api_key_env", "SERPER_API_KEY")),
        ),
        outreach=OutreachCfg(
            sender_name=str(out.get("sender_name", "")).strip(),
            product_name=str(out.get("product_name", "")).strip(),
            followup_after_days=int(out.get("followup_after_days", 4)),
            from_email=str(raw.get("outreach_email") or "").strip(),
        ),
    )

    if is_fill(cfg.niche):
        cfg.warnings.append("niche is empty - keyword generation will use the crawled site profile only")
    if not cfg.target_countries:
        cfg.warnings.append("target_countries is empty - country relevance is not scored")
    if not cfg.has_competitors:
        cfg.warnings.append(
            "competitor_domains is empty - competitor_gap.py will be skipped "
            "(add 3-5 real competitors to enable it)"
        )
    if not cfg.has_outreach_email:
        cfg.warnings.append("outreach_email is empty - outreach drafts cannot be addressed")
    if cfg.search.provider not in {"none", "serper", "brave"}:
        raise ConfigError("search.provider must be one of: none, serper, brave")
    if cfg.search.provider == "none":
        cfg.warnings.append(
            "search.provider is none - prospecting uses data/seeds.txt, CSV imports and competitor gap only"
        )

    cfg.ensure_dirs()
    return cfg
