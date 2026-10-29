# Breaklytix — Outreach & Submission Plan

**Prepared:** 2026-10-28
**Scope:** developer-focused API-change monitoring & code-impact analysis (`https://breaklytix.site`)
**Companion file:** `backlink-candidates-2026-10-28.csv` (30 prioritized candidates, 10 required fields each)

---

## 0. Status of every claim in this plan

| Label | Meaning |
|---|---|
| **VERIFIED 2026-10-28** | I loaded the page myself today; HTTP status + final URL + title recorded |
| **BLOCKED** | Bot protection (403/429/Cloudflare) answered my request — page may be fine, I could not read it |
| **NOT VERIFIED** | Fetch failed at network level; no conclusion about the page |
| **NOT TESTED** | Nobody has checked yet |

**No account was created, no form submitted, no message sent, no content published.** Every item below is a prospect. A prospect becomes a backlink only after the published page is fetched and the link is found in its HTML.

Current observed backlink count for this domain (from the earlier external audit, not re-verified by me): **1 link / 1 referring domain, nofollow (`xploredomains.com`)**. Rank tracking outcomes are not promised anywhere in this plan.

**Status values used in the CSV** (103 URL fetches across two passes on 2026-10-28):

| Status | Meaning |
|---|---|
| `prospect` | page confirmed reachable today; nothing submitted yet |
| `blocked_on_asset` | platform is fine, but posting now would violate its own rules (needs `/demo` or a real page first) |
| `needs_browser_check` | bot protection or network failure; a human must open it once |
| `needs_review` | page loads, but the submission rules could not be read — do not pitch until they are |

---

## 1. Strategy in one paragraph

Breaklytix's on-page SEO is already A-grade (29/29 sitemap URLs return 200, unique 43–60 char titles, self-canonical, valid JSON-LD), and the site is indexed (~35 results in `site:`). The gap is **brand entity + link authority**. So the plan is not "get many links" — it is "become a name that appears in places developers already trust". That means a small number of high-relevance placements, published articles that are genuinely useful on their own, and consistent brand naming. Volume is deliberately capped: 30 researched candidates, of which roughly 10 are worth executing in the first 6 weeks.

Two hard rules that shape everything:

1. **Asset before link.** Nothing gets submitted to Hacker News, Reddit, Changelog or console.dev until there is something a stranger can *try* without a sales call. Current gap: public `/demo` or sample impact report (`NOT TESTED` — page does not exist yet as of this writing).
2. **No duplicate-content links.** The same article may not be pasted on DEV, Hashnode and Medium. One canonical home, then `rel=canonical` cross-posts only.

---

## 2. Tiers

| Tier | Definition | Count | Execute when |
|---|---|---|---|
| **A** | Direct topical fit, real developer audience, editorial or community gate, link is a natural by-product of useful content | 10 | Weeks 1–4 |
| **B** | Useful secondary: dev directories, dev-oriented editorial blogs, launch platforms with a developer audience | 12 | Weeks 3–8 |
| **C** | Low priority / unverified / paid-only / weak fit — keep on file, do not spend time now | 8 | Only if A+B stall |

Tier is **not** a domain-authority ranking. A low-DR niche list that a real engineer reads beats a high-DR directory nobody opens.

---

## 3. Tier A — do these first

### A1. GitHub repository (owned, foundation)
- **Why:** every awesome-list PR, every article byline, and most profile fields point back to a repo. Right now the repo is `Hashirattari11/test` — the brand appears nowhere in it.
- **Route:** `https://github.com/Hashirattari11/test` — **VERIFIED 2026-10-28** (200)
- **Link:** outbound link from README is `nofollow` (GitHub policy). Value is trust/identity, not link equity.
- **Steps:**
  1. Settings → Rename → `breaklytix`
  2. Description: *"Monitors third-party API changelogs and maps breaking changes to the files in your GitHub repos."*
  3. Topics: `api-monitoring`, `breaking-changes`, `changelog`, `github-app`, `developer-tools`
  4. README header: one-line pitch, `https://breaklytix.site`, docs link, screenshot
  5. Confirm: repo URL resolves, README renders the site link, topics visible
- **Effort:** 20 min. **Approval needed:** yes (rename changes the remote URL).

