# Instant Repo Scan

Anonymous funnel: a visitor pastes a public GitHub repo URL on the homepage and
gets a "which third-party APIs does this use, and could a recent official notice
affect it?" result in roughly 10–25 seconds — no signup, no OAuth, no repo
clone.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/instant-scan` | Validate URL, cache-check, scan, persist. Returns `{ scan_id, cached, result }`. Unlimited per visitor. |
| `GET /api/instant-scan/{id}` | Public read of a stored scan (safe result JSON only). |
| `POST /api/instant-scan/{id}/email` | Post-result email capture (writes `instant_scans.email` + `leads` row, sends confirmation). |
| `POST /api/instant-scan/events` | Funnel events: `share_clicked`, `badge_copied`. |
| `GET /badge/{owner}/{repo}.svg` | Live README badge from the latest cached scan. |
| `POST /api/instant-scan/{id}/connect` | Post-scan sign-up continuation (auth): links `instant_scans.user_id`, adds the scanned public repo to the user's monitored repos, arms daily monitoring, writes a `leads` row. |
| `GET /admin/funnel` | Admin-only funnel counts + conversion rates (401 unauthenticated, 403 non-admin). |

Frontend: `/` (scan box, `#instant-scan`), `/scan/[id]` (result + OG image),
`/admin/funnel`. Badges are proxied from `https://breaklytix.site/badge/...` to
the backend via `next.config.js` rewrites.

## Environment variables (backend)

All optional except where noted. Defaults in `backend/app/config.py`.

| Variable | Default | Notes |
| --- | --- | --- |
| `GITHUB_SCAN_TOKEN` | *(empty)* | **Recommended.** Fine-grained, read-only, public-repo PAT. Server-side only, never sent to the browser. Empty ⇒ anonymous GitHub API (60 req/hour shared per egress IP), so larger scans fail or go partial. |
| `INSTANT_SCAN_MAX_FILES` | `3000` | Hard cap on files scanned per scan. |
| `INSTANT_SCAN_MAX_FILE_BYTES` | `300000` | Skip blobs larger than this. |
| `INSTANT_SCAN_MAX_ARCHIVE_BYTES` | `50000000` | Abort the tarball download above this (50 MB). |
| `INSTANT_SCAN_MAX_EXTRACT_BYTES` | `60000000` | In-memory extraction ceiling (60 MB). |
| `INSTANT_SCAN_TIMEOUT_SECONDS` | `55` | Per-invocation wall clock; partial result on timeout. |
| `INSTANT_SCAN_TOTAL_BUDGET_SECONDS` | `90` | Total budget across resumed worker invocations. |
| `INSTANT_SCAN_STALE_SECONDS` | `45` | A queued/scanning row older than this is resumed on poll. |
| `INSTANT_SCAN_CONCURRENCY` | `2` | Concurrent scan workers per instance. |
| `INSTANT_SCAN_RATE_LIMIT` | `5` | Scans per hashed IP per hour (DB-authoritative). |
| `INSTANT_SCAN_CACHE_HOURS` | `24` | Per-repo result cache window. |
| `INSTANT_SCAN_IP_SALT` | *(falls back to `JWT_SECRET`)* | Salt for the SHA-256 IP hash. Only the hash is stored. |

`SUPABASE_URL` / `SUPABASE_SERVICE_KEY` (already required by the app) are used
for persistence. No new Supabase credentials are needed.

## Database

Exact SQL: [`db/migration_instant_scan.sql`](db/migration_instant_scan.sql).
It creates `instant_scans`, `leads` and `instant_scan_events` plus indexes
(including the unique `(email, repo, source)` lead key). Applied to production
on 2026-11-12.

## Safety model

- Public repos only; no OAuth tokens, no cloning. GitHub tree + blob API.
- `.env*`, `*.pem`, `*.key`, `credentials.json`, `service-account.json`,
  `node_modules`, `vendor`, `dist`, `build`, `.git` are never read.
- Only safe source extensions plus `package.json` / `requirements.txt`.
- Detected snippets are redacted before leaving the scanner. Evidence contains
  environment-variable **names**, package names, file paths and line numbers —
  never values. Secret-shaped strings are asserted absent from the response,
  logs and DB in tests.
- Risks are worded as "may affect" / "possible". Provider-only overlap is not
  reported: a notice must also match an endpoint, SDK, symbol or value, or the
  result says notices exist but nothing in the repo matched.
- Visitor IPs are stored only as a salted SHA-256 hash.

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Covers URL validation/SSRF blocking, file exclusions, evidence formatting (no
secret values), rate limiting, cache hits, badge/email/event routes, admin
authorisation and an end-to-end scan of a fixture repo that asserts no secret
appears in the result. Full suite: 440 passed.

## What is NOT done yet

- **`GITHUB_SCAN_TOKEN` is not set in production.** Anonymous GitHub quota
  (60 req/hour per egress IP) makes medium/large scans slow, partial, or
  rate-limited. This is the main blocker for a reliable public demo.
- **Public gallery is not built.** The feature flag defaults to OFF and there is
  no admin gallery UI; this was explicitly optional.
- **No scheduled re-scan of instant-scan repos.** Only signed-up dashboard
  repos are re-scanned daily. The post-result email captures interest but does
  not create a monitored repo (by design — that requires OAuth).
- **No risk-volume cap.** A repo depending on a provider with many recent
  notices can list all matched notices (one card each). Currently rare because
  provider-only matches are filtered.
- **Badge reflects the latest cached scan only** (24h cache window); it is not
  re-generated on every README render.
