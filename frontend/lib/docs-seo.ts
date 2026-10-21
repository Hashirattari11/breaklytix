/**
 * Per-article search metadata for /docs/[slug].
 *
 * `docs.ts` stays the single source of truth for *content*; this file exists so
 * the search title and meta description can be tuned independently of the
 * on-page H1. Before this, every article inherited `doc.title` (often 20–30
 * characters once the `· Breaklytix` template was applied) and `doc.summary`
 * (often 60–70 characters), so 34 of 42 sitemap URLs had a title under the
 * ~30-character floor and a description under the ~70-character floor.
 *
 * Rules followed here:
 *  - `title` is the text BEFORE the root template appends " · Breaklytix", so
 *    every final title lands in the 43–60 character window.
 *  - `description` is 130–155 characters and mentions the concrete feature, so
 *    it stays unique across the site and survives Google's ~155-char cut.
 *  - `updated` is the date the article's text or metadata last changed. The
 *    sitemap reads it instead of stamping `new Date()` on every build.
 */

export type DocSeo = {
  /** Title fragment; the root layout appends " · Breaklytix". */
  title: string;
  /** Meta description, 130–155 characters. */
  description: string;
  /** ISO date (YYYY-MM-DD) of the last real edit. */
  updated: string;
};

const UPDATED = "2026-10-21";