### A2. DEV Community — article
- **Why:** largest open dev blogging community; `#api`, `#devops`, `#github` tags are actively read. Links in article body are followed for normal accounts (`VERIFIED 2026-10-28` on dev.to homepage anchors: `(none)` and `noopener me` dominate; only 1 of 16 sampled external anchors was `noreferrer`).
- **Route:** `https://dev.to/new` — **VERIFIED 2026-10-28** (200)
- **Terms:** no primarily-promotional posts, disclose affiliation — `https://dev.to/terms` (route recorded; text read by title only)
- **Proposed article:** *"What a changelog entry actually tells you (and what it hides)"* — anatomy of a Stripe/GitHub changelog entry, the 5 fields that matter, how a breaking change maps to files, what to check before upgrading. Product mentioned once, in context.
- **Target page:** `/docs/api-change-monitoring`
- **Anchor:** natural sentence anchor, e.g. *"how Breaklytix maps a changelog entry to affected files"* — not exact-match keyword.
- **Post-publish check:** fetch the published URL, confirm the anchor + `rel`, confirm canonical points at the DEV URL (not at breaklytix.site).
- **Effort:** 3–4 h writing + 15 min publishing.

### A3. Changelog News — link submission
- **Why:** weekly dev news with community-submitted links; self-submissions explicitly welcome; strong technical audience.
- **Route:** `https://changelog.com/news/submit` — **VERIFIED 2026-10-28** (200); sign-in required.
- **Catch (published on their page):** no tutorials or commercial products — a *product launch post* will be declined; a *data/tooling announcement with substance* can pass. Submit only after the `/breaking-changes` public page exists.
- **Effort:** 10 min once the asset exists. **Risk:** submitting too early burns the one submission that gets read.

### A4–A7. Awesome-list pull requests (4 lists)
All four returned **200 on 2026-10-28**:

| List | URL | Fit | Rule I must respect |
|---|---|---|---|
| awesome-monitoring | `github.com/crazy-canux/awesome-monitoring` | strongest — API/infra monitoring category exists | alphabetical placement, one line, no marketing adjectives |
| awesome-api | `github.com/Kikobeats/awesome-api` | strong — API tooling | check existing "monitoring" section before adding |
| awesome-api-devtools | `github.com/yosriady/awesome-api-devtools` | strong — API developer tooling | may be stale; check last commit before spending time |
| awesome-observability | `github.com/adriannovegil/awesome-observability` | medium — observability-adjacent | verify list is still maintained |

- **PR body pattern:** what it does in one sentence, who it is for, that the submitter is the maker (disclosure), link to a doc page showing the actual behaviour.
- **Expected link rel:** `nofollow` (GitHub). Value = discovery + a real citation in a curated list.
- **Rejection policy:** if a maintainer says no, stop. Re-submitting the same line is the fastest way to get a domain blacklisted.
- **Effort:** 30 min per PR (after the repo rename).
- **Not eligible — do not try:** `awesome-selfhosted`, `free-for-dev`, `public-apis`, `awesome-nodejs`, `awesome-cli-apps`. Breaklytix is a paid SaaS (`NOT` self-hostable, free tier = 10-day trial only). Submitting anyway is a rule violation and a visible one.

### A8. SaaSHub — listing
- **Route:** `https://www.saashub.com/services/submit` (canonical submit path per their own listing page) — status recorded in CSV; the shorter `https://www.saashub.com/submit` returned 200 on 2026-10-28.
- **Link attribute evidence (`VERIFIED 2026-10-28`, saashub.com homepage sample, 28 external anchors):** `nofollow` 10, `sponsored` 7, `nofollow sponsored` 6, `ugc` 1, none 4. **Read this as: directory traffic and brand mention, not ranking authority.**
- **Requirements:** released product only (not beta), verify with a domain email (`support@breaklytix.site`), list competitors or the queue is slow.
- **Steps:** submit name/URL/tagline/short + long description (copy from existing site copy, invent nothing) → category *Developer Tools → API/Monitoring* → logo → wait for review.
- **Effort:** 30 min + review queue.

