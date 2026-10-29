# backlink-agent

White-hat backlink prospecting and outreach for **one** site — currently
`breaklytix.site`.

It crawls your site to learn what it actually offers, finds pages that might
link to you, scores them, finds a public contact address, writes one
personalised email per prospect, saves it as a **draft**, and then tracks
whether anything came of it.

One command:

```bash
python run.py --daily
```

That is the whole loop. Everything else is a flag on the same script.

---

## What this is not

Read this before you run it, because the honest limits are the point:

- **It does not create backlinks.** It creates *drafts*. A link only appears if
  a human on the other side decides to publish it. Any tool that promises 100
  backlinks is selling you a link farm.
- **It does not scrape Google.** No provider is configured by default; scraping
  result pages breaks Google's and DuckDuckGo's terms. You can plug in a paid
  search API (Serper, Brave) if you want fresh discovery.
- **It does not guess email addresses.** Only addresses printed on the
  prospect's own pages (mailto links, contact/about/contribute pages) are used.
  No `firstname@domain.com` patterns, no email-hunting services.
- **It does not post comments, buy links, join PBNs, or submit to link farms.**
  Those domains are excluded before a request is made (`data/blocklist.txt`,
  plus the built-in `ALWAYS_BLOCK` list).
- **It does not solve captchas.** The directory module opens a real browser and
  waits for *you* to solve it, then waits for you to confirm the verification
  email.
- **It does not claim a backlink exists.** `link_checker.py` only marks
  `link_live` after it has seen the `<a href>` in the served HTML. Until then
  the status stays where it is.
- **It does not promise rankings.** Nothing here can promise a ranking or a
  traffic number, and the generated emails are structurally forbidden from
  inventing metrics.

---

## Install

> First time here? `SETUP.md` is the step-by-step checklist (Gmail OAuth,
> API keys, Playwright) with exact commands.

