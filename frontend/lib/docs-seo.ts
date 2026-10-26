/**
 * Per-article search metadata for /docs/[slug].
 *
 * `docs.ts` stays the single source of truth for *content*; this file exists so
 * the search title and meta description can be tuned independently of the
 * on-page H1. The docs set was consolidated to 18 substantial articles, so this
 * map contains exactly one entry per surviving slug — a retired slug here would
 * never render, and a missing slug would fall back to the shorter on-page title.
 *
 * Rules followed here:
 *  - `title` is the text BEFORE the root template appends " · Breaklytix", so
 *    every final title stays near the 43–60 character window.
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

const REWRITTEN = "2026-10-26";
const GUIDES = "2026-10-22";

export const DOC_SEO: Record<string, DocSeo> = {
  // ── Getting Started ──────────────────────────────────────────────────────
  overview: {
    title: "What Is Breaklytix? API Change Monitoring",
    description:
      "Breaklytix watches 44 third-party API changelogs, matches breaking changes to the APIs your GitHub repositories use, and names the files at risk.",
    updated: REWRITTEN,
  },
  quickstart: {
    title: "Quickstart: Connect GitHub in 5 Minutes",
    description:
      "Sign in with GitHub, connect a repository, run your first scan, choose alert categories, and understand the daily 06:00 UTC monitoring pipeline.",
    updated: REWRITTEN,
  },
  "breaking-api-changes": {
    title: "What Counts as a Breaking API Change?",
    description:
      "The six categories of change that break API integrations, how major providers ship them, and how to detect breaking changes before they reach production.",
    updated: REWRITTEN,
  },

  // ── Authentication & GitHub ──────────────────────────────────────────────
  "sign-in": {
    title: "Sign In with GitHub OAuth, No Passwords",
    description:
      "How GitHub OAuth works in Breaklytix: the repo scope, encrypted tokens, 30-day sessions, reconnect, sign-out, and revoking access on GitHub.",
    updated: REWRITTEN,
  },
  "repository-scanner": {
    title: "Repository Scanner: Find APIs in Your Code",
    description:
      "Static analysis maps the SDKs, endpoints and environment variables in your repositories, with file limits, scan cadence and honest blind spots explained.",
    updated: REWRITTEN,
  },

  // ── Provider Monitoring ──────────────────────────────────────────────────
  providers: {
    title: "How Provider Coverage and Detection Work",
    description:
      "The 44 APIs Breaklytix monitors, how coverage is chosen, and how a daily changelog fetch becomes a classified, deduplicated and matched alert.",
    updated: REWRITTEN,
  },

  // ── Runtime Intelligence ─────────────────────────────────────────────────
  "runtime-intelligence": {
    title: "Runtime Intelligence: Live API Health Signals",
    description:
      "Health scores, error and failure signals, provider incidents, rate-limit snapshots and anomalies for the APIs your repositories depend on.",
    updated: REWRITTEN,
  },

  // ── Code Break Detection ─────────────────────────────────────────────────
  "code-breaks": {
    title: "Code Break Detection: Which Files Are Affected",
    description:
      "How static analysis turns a provider change into a file-level finding, why deprecations still work, and when an auto-fix pull request is safe to propose.",
    updated: REWRITTEN,
  },

  // ── Impact Engine ────────────────────────────────────────────────────────
  "impact-overview": {
    title: "Impact Engine: Blast Radius Before It Ships",
    description:
      "Analyse the blast radius of a provider change, rehearse it with a fire drill, read verification status honestly, and work a deploy-day checklist.",
    updated: REWRITTEN,
  },

  // ── Alerts & Notifications ───────────────────────────────────────────────
  alerts: {
    title: "Alert Lifecycle, Email and Slack Delivery",
    description:
      "How alerts are created and resolved, which of the ten email categories fire, why delivery is capped, and how Slack mirrors alerts and fix approvals.",
    updated: REWRITTEN,
  },

  // ── Agency Mode ──────────────────────────────────────────────────────────
  "agency-mode": {
    title: "Agency Mode for Client Repositories",
    description:
      "Run Breaklytix for client repositories with your own GitHub App: seven-day single-use invites, scoped access, invite status and immediate revocation.",
    updated: REWRITTEN,
  },

  // ── CLI & Integrations ───────────────────────────────────────────────────
  cli: {
    title: "Developer CLI and Slack Integration",
    description:
      "Install the Breaklytix CLI from source, authenticate with an API key, scan local or connected repositories, and route alerts into a Slack channel.",
    updated: REWRITTEN,
  },

  // ── Settings & Security ──────────────────────────────────────────────────
  settings: {
    title: "Settings, Theme, API Keys and Security",
    description:
      "Account settings explained: GitHub connection, theme storage, API key creation and revocation, email testing, and the encryption and scoping model.",
    updated: REWRITTEN,
  },

  // ── Billing & Plans ──────────────────────────────────────────────────────
  billing: {
    title: "Plans, Trials and Billing Explained",
    description:
      "Starter $500 for 10 monitored APIs, Growth $2,000 for 50, Enterprise $10,000 unlimited, a 10-day unlimited trial, and how Stripe billing works.",
    updated: REWRITTEN,
  },

  // ── Troubleshooting & FAQ ────────────────────────────────────────────────
  troubleshooting: {
    title: "Troubleshooting Common Breaklytix Issues",
    description:
      "Fixes for sign-in errors, empty scans, missing email, alerts that stopped, billing states, Slack delivery and agency invites, plus direct product FAQs.",
    updated: REWRITTEN,
  },

  // ── Guides ───────────────────────────────────────────────────────────────
  "api-change-monitoring": {
    title: "What Is API Change Monitoring? A Guide",
    description:
      "API change monitoring watches provider changelogs instead of your uptime. What it reads, what a useful alert contains, and where the method honestly stops.",
    updated: GUIDES,
  },
  "github-api-change-impact": {
    title: "How API Changes Affect Your GitHub Repositories",
    description:
      "Where third-party API changes actually land: which repositories, files and call sites are exposed, and why your SDK version does not protect you.",
    updated: GUIDES,
  },
  "stripe-changelog-example": {
    title: "Reading Stripe's API Changelog: Worked Example",
    description:
      "A worked example using Stripe's official changelog: how dated API versions work, which fields decide impact, and how to turn an entry into a code change.",
    updated: GUIDES,
  },
};