### A9. Hacker News — Show HN
- **Rules (`VERIFIED 2026-10-28`, read from `news.ycombinator.com/showhn.html`):** must be something people can **try**, non-trivial, yours, and you must be around to discuss. Off-topic: blog posts, sign-up pages, newsletters. No upvote solicitation.
- **Blocker:** a signup wall / sales page is explicitly off-topic. **Do not post until `/demo` exists.**
- **Link rel:** `nofollow` (HN policy). Value = traffic, feedback, brand query volume — which is exactly the signal that fixes "did you mean: brawlytix".
- **Effort:** 15 min to post, 3 h to sit in the thread and answer honestly. One shot — do not repost the same URL.

### A10. Reddit — participate, then post
- **Routes:** `r/webdev`, `r/devops` both **VERIFIED 2026-10-28** (200).
- **Rules I will follow:** read each subreddit's self-promotion policy before posting (not yet read: **NOT TESTED**); comment usefully for at least a week first; one link per post maximum, in a comment if possible; no cross-posting the same text.
- **Expected rel:** Reddit outbound links are `nofollow`.
- **Effort:** ongoing, low. **Do not** use this as a link source; use it as an audience test.

---

## 4. Tier B — after A is running

| # | Destination | Type | Why / caveat | Effort |
|---|---|---|---|---|
| B11 | **Hashnode** | article cross-post | canonical cross-post only. `hashnode.com` returns 200 (**VERIFIED 2026-10-28**); the `/onboard` route failed from this network, so the exact signup path is **NOT VERIFIED** | 30 min |
| B12 | **HackerNoon** | article | free to write, editorially gated. Homepage unreachable from here (**NOT VERIFIED**) — confirm in a browser before writing | 2–3 h |
| B13 | **console.dev** | newsletter suggestion | email `hello@console.dev`; needs self-serve signup + clear docs — both exist; no sponsored reviews | 20 min |
| B14 | **DevHunt** | dev-tool launch | dev-only launch board, weekly voting. Submit link goes to `/login`; `/submit` is 404 (**VERIFIED 2026-10-28**) | 45 min |
| B15 | **AlternativeTo** | directory | high-intent "alternative to X" traffic; site refused my fetch (**BLOCKED**) | 30 min |
| B16 | **LibHunt** | directory | **fit risk:** open-source-oriented directory, Breaklytix is closed source. `/repo/submit` is **BLOCKED**; check eligibility before investing | 20 min |
| B17 | **APMdigest** | industry news | Closest topical fit of any publication: APM/performance news. Contributed-news process **NOT VERIFIED** | 1 h |
| B18 | **CNCF Blog** | foundation blog | Cloud-native/observability audience. Only viable if the article is genuinely cloud-native; eligibility **NOT TESTED** | 3 h |
| B19 | **InfoQ** | technical editorial | Senior engineering audience, high editorial bar. Submission route **NOT TESTED** | 4 h |
| B20 | **Product Hunt** | launch | One-time awareness spike, less dev-specific than DevHunt. **BLOCKED** from here; needs assets + timing | 4 h prep |
| B21 | **IndieHackers** | founder community | Founder-story/milestone posts, not a directory listing. **BLOCKED** from here | 1 h |
| B22 | **Reddit r/webdev** | community | Larger than r/devops but more front-end leaning; comment-only until a real question appears | 1 h |

---

## 5. Tier C — on file, not now

| # | Destination | Why it is C |
|---|---|---|
| C23 | **Toolfinder** (`toolfinder.com`, note the TLD) | generic directory, awareness only |
| C24 | **Peerlist** | dev network/launchpad, smaller reach, **BLOCKED** |
| C25 | **StackShare** | comparison pages can rank, but **BLOCKED** (429); needs competing-tool research first |
| C26 | **Crunchbase** | entity/`sameAs` consistency, not a link play |
| C27 | **freeCodeCamp News** | huge audience, general web-dev focus; old contribute URL is 404 so the process changed (**NOT VERIFIED**) |
| C28 | **The New Stack** | dev/ops readership; `/contribute` is 404 (**NOT VERIFIED**) |
| C29 | **Uneed** | indie launch directory, weak fit for a $500/mo B2B tool |
| C30 | **Launching Next** | startup discovery, low dev intent |

### Deliberately excluded (not "failed", just not eligible)

