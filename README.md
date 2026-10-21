# Breaklytix

**Breaklytix watches the third-party API changelogs your code depends on, detects
breaking changes, and shows exactly which repositories, files and lines are
affected — before the change reaches production.**

[Website](https://breaklytix.site) · [Monitored providers](https://breaklytix.site/providers) · [Documentation](https://breaklytix.site/docs) · [What counts as a breaking API change](https://breaklytix.site/docs/breaking-api-changes) · [Security](https://breaklytix.site/security) · [Pricing](https://breaklytix.site/pricing)

Dependency scanners track the SDK you install. They do not track the remote
service that SDK talks to. A pinned client version is perfectly compatible with
a server that has already removed the endpoint it calls — so an integration can
break with no dependency change, no commit, and no failing build.

## What it does

1. **Connect a repository.** Sign in with GitHub and install the app with
   read-only permissions. No passwords are stored and no provider secret values
   are ever requested.
2. **Map the API surface.** Static analysis records the providers, SDKs, package
   names, endpoint strings and environment variable *names* your code uses.
3. **Collect changes at the source.** Each provider's own changelog, release
   notes or release feed is polled on a schedule, normalised and deduplicated by
   a stable fingerprint. No aggregators, no guessed release dates.
4. **Classify.** Entries are typed as breaking change, deprecation, API version
   change, endpoint change, schema change, auth change, SDK change, rate-limit
   change or behaviour change, with a severity.
5. **Match against your code.** An alert fires only when a change touches
   something you actually call, and it links to the affected file and line. An
   entry that matches nothing is still recorded — labelled unmatched, not
   silently dropped.
6. **Fix the mechanical ones.** For unambiguous changes, Breaklytix opens a
   GitHub pull request with the fix applied. Nothing is merged without a human
   review.
7. **Watch health, not just changelogs.** Runtime Intelligence adds provider
   error rates, status-page incidents and rate-limit events, and says so
   honestly when a provider has no telemetry yet.

## Coverage

**44 API providers** across payments, communication, AI, cloud, databases,
analytics, media and developer tools — Stripe, OpenAI, Anthropic, AWS, Slack,
Twilio, GitHub, Supabase, Vercel, Sentry, Plaid and more. Every provider is
tracked from its own official source; the full list with changelog links lives
at <https://breaklytix.site/providers>.

Adding a provider means appending one entry to the registry
(`backend/app/changelog/sources.py`); the scanner and matcher pick it up with no
other code changes.

## Stack

```
Next.js 14 (App Router, Vercel) ──► FastAPI (Vercel) ──► Postgres (Supabase)
                                        │
              GitHub OAuth ─────────────┼──► GitHub REST API (read-only repo scan)
                                        ├──► 44 provider changelogs / release feeds
                                        └──► Resend (alert + digest email)
```

- `frontend/` — Next.js App Router, 32 documentation articles, pricing and legal pages
- `backend/` — FastAPI service, provider registry, classifier, matcher, runtime intelligence
- `cli/` — command-line client for running scans from a terminal
- `db/` — SQL schema and migrations
- `.github/workflows/` — scheduled changelog collection and weekly digest

## Local development

The setup below still works end to end: Supabase for Postgres, a GitHub OAuth
app, Resend for email, then the FastAPI backend and the Next.js frontend. See
[Setup](#setup) after the repository layout.

---

## Repo layout

```
autofix/
├── backend/               FastAPI service (deploy to Render)
│   ├── app/
│   │   ├── main.py              app + CORS + routers
│   │   ├── config.py            env-driven settings
│   │   ├── db.py                Supabase client
│   │   ├── crypto.py            Fernet token encryption
│   │   ├── deps.py              session JWT + internal-secret guard
│   │   ├── schemas.py           Pydantic models
│   │   ├── signatures.py        provider detection patterns (env vars, packages, endpoints)
│   │   ├── detection.py         pure scanner (unit-tested)
│   │   ├── github_client.py     OAuth + trees/blobs reading
│   │   ├── changelog/           44 provider sources, classifier, matcher, scheduler
│   │   ├── alerts.py            cross-reference + email rendering (all providers)
│   │   ├── email_client.py      Resend REST transport
│   │   ├── billing.py           Stripe Billing (checkout, portal, webhooks)
│   │   ├── digest.py            Weekly digest email generator
│   │   └── routers/
│   │       ├── auth.py          GitHub OAuth
│   │       ├── billing.py       /billing/* endpoints + webhook
│   │       ├── fixes.py         /repos/{id}/fixes (review UI)
│   │       ├── internal.py      /internal/* (cron endpoints)
│   │       └── repos.py         /repos/* (connect, scan, detections, alerts)
│   ├── scripts/                 generate_key.py, seed_test_event.py
│   ├── tests/                   test_detection.py
│   ├── requirements.txt · render.yaml · Dockerfile · .env.example
├── frontend/              Next.js App Router (deploy to Vercel)
│   ├── app/
│   │   ├── login, auth/callback
│   │   ├── dashboard/           repos, repos/[id], repos/[id]/fixes
│   │   ├── dashboard/onboarding 4-step checklist
│   │   ├── dashboard/billing    plan, usage, Stripe Portal
│   │   ├── pricing              3 plan cards + Checkout
│   │   └── settings
│   ├── components/ui.tsx · lib/api.ts · lib/auth.ts · .env.example
├── db/
│   ├── schema.sql               Phase 1: users, repos, api_detections, changelog_events, alerts
│   ├── schema_phase2.sql        Phase 2: fix_rules, fixes
│   └── schema_phase3.sql        Phase 3: users billing fields, plan_usage, stripe_webhook_events
├── examples/sample_stripe_usage.py
├── .github/workflows/stripe-changelog-cron.yml  (daily: all 5 APIs)
└── .github/workflows/weekly-digest.yml          (weekly: digest emails)
```

---

## Prerequisites (all free)

- [Supabase](https://supabase.com) project (Postgres)
- [GitHub OAuth App](https://github.com/settings/developers)
- [Render](https://render.com) account (free web service)
- [Vercel](https://vercel.com) account
- [Resend](https://resend.com) account (100 emails/day free)
- Python 3.12+ and Node 18+ for local dev

---

## Setup

### 1) Supabase

1. Create a project. Copy the **Project URL** and the **service_role** key from
   *Project Settings → API*.
2. Open the **SQL Editor**, paste the contents of [`db/schema.sql`](db/schema.sql),
   and run it.

> RLS is intentionally off: the backend is the only client and uses the
> service-role key. Adding RLS + per-user policies is a Phase 2 item.

### 2) GitHub OAuth App

*Settings → Developer settings → OAuth Apps → New OAuth App.*

- **Homepage URL:** your frontend URL (e.g. `http://localhost:3000`)
- **Authorization callback URL:** `http://localhost:3000/auth/callback`
  (add your Vercel URL, e.g. `https://your-app.vercel.app/auth/callback`, once deployed)

Copy the **Client ID** and generate a **Client secret**.

### 3) Resend

Create an API key. For quick tests you can send *from* `onboarding@resend.dev`
(delivers only to your own account email). For real delivery, verify a domain
and set `RESEND_FROM_EMAIL` to something like `AutoFix <alerts@yourdomain.com>`.

### 4) Backend (local)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python scripts/generate_key.py        # copy the output into TOKEN_ENCRYPTION_KEY
cp .env.example .env                  # then fill in every value

uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for the interactive API.

### 5) Frontend (local)

```bash
cd frontend
npm install
cp .env.example .env.local            # set NEXT_PUBLIC_API_BASE_URL + NEXT_PUBLIC_GITHUB_CLIENT_ID
npm run dev
```

Visit `http://localhost:3000`.

### 6) Deploy the backend (Render)

- New → **Blueprint**, point it at this repo. Render reads
  [`backend/render.yaml`](backend/render.yaml) (root dir `backend`, free plan).
- Set every `sync:false` env var in the Render dashboard (same values as your
  `.env`, plus `FRONTEND_ORIGINS` = your Vercel URL).
- Health check: `/healthz`.

### 7) Deploy the frontend (Vercel)

- Import the repo, set **Root Directory = `frontend`**.
- Env vars: `NEXT_PUBLIC_API_BASE_URL` = your Render URL,
  `NEXT_PUBLIC_GITHUB_CLIENT_ID` = your OAuth client id.
- Add `https://<your-app>.vercel.app/auth/callback` to the GitHub OAuth App's
  callback URLs, and add the Vercel origin to backend `FRONTEND_ORIGINS`.

### 8) GitHub Actions cron

In the repo hosting this code, add two **Actions secrets**
(*Settings → Secrets and variables → Actions*):

| Secret | Value |
| --- | --- |
| `BACKEND_URL` | your Render URL, no trailing slash (e.g. `https://autofix-api.onrender.com`) |
| `INTERNAL_SECRET` | same string as the backend's `INTERNAL_SECRET` |

Two workflows run automatically:
- **Daily at 06:00 UTC** (`.github/workflows/stripe-changelog-cron.yml`): scrapes all 5 API changelogs + processes alerts.
- **Weekly Monday 09:00 UTC** (`.github/workflows/weekly-digest.yml`): sends weekly digest emails.

Trigger either manually from the **Actions** tab (*Run workflow*).

---

## Environment variables

### Backend

| Var | Purpose |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Database access (server-side) |
| `TOKEN_ENCRYPTION_KEY` | Fernet key encrypting GitHub tokens at rest |
| `JWT_SECRET` / `JWT_TTL_HOURS` | Signs frontend session tokens |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth code exchange |
| `INTERNAL_SECRET` | Guards `/internal/*` (shared with the cron) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Email delivery |
| `STRIPE_CHANGELOG_URL` | Scrape target (default Stripe changelog) |
| `SHOPIFY_CHANGELOG_URL` | Scrape target (default Shopify changelog) |
| `TWILIO_CHANGELOG_URL` | Scrape target (default Twilio changelog) |
| `SENDGRID_CHANGELOG_URL` | Scrape target (default SendGrid changelog) |
| `GITHUB_CHANGELOG_URL` | Scrape target (default GitHub Blog changelog) |
| `ALERT_ON_UNMATCHED` | Alert all repos using an API when an event has no tokens (default `false`) |
| `FRONTEND_ORIGINS` | Comma-separated CORS allowlist |
| `MAX_FILES_SCANNED` / `MAX_FILE_BYTES` | Scan safety limits |
| `STRIPE_SECRET_KEY` | Stripe secret key for Billing API |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (for billing webhooks) |
| `STRIPE_PRICE_STARTER` | Stripe Price ID for Starter plan ($500/mo) |
| `STRIPE_PRICE_GROWTH` | Stripe Price ID for Growth plan ($2,000/mo) |
| `STRIPE_PRICE_ENTERPRISE` | Stripe Price ID for Enterprise plan ($10,000/mo) |

### Frontend

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Backend base URL |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | OAuth client id (public) |

---

## End-to-end test

This is the Phase 1 acceptance test.

1. **Prepare a test repo.** Push [`examples/sample_stripe_usage.py`](examples/sample_stripe_usage.py)
   to a public GitHub repo of yours.
2. **Sign in & connect.** Open the frontend → *Continue with GitHub* →
   *Connect a repo* → pick the test repo.
3. **Scan.** Open the repo → *Scan now*. Confirm **Stripe** appears in the API
   footprint as **Monitored**, with `sample_stripe_usage.py` and the
   `stripe.Charge.create(...)` line listed.
4. **Seed a fake breaking change.** Either run the SQL in
   [`db/seed_test_event.sql`](db/seed_test_event.sql) in Supabase, **or** from
   `backend/` run:
   ```bash
   python scripts/seed_test_event.py
   ```
   This inserts a `Charge.source` removal event (unprocessed).
5. **Process alerts.** Trigger it:
   ```bash
   curl -X POST "$BACKEND_URL/internal/alerts/process" \
     -H "X-Internal-Secret: $INTERNAL_SECRET"
   ```
   (or run the GitHub Actions workflow manually.)
6. **Confirm.** You receive the email ("⚠️ Stripe API change may affect …") and
   the alert shows on the repo page with **Email: Sent**.

> The whole daily pipeline (`scan-stripe` → `process`) also runs via the cron.
> Step 4 just simulates a "genuinely new" changelog entry so you can test
> delivery without waiting for Stripe to ship a real breaking change.

---

## API reference

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/github/callback` | — | Exchange OAuth code → session JWT |
| `GET` | `/auth/me` | Bearer | Current user |
| `GET` | `/repos/github` | Bearer | List connectable GitHub repos |
| `GET` | `/repos` | Bearer | List connected repos |
| `POST` | `/repos/connect` | Bearer | Connect a repo (auto-scans) |
| `GET` | `/repos/{id}` | Bearer | Repo details |
| `POST` | `/repos/{id}/scan` | Bearer | Scan repo for API usage |
| `GET` | `/repos/{id}/detections` | Bearer | Grouped API footprint |
| `GET` | `/repos/{id}/alerts` | Bearer | Alert history |
| `GET` | `/repos/{id}/fixes` | Bearer | List fixes (with status filter) |
| `POST` | `/repos/{id}/fixes/{fix_id}/approve` | Bearer | Create PR for a fix |
| `POST` | `/repos/{id}/fixes/{fix_id}/dismiss` | Bearer | Reject a fix |
| `POST` | `/billing/create-checkout-session` | Bearer | Start Stripe Checkout |
| `GET` | `/billing/portal` | Bearer | Open Stripe Billing Portal |
| `GET` | `/billing/status` | Bearer | Current plan + usage |
| `POST` | `/billing/webhooks/stripe/billing` | Stripe sig | Billing webhook handler |
| `POST` | `/internal/changelog/scan-stripe` | `X-Internal-Secret` | Scrape Stripe changelog |
| `POST` | `/internal/changelog/scan-shopify` | `X-Internal-Secret` | Scrape Shopify changelog |
| `POST` | `/internal/changelog/scan-twilio` | `X-Internal-Secret` | Scrape Twilio changelog |
| `POST` | `/internal/changelog/scan-sendgrid` | `X-Internal-Secret` | Scrape SendGrid changelog |
| `POST` | `/internal/changelog/scan-github` | `X-Internal-Secret` | Scrape GitHub Blog changelog |
| `POST` | `/internal/alerts/process` | `X-Internal-Secret` | Match + email (all APIs) |
| `POST` | `/internal/digest/send-weekly` | `X-Internal-Secret` | Send weekly digest emails |
| `GET` | `/health/overview` | Bearer | Cross-repo API health overview |
| `GET` | `/health/repo/{repo_id}` | Bearer | Health + issues for one repo |
| `GET` | `/health/provider/{provider}` | Bearer | Provider health, history, incidents |
| `GET` | `/health/issues` | Bearer | Open reliability issues (filters) |
| `GET` | `/health/issues/{issue_id}` | Bearer | Issue detail |
| `PATCH` | `/health/issues/{issue_id}` | Bearer | Update issue status |
| `POST` | `/health/issues/{issue_id}/fix` | Bearer | Queue deterministic auto-fix (needs review) |
| `GET` | `/health/history/{repo_id}` | Bearer | Health score trend data |
| `GET` | `/health/usage/{repo_id}` | Bearer | Usage/quota snapshots + quota forecast |
| `GET` | `/health/rate-limit/{repo_id}` | Bearer | Rate-limit snapshots + latest status |
| `GET` | `/health/agency/overview` | Bearer | Per-client health (agency owners) |

---

## API Reliability & Health Intelligence

The product detects **more than provider changes** — it detects, explains,
predicts and helps resolve integration failures before they become incidents.

### Architecture

- **`backend/app/health/provider_capabilities.py`** — provider registry. Each
  provider declares supported capabilities (`usage_monitoring`, `quota_monitoring`,
  `rate_limit_monitoring`, `incident_monitoring`, `auto_fix`, ...). Capabilities
  are data, not scattered provider logic.
- **`backend/app/health/engine.py`** — configurable 0–100 health scoring engine
  with per-check weights (`DEFAULT_WEIGHTS`, per-provider overrides). Missing
  signals are scored as *unavailable* (neutral), never silently healthy.
- **`backend/app/health/issues.py`** — unified issue model. Four fundamentally
  different problem types are kept distinct on the dashboard:
  `provider_problem` / `customer_code` / `customer_usage` / `provider_incident`
  (plus `dependency`, `configuration`). Deduplication via deterministic
  `content_hash`. Client-facing explanations remove technical jargon.
- **`backend/app/health/risk.py`** — explainable risk engine (severity,
  provider criticality, production exposure, open factors).
- **`backend/app/health/redact.py`** — defensive secret redaction applied to
  any evidence/description text before display or persistence.
- **`backend/app/health/bridge.py`** — post-scan pipeline: findings →
  `reliability_issues` (deduped) → alerts (severity-gated) → health checks →
  `health_scores` + `health_history`. Wired into the scanner runner.

### Health score

100-0 per integration; bands: 90+ *excellent*, 75–89 *healthy*, 50–74 *warning*,
25–49 *at_risk*, <25 *critical*. Every score carries an inspectable `breakdown`
and per-check results. Quota/usage/rate-limit data is only ever shown when a
provider actually exposes it — otherwise the UI shows *“Unavailable”* /
*“Not supported by this provider”*. No fabricated numbers.

### Data model (Phase 11 migration)

New tables: `provider_capabilities`, `health_checks`, `health_scores`,
`health_history`, `reliability_issues`, `usage_snapshots`, `rate_limit_snapshots`,
`provider_incidents` (+ indexes). Reliability issues flow into the existing
`fixes` table via the review-before-apply approval flow (never auto-applied).

### Auto-fix

`POST /health/issues/{issue_id}/fix` creates a `needs_review` fix from a
deterministic rule. The existing **Fixes** tab approval flow opens the PR.
Uncertain fixes show *No deterministic auto-fix available* instead of inventing one.

### Security

Same rules as the rest of the product: secrets are never read into scan output
(only env-var names), never logged, never returned by `/health/*`, and evidence
passes through `redact()`. `/debug/*` endpoints are gated by `require_internal_secret`.

### Tests

`cd backend && python -m pytest tests/test_health_intelligence.py -q` — provider
matrix, scoring, dedup, risk ranking, redaction, bridge mapping.

---

## Adding a new provider

Everything routes through [`backend/app/signatures.py`](backend/app/signatures.py):

1. Add a `"provider": [ ...regex... ]` entry to `API_SIGNATURES`.
2. It's detected immediately (dashboard shows it as *Coming soon*).
3. To monitor it for changes, add a scraper + move it into `MONITORED_APIS`.

Run the detector tests: `cd backend && pytest`.

---

## Deviations from the original spec (approved "sensible fixes")

- **Git Trees + Blobs API instead of Code Search.** GitHub's code-search API only
  indexes the default branch, is heavily rate-limited (~30 req/min), and can miss
  files. Listing the tree once + fetching source blobs is complete, deterministic,
  and still lightweight (no full clone). See `github_client.py`.
- **Session auth added.** The spec described the OAuth callback but not how the
  frontend stays authenticated. We issue a short-lived HS256 **session JWT**
  (`deps.py`) sent as `Authorization: Bearer`.
- **GitHub token stored on the user, encrypted.** GitHub OAuth tokens are
  per-user, so we keep the operational copy on `users.github_access_token`
  (Fernet-encrypted); `repos.access_token` still mirrors it per the spec.
- **Schema hardening.** Added `content_hash` (scraper dedupe), `processed_at`
  (reliable "unprocessed event" tracking), `symbols` (matching), and UNIQUE
  constraints so scans/cron are idempotent.
- **OAuth scopes are read-oriented** (`public_repo`, `read:user`, `user:email`).
  Classic OAuth Apps have no true read-only private-repo scope — **private repo
  read-only access needs a GitHub App (Contents:read), a Phase 2 item.**
- **Resilient scraper.** Stripe's changelog is partly JS-rendered and its markup
  changes; the parser tries structured containers, then falls back to
  keyword-filtered text blocks. Tune `STRUCTURED_SELECTORS` in `scraper.py` if
  Stripe changes markup.

## Security notes

- GitHub tokens are encrypted at rest with Fernet; the key lives only in the env.
- `/internal/*` fails closed if `INTERNAL_SECRET` is unset and rejects bad headers.
- Stripe webhook signature verification prevents spoofing billing events.
- Never expose the Supabase service-role key or GitHub client secret to the
  browser (only `NEXT_PUBLIC_*` vars reach the frontend).

## Non-goals (Phase 3) & roadmap

Not in Phase 3: AI/LLM fixes, auto-deploy, auto-fix rules for SendGrid/GitHub,
usage-based billing/metering beyond API count cap.

Future phases: GitHub App for private-repo read-only access, RLS policies,
curated auto-fix rules for SendGrid/GitHub, usage analytics dashboard.

## Cost

Supabase free · Render free web service · Vercel hobby · Resend 100 emails/day ·
GitHub Actions (free minutes). **$0** for infrastructure. Stripe fees apply on
paid subscriptions (2.9% + 30¢ per transaction).