```bash
cd backlink-agent
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

Required: `requests`, `beautifulsoup4`, `PyYAML`. Python 3.10+.

Optional extras:

| Feature | Install | Env var |
|---|---|---|
| AI email drafting | `pip install anthropic` | `ANTHROPIC_API_KEY` |
| Gmail drafts + sending | `pip install google-api-python-client google-auth-oauthlib` | `data/gmail_token.json` |
| Directory form filling | `pip install playwright && playwright install chromium` | — |
| Search discovery | — | `SERPER_API_KEY` or `BRAVE_API_KEY` |

Copy `.env.example` to `.env` and fill in only what you use. Never commit it.

## Configure

Everything lives in `config.yaml`.

| Key | Meaning | Current value |
|---|---|---|
| `my_domain` | The site being promoted | `breaklytix.site` |
| `niche` | Phrase used to build prospecting queries | `developer tools / API change monitoring` (derived from the crawl) |
| `target_countries` | Used for relevance context | `[US, UAE, PK]` |
| `competitor_domains` | Enables gap analysis | **empty on purpose** — see below |
| `outreach_email` | From / Reply-To address | `support@breaklytix.site` |
| `daily_send_limit` | Hard cap on sends per day | `25` |
| `AUTO_SEND` | `false` = drafts only | `false` |
| `politeness.*` | UA, delay, timeout, per-domain page cap, cache TTL | 2 s delay, 6 pages/domain |
| `scoring.drop_below` | Prospects under this are dropped | `50` |
| `search.provider` | `none` \| `serper` \| `brave` | `none` |

`competitor_domains` is empty because naming a competitor is a factual claim
about your market, and gap analysis on invented competitors produces noise. Add
3–5 real ones and `competitor_gap.py` switches on. A placeholder value is never
silently accepted: the loader warns and disables the dependent feature.

## Run

```bash
python run.py --daily                  # crawl -> prospect -> score -> draft -> follow-up -> weekly link check
python run.py --daily --dry-run        # same, but no drafts and no sends (data/ and logs/ still update)
python run.py --crawl-only            # just re-read your own site
python run.py --crawl-only --refresh  # force, ignoring the 7-day profile cache
python run.py --prospect-only         # discovery only
python run.py --score-only            # score the raw queue
python run.py --outreach-only         # draft emails for scored prospects with a contact
python run.py --followup-only         # one follow-up per silent prospect, >= 4 days later
python run.py --check-links           # force the weekly liveness check
python run.py --submit-directories    # dry-run: fill fields, screenshot, stop
python run.py --submit-directories --live --only SaaSHub
```

Useful flags: `--limit N` (prospects to score this run), `--verbose`,
`--config path/to/config.yaml`.

## What each module does

| Module | Step | Behaviour |
|---|---|---|
| `crawl_site.py` | 1 | Fetches the homepage + up to 8 key pages (sitemap-aware), stores title, meta, H1/H2, word counts, docs pages, top terms, and the evidence URL for each field in `data/site_profile.json`. |
| `keywords.py` | 1 | Turns the profile into niche phrases, ~8 query templates per phrase, and a pitch block with three honest offers (guest post, broken-link replacement, tool submission). Deterministic — no LLM. |
| `competitor_gap.py` | 2 | Two sources: (a) backlink CSV exports dropped in `data/backlinks/*.csv`, (b) mention search *only* if a provider is configured, and each hit is verified by fetching the page and confirming it links the competitor and not you. |
| `prospector.py` | 3 | Collects seeds, search results, gap candidates and broken-link finds. Dedupes by registrable domain, normalises URLs, drops junk hosts and blocklisted domains, appends everything to `data/prospects_raw.jsonl`. Broken links are only counted after a `HEAD` returns 404/410. |
| `scorer.py` | 4 | 0–100 with a stored per-factor breakdown: relevance 35, domain age 15 (RDAP, cached), technical 10, contactability 15, link policy 10, minus up to 25 for spam signals, link-list shape, thin content, noindex, parked pages. Under 50 = `dropped`. |
| `contact_finder.py` | 5 | Prefers an address already on the scored page, then `/contact`, `/about`, `/write-for-us`, `/guest-post`, `/contribute`, `/submit`. If only a form exists it records `kind: form` and stops. |
| `outreach.py` | 6 | Claude (`claude-sonnet-5`) when `ANTHROPIC_API_KEY` is set, otherwise a grounded template. The body is rejected if it invents numbers, contains a price, uses banned superlatives, or asks no question. Creates a Gmail draft (or a `.eml` in `data/drafts/`); sends only when `AUTO_SEND: true`, one at a time, inside the daily budget. |
| `followup.py` | 7 | One follow-up, only for `sent` rows older than `followup_after_days`, never twice (`followup_at` is checked then written), never after a reply. |
| `tracker.py` | 8 | `data/prospects.csv` is the single source of truth. Status flow: `found → scored → drafted → sent → replied` / `no_response`, plus `dropped`, `blocked`, `link_live`, `link_lost`. Never downgrades a status. Writes `data/reports/YYYY-MM-DD.md`. |
| `directory_submit.py` | 9 | Playwright. Only entries with `approved: true` in `data/directories.yaml`. Fills CSS selectors you supply, screenshots the filled form, pauses on login/captcha/email verification, and submits only with `--live`. |
| `link_checker.py` | 10 | Weekly. Fetches the placement page with cache bypassed, looks for an `href` to your domain, records anchor + `rel` + whether the host page is indexable, and keeps 12 checks of history per domain. |

## Files

```
config.yaml              settings
run.py                   pipeline + CLI
backlink_agent/          the 10 modules + http/parse/log helpers
data/seeds.txt           URLs you vouch for (hand-curated)
data/blocklist.txt       never contact (hand-curated)
data/directories.yaml    forms to fill, approved: false by default
data/backlinks/*.csv     optional Ahrefs/Semrush/Moz exports (gitignored)
data/suppression.txt     domains/emails that asked not to be contacted
logs/agent-YYYY-MM-DD.jsonl   every fetch, draft, skip and decision
```

Generated output (`data/cache/`, `data/drafts/`, `data/prospects.csv`,
`data/reports/`, …) is gitignored.

## Safety limits

- `AUTO_SEND: false` by default; drafts land in Gmail or `data/drafts/` first.
- Daily cap enforced from the tracker's `sent_at` timestamps, not from memory.
- `data/suppression.txt` — one domain or email per line — is checked before any
  draft, and every email carries a one-line opt-out.
- robots.txt is consulted before every request; `crawl_delay` is logged. A host
  returning 401/403 for `robots.txt` is treated as fully disallowed.
- Requests to the same host are spaced by `delay_seconds` (default 2 s), with
  backoff on 429/5xx and a per-domain page cap.
- Responses are cached for 7 days so a re-run does not re-hammer anyone.
- Nothing is sent, submitted or clicked without `AUTO_SEND: true` / `--live`.
- No secrets are written to logs.

## Troubleshooting

- **PowerShell shows red `NativeCommandError` lines.** The agent writes warnings
  to stderr; PowerShell renders any stderr output as an error record even when
  the run succeeded. Check `$LASTEXITCODE` (0 = fine) or append `2>$null`.
- **`drafted=0`.** Normal on a fresh install: with `search.provider: none` and
  no competitor list, the only input is `data/seeds.txt`. Add real prospects, a
  search key, or `data/backlinks/*.csv`.
- **`playwright_missing`.** `pip install playwright && playwright install chromium`.
  The rest of the pipeline runs without it.
- **`draft_rejected ... numbers not present on the site`.** The fact-grounding
  check refused a number the crawler never saw. Fix the copy, not the check.
- **`gmail_init_failed`.** `data/gmail_token.json` is missing or expired; until
  it is valid, drafts are `.eml` files and nothing is sent.

## Tests

```bash
pip install pytest
python -m pytest tests -q
```

The suite is offline: no network, no keys, no sending.

## Gmail setup (optional)

1. Create an OAuth client (Desktop app) in Google Cloud, enable the Gmail API.
2. Authorise once and save the credentials JSON to `data/gmail_token.json`
   (this file is gitignored — it is a credential).
3. Without it, drafts are written as `.eml` files in `data/drafts/` and
   `AUTO_SEND` can never actually send.

## Claude setup (optional)

`export ANTHROPIC_API_KEY=...` (or put it in `.env`). Without it, outreach uses
the deterministic template, which quotes the same crawled facts. With it, the
model gets a strict system prompt plus a `FACTS` block, and its output still
has to pass the same validator before it becomes a draft.

## Weekly routine

```bash
python run.py --daily            # most days: score + draft
python run.py --followup-only    # day 4+ for anyone silent
python run.py --check-links      # weekly: is the link still live?
```

Then open `data/prospects.csv` (or the daily report) and read the drafts before
turning `AUTO_SEND` on.