| Destination | Reason |
|---|---|
| `awesome-selfhosted` | free/self-hostable software only — Breaklytix is paid SaaS |
| `free-for-dev` | requires a real free tier; a 10-day trial is not one |
| `public-apis` | lists free public APIs, not tools |
| `awesome-nodejs` | explicitly excludes SaaS SDKs |
| `awesome-cli-apps` | open source, 20+ stars, AI-generated PRs unwelcome |
| `awesome-ai-devtools` | AI-powered dev tools only; Breaklytix is not positioned as AI |
| `OpenAlternative` | open-source alternatives only; `/submit` redirects to login anyway |
| Medium / Quora / LinkedIn Articles | nofollow, low dev intent, duplicate-content risk |
| `articleted`, `sooperarticles`, `articlebiz` | article directories — classic spam footprint |
| G2 / Capterra / GetApp / Software Advice / TrustRadius / SaaSworthy / SoftwareSuggest | review platforms need a vendor account **and real customers** before a profile is credible; revisit after first paying users (`NOT TESTED`) |

---

## 6. Six-week schedule (capacity-based, no guarantee)

| Week | Work | Definition of done |
|---|---|---|
| 1 | Repo rename + README + topics; decide `/demo` and `/breaking-changes` scope | repo URL live, README shows site link |
| 2 | Write article 1; publish on DEV; cross-post to Hashnode **with canonical** | DEV URL live, canonical verified, `rel` recorded |
| 3 | 4 awesome-list PRs (repo has to be renamed first) | 4 PRs opened, maintainer response logged |
| 4 | SaaSHub listing; console.dev email; Toolfinder | submissions sent, queue state recorded |
| 5 | `/demo` shipped → Show HN; Changelog News link | HN thread URL logged, honest replies |
| 6 | Reddit participation + one post; review what moved in GSC | GSC impressions for "breaklytix" compared to 2026-10-28 baseline |

**Do not compress this.** Twenty submissions in one week looks like a campaign; three a week looks like a person.

---

## 7. Duplicate-content and canonical rules

1. One article has **one canonical home**. If DEV is home, Hashnode gets the same text with `canonical → DEV URL`.
2. Never publish the same body on Medium "for reach" — it competes with the canonical and teaches Google the content is syndicated filler.
3. Docs pages stay canonical to `breaklytix.site`. Articles should **link to** docs, not duplicate them.
4. Directory descriptions: reuse approved site copy. Do not invent features, numbers, customer counts, or integrations. Known product facts only: 44 providers, 10-day trial, Starter $500 / Growth $2,000 / Enterprise $10,000 per month, scheduler 06:00 UTC, weekly digest Mondays 09:00 UTC.
5. Anchor text: brand or natural sentence. Exact-match keyword anchors are capped at essentially zero for this campaign.

---

## 8. Verification protocol (the only thing that turns a prospect into a link)

For each placement, after it goes live:

1. **Fetch the live URL** (not the dashboard, not the preview).
2. Record: final URL, HTTP status, whether the target URL appears in the HTML, the anchor text, the `rel` attribute, whether the link is inside a `<script>`/JS-only render, the page `robots` meta, and the page canonical.
3. Save the evidence line in the CSV under `verified_link_evidence` with today's date.
4. **Re-check at day 14 and day 30.** Directory links get pruned; article links get edited. A link that vanished is a link that never counted.
5. If a platform shows "pending review" indefinitely, mark `submitted_pending` — never "acquired".
6. Separately measure **referral sessions** (Vercel/analytics referrer) and **branded search impressions** in GSC. Traffic from a placement is a different result from link equity.

---

## 9. What I still need from the owner

1. **Approval** for the GitHub repo rename (`Hashirattari11/test` → `breaklytix`).
2. **`/demo` decision** — a public, no-signup sample impact report is the gate for HN, Changelog and console.dev.
3. **Account ownership** — DEV / Hashnode / HackerNoon / SaaSHub / Reddit / HN accounts. I will not create them or post from them without an explicit go-ahead per platform.
4. **GSC data** — I still cannot see coverage or brand-query impressions; that is the baseline this whole plan is measured against.

---

*Prepared 2026-10-28. Route and attribute evidence comes from live fetches on that date; anything not fetched is labelled BLOCKED or NOT VERIFIED rather than assumed.*