export const DOC_SEO: Record<string, DocSeo> = {
  // ── Getting Started ──────────────────────────────────────────────────────
  overview: {
    title: "What Is Breaklytix? API Change Monitoring",
    description:
      "Breaklytix watches third-party API changelogs, detects breaking changes, and shows exactly which files in your GitHub repositories are affected.",
    updated: UPDATED,
  },
  quickstart: {
    title: "Quickstart: Connect GitHub in 5 Minutes",
    description:
      "Step-by-step quickstart: sign in with GitHub, install the app on a repository, run your first API usage scan, and receive your first change alert.",
    updated: UPDATED,
  },
  "breaking-api-changes": {
    title: "What Counts as a Breaking API Change?",
    description:
      "The six categories of change that break API integrations, how major providers ship them, and how to detect breaking changes before they reach production.",
    updated: UPDATED,
  },

  // ── Authentication & GitHub ──────────────────────────────────────────────
  "sign-in": {
    title: "Sign In with GitHub OAuth, No Passwords",
    description:
      "Breaklytix authenticates with GitHub OAuth. No passwords are stored, tokens are encrypted at rest, and you can revoke access from GitHub at any time.",
    updated: UPDATED,
  },
  "github-connection": {
    title: "Connect and Disconnect GitHub Repositories",
    description:
      "How to install the Breaklytix GitHub App, choose which repositories to scan, and remove access later. Scanning uses read-only permission by default.",
    updated: UPDATED,
  },
  "repository-scanner": {
    title: "Repository Scanner: Find Every API in Your Code",
    description:
      "Static analysis maps the third-party APIs, SDKs, environment variables and endpoints your repositories use, then watches those providers for changes.",
    updated: UPDATED,
  },

  // ── Provider Monitoring ──────────────────────────────────────────────────
  providers: {
    title: "Monitored API Providers and Changelogs",
    description:
      "The 44 API providers Breaklytix tracks, including Stripe, OpenAI, Slack, Twilio, AWS and Supabase, plus how monitoring coverage is decided.",
    updated: UPDATED,
  },
  changelog: {
    title: "How Provider Changelogs Become Breaking Alerts",
    description:
      "How Breaklytix collects provider changelogs and release notes daily, classifies breaking changes, and turns matched entries into actionable alerts.",
    updated: UPDATED,
  },

  // ── Runtime Intelligence ─────────────────────────────────────────────────
  "runtime-intelligence": {
    title: "Runtime Intelligence: Live API Health Signals",
    description:
      "Health scores, error rates, incidents and rate-limit events for every provider you depend on, collected from real telemetry rather than estimated.",
    updated: UPDATED,
  },
  "api-errors": {
    title: "API Errors and Failure Rates per Provider",
    description:
      "See elevated error rates and failed calls on the third-party APIs your app uses, with per-provider trends so a bad integration surfaces early.",
    updated: UPDATED,
  },
  "provider-incidents": {
    title: "Provider Incidents and Status Page Monitoring",
    description:
      "Official status-page incidents for every monitored provider, normalised into one timeline so you know whether an outage is yours or theirs.",
    updated: UPDATED,
  },
  "rate-limit-events": {
    title: "Rate Limit Events and Quota Monitoring",
    description:
      "Track when your integration approaches or exceeds a provider's API rate limits, and get warned before throttling turns into production errors.",
    updated: UPDATED,
  },

  // ── Code Break Detection ─────────────────────────────────────────────────
  "code-breaks": {
    title: "Code Break Detection: Which Files Are Affected",
    description:
      "When a provider ships a breaking change, static analysis pinpoints the exact repositories, files and lines that call the affected endpoint.",
    updated: UPDATED,
  },
  "deprecated-apis": {
    title: "Deprecated API Detection and Migration Tracking",
    description:
      "Find the deprecated API versions and endpoints still used in your code, so you can migrate before a provider removes support and calls fail.",
    updated: UPDATED,
  },
  "auto-fix-prs": {
    title: "Auto-fix PRs for Unambiguous API Changes",
    description:
      "For mechanical breaking changes, Breaklytix opens a GitHub pull request with the fix applied and ready for review. Nothing is merged without approval.",
    updated: UPDATED,
  },

  // ── Impact Engine ────────────────────────────────────────────────────────
  "impact-overview": {
    title: "Impact Engine: Blast Radius Before It Ships",
    description:
      "The Impact Engine scores what a breaking provider change means for your repositories, affected files, call sites and services before it reaches production.",
    updated: UPDATED,
  },
  "fire-drill": {
    title: "API Fire Drill: Simulate a Breaking Change",
    description:
      "Run a safe fire drill on a synthetic breaking change to see how your team, alerts and runbooks respond, without waiting for a real incident.",
    updated: UPDATED,
  },
  "deploy-day": {
    title: "Deploy Day Checklist for Breaking API Changes",
    description:
      "A step-by-step checklist for the day a provider ships a breaking change: triage, impact review, staged fix, verification and post-deploy monitoring.",
    updated: UPDATED,
  },

  // ── Alerts & Notifications ───────────────────────────────────────────────
  alerts: {
    title: "Alert Lifecycle: Created, Matched, Resolved",
    description:
      "How Breaklytix alerts move from created to matched, resolved or ignored, and why an unmatched alert does not mean a change is safe for your code.",
    updated: UPDATED,
  },
  notifications: {
    title: "Notification Preferences and Alert Triggers",
    description:
      "Choose which events email you: breaking changes, code breaks, provider errors, incidents or the daily digest, and which stay in the dashboard only.",
    updated: UPDATED,
  },
  "email-alerts": {
    title: "Email Alert Delivery Status Explained",
    description:
      "How alert emails are sent, what 'accepted by provider' really means, and how to diagnose a digest that never arrived in your inbox.",
    updated: UPDATED,
  },

  // ── Agency Mode ──────────────────────────────────────────────────────────
  "agency-mode": {
    title: "Agency Mode for Client Repositories",
    description:
      "Run Breaklytix as an agency: install your own GitHub App, manage client repositories from one dashboard, and send invites with tracked email status.",
    updated: UPDATED,
  },
  "agency-invites": {
    title: "Client Invites and Email Delivery Status",
    description:
      "Invite agency clients, resend a pending invite, and read honest email delivery status instead of assuming the message arrived.",
    updated: UPDATED,
  },

  // ── CLI & Integrations ───────────────────────────────────────────────────
  cli: {
    title: "Developer CLI: Scan Repos from the Terminal",
    description:
      "Install the Breaklytix CLI, authenticate with an API key, and run repository scans and result queries without leaving your terminal.",
    updated: UPDATED,
  },
  "slack-integration": {
    title: "Slack Integration for API Change Alerts",
    description:
      "Mirror Breaklytix alerts into a Slack channel so the on-call engineer sees a breaking provider change where the team already works.",
    updated: UPDATED,
  },

  // ── Settings & Security ──────────────────────────────────────────────────
  settings: {
    title: "Settings: Profile, GitHub, Billing and More",
    description:
      "Where each account setting lives: profile, GitHub connection, theme, notification preferences, email, API keys, billing and the danger zone.",
    updated: UPDATED,
  },
  theme: {
    title: "Light, Dark and System Theme Without Flash",
    description:
      "Pick light, dark or follow-system appearance. The choice is stored on your device and applied before first paint so pages never flash white.",
    updated: UPDATED,
  },
  "api-keys": {
    title: "API Keys for the CLI and Your Scripts",
    description:
      "Create, name and revoke API keys for programmatic access to your Breaklytix data. Keys are scoped to your account and shown once at creation.",
    updated: UPDATED,
  },
  "security-model": {
    title: "Security Model: Encryption and Data Scope",
    description:
      "How Breaklytix scopes GitHub permissions, encrypts tokens at rest and isolates tenant data, and why it never stores your provider secret values.",
    updated: UPDATED,
  },

  // ── Billing & Plans ──────────────────────────────────────────────────────
  billing: {
    title: "Plans, Monitored API Limits and Billing",
    description:
      "How Breaklytix plans work: trial limits, monitored-API counts, the Growth plan, renewal dates, and where to review your current usage.",
    updated: UPDATED,
  },

  // ── Troubleshooting & FAQ ────────────────────────────────────────────────
  troubleshooting: {
    title: "Troubleshooting Common Breaklytix Issues",
    description:
      "Fixes for the most common issues: a repository that will not appear, missing alerts, a scan that returns nothing, and an email digest that never arrives.",
    updated: UPDATED,
  },
  faq: {
    title: "Breaklytix FAQ: Secrets, Private Repos and PRs",
    description:
      "Answers about code access, secret handling, auto-merged pull requests, private repositories, alert timing, and disconnecting GitHub at any time.",
    updated: UPDATED,
  },
};
