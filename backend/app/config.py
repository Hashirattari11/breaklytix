"""Application configuration, loaded from environment variables.

All secrets come from the environment (Render dashboard / local .env). Nothing
sensitive is hard-coded. See backend/.env.example for the full list.
"""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Supabase (server-side; uses the service-role key) -----------------
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # ---- Crypto ------------------------------------------------------------
    # Fernet key used to encrypt GitHub tokens at rest. Generate with:
    #   python -m app.scripts_generate_key   (or backend/scripts/generate_key.py)
    token_encryption_key: str = Field(default="", alias="TOKEN_ENCRYPTION_KEY")
    # Secret used to sign our own short-lived session JWTs for the frontend.
    jwt_secret: str = Field(default="", alias="JWT_SECRET")
    jwt_ttl_hours: int = Field(default=720, alias="JWT_TTL_HOURS")  # 30 days

    # ---- Admin authorization ----------------------------------------------
    # Comma-separated user UUIDs that always receive admin rights, checked in
    # addition to `users.is_admin`. This is the ONLY privileged bootstrap:
    # no default account, no hard-coded UUID in the source, and no silent
    # promotion of ordinary users. Leave empty to rely solely on the database
    # flag (set it with: UPDATE users SET is_admin = true WHERE email = '...').
    admin_user_ids: str = Field(default="", alias="ADMIN_USER_IDS")

    # ---- GitHub OAuth App --------------------------------------------------
    github_client_id: str = Field(default="", alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(default="", alias="GITHUB_CLIENT_SECRET")
    # Reserved for a future GitHub app-install webhook (repo Settings -> Webhooks).
    # NOTE: there is currently NO webhooks router registered in app/main.py — the
    # PR-status flow is driven by /internal endpoints + the GitHub REST API, not
    # by a webhook. Keep this secret unset in production.
    github_webhook_secret: str = Field(default="", alias="GITHUB_WEBHOOK_SECRET")

    # ---- GitHub App (agency mode client installs) --------------------------
    github_app_id: str = Field(default="", alias="GITHUB_APP_ID")
    github_app_private_key: str = Field(default="", alias="GITHUB_APP_PRIVATE_KEY")
    github_app_slug: str = Field(default="", alias="GITHUB_APP_SLUG")

    # ---- Internal endpoints (called by the GitHub Actions cron) ------------
    internal_secret: str = Field(default="", alias="INTERNAL_SECRET")

    @property
    def cron_secret(self) -> str:
        """Secret used to validate Vercel Cron requests.

        Vercel Cron sends an `x-internal-secret` header populated from the
        platform's CRON_SECRET env var. Prefer CRON_SECRET when present so the
        cron can authenticate; fall back to INTERNAL_SECRET otherwise.
        """
        return os.getenv("CRON_SECRET") or self.internal_secret

    # ---- Slack Integration (Phase 5 §2) -------------------------------------
    slack_client_id: str = Field(default="", alias="SLACK_CLIENT_ID")
    slack_client_secret: str = Field(default="", alias="SLACK_CLIENT_SECRET")
    slack_signing_secret: str = Field(default="", alias="SLACK_SIGNING_SECRET")
    slack_bot_scopes: str = Field(
        default="chat:write,incoming-webhook,channels:read,channels:manage",
        alias="SLACK_BOT_SCOPES",
    )

    # ---- Email (transactional sending) ------------------------------------
    # Active transport: "brevo" (default) or "resend". The Breaklytix domain is
    # verified in Brevo, so production sends go through Brevo first; Resend
    # stays available as a fallback via EMAIL_PROVIDER=resend.
    email_provider: str = Field(default="brevo", alias="EMAIL_PROVIDER")
    brevo_api_key: str = Field(default="", alias="BREVO_API_KEY")
    brevo_from_email: str = Field(
        default="Breaklytix <noreply@breaklytix.site>",
        alias="BREVO_FROM_EMAIL",
    )
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    resend_from_email: str = Field(
        default="Breaklytix <noreply@breaklytix.site>",
        alias="RESEND_FROM_EMAIL",
        # Verified in Resend (2026-10-01). Fallback default so emails always
        # send from the owned domain once DNS is consistent; override via env
        # only if you must use a different sender.
    )

    # ---- Stripe Billing (Phase 3) ------------------------------------------
    stripe_secret_key: str = Field(default="", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="", alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_starter: str = Field(default="", alias="STRIPE_PRICE_STARTER")      # $500/mo
    stripe_price_growth: str = Field(default="", alias="STRIPE_PRICE_GROWTH")        # $2,000/mo
    stripe_price_enterprise: str = Field(default="", alias="STRIPE_PRICE_ENTERPRISE") # $10,000/mo

    # ---- Scraper (Phase B: all 12 monitored providers) --------------------
    stripe_changelog_url: str = Field(
        default="https://docs.stripe.com/changelog", alias="STRIPE_CHANGELOG_URL"
    )
    shopify_changelog_url: str = Field(
        default="https://shopify.dev/changelog", alias="SHOPIFY_CHANGELOG_URL"
    )
    twilio_changelog_url: str = Field(
        default="https://www.twilio.com/en-us/changelog", alias="TWILIO_CHANGELOG_URL"
    )
    sendgrid_changelog_url: str = Field(
        default="https://docs.sendgrid.com/for-developers/changelog", alias="SENDGRID_CHANGELOG_URL"
    )
    github_changelog_url: str = Field(
        default="https://github.blog/changelog/", alias="GITHUB_CHANGELOG_URL"
    )
    openai_changelog_url: str = Field(
        default="https://platform.openai.com/docs/changelog", alias="OPENAI_CHANGELOG_URL"
    )
    anthropic_changelog_url: str = Field(
        default="https://docs.anthropic.com/en/docs/about-claude/changelog", alias="ANTHROPIC_CHANGELOG_URL"
    )
    vercel_changelog_url: str = Field(
        default="https://vercel.com/changelog", alias="VERCEL_CHANGELOG_URL"
    )
    supabase_changelog_url: str = Field(
        default="https://supabase.com/changelog", alias="SUPABASE_CHANGELOG_URL"
    )
    firebase_changelog_url: str = Field(
        default="https://firebase.google.com/support/releases", alias="FIREBASE_CHANGELOG_URL"
    )
    slack_changelog_url: str = Field(
        default="https://api.slack.com/changelog", alias="SLACK_CHANGELOG_URL"
    )
    resend_changelog_url: str = Field(
        default="https://resend.com/changelog", alias="RESEND_CHANGELOG_URL"
    )
    scraper_user_agent: str = Field(
        default="AutoFixAPI-ChangelogMonitor/1.0 (+https://github.com/; polite daily scan)",
        alias="SCRAPER_USER_AGENT",
    )

    # ---- Auto-fix / PR engine (Phase 2) ------------------------------------
    # When true, POST /internal/fixes/generate opens a PR for every generated
    # fix (all curated rules, per the product decision). PRs ALWAYS require a
    # manual merge — this only controls automatic PR *creation*. Set false to
    # route every fix to 'needs_review' for manual triggering from the dashboard.
    auto_create_pr: bool = Field(default=True, alias="AUTO_CREATE_PR")
    # Branch-name prefix for auto-fix PRs, e.g. autofix/stripe-<rule>-<shortid>.
    fixes_branch_prefix: str = Field(default="autofix", alias="FIXES_BRANCH_PREFIX")

    # ---- Alerting behavior -------------------------------------------------
    # If a changelog event yields no extractable Stripe object tokens, should we
    # alert every repo that uses Stripe? Default False (avoid noise). When True,
    # unmatched breaking changes fan out to all Stripe users.
    alert_on_unmatched: bool = Field(default=False, alias="ALERT_ON_UNMATCHED")

    # ---- CORS --------------------------------------------------------------
    # Comma-separated list of allowed frontend origins.
    frontend_origins: str = Field(
        default=(
            "http://localhost:3000,http://localhost:3001,"
            "https://breaklytix.site,https://www.breaklytix.site,"
            "https://frontend-eight-phi-60.vercel.app,"
            "https://frontend-*.vercel.app"
        ),
        alias="FRONTEND_ORIGINS",
    )
    # Base URL of the frontend app. Used for links in emails (invites, welcome,
    # alerts) and OAuth redirects. Production is the canonical public domain.
    frontend_base_url: str = Field(
        default="https://breaklytix.site", alias="FRONTEND_BASE_URL"
    )

    # ---- Scan limits (keep us well within free-tier + rate limits) --------
    max_files_scanned: int = Field(default=1500, alias="MAX_FILES_SCANNED")
    max_file_bytes: int = Field(default=400_000, alias="MAX_FILE_BYTES")

    # ---- CLI local-scan sandbox --------------------------------------------
    # Root directory that POST /cli/local-scan may read from. Empty => a
    # dedicated temp dir is used. Paths outside this root are rejected.
    cli_scan_root: str = Field(default="", alias="CLI_SCAN_ROOT")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]

    @property
    def admin_user_id_set(self) -> set[str]:
        """Explicit admin allowlist from ADMIN_USER_IDS (empty by default)."""
        return {v.strip() for v in self.admin_user_ids.split(",") if v.strip()}

    @property
    def changelog_sources(self) -> dict[str, str]:
        """Provider id -> official changelog URL for ALL monitored providers (44)."""
        # Local import keeps config free of app-module cycles at load time.
        from .changelog.sources import PROVIDER_SOURCES
        return {p.provider_id: p.changelog_url for p in PROVIDER_SOURCES}

    @property
    def plan_limits(self) -> dict[str, int]:
        """Plan name -> monitored API limit. -1 represents unlimited."""
        return {
            "trial": 10,
            "starter": 10,
            "growth": 50,
            "enterprise": -1,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
