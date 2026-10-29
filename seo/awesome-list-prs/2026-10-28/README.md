# Awesome-list PRs — checked 2026-10-29

**Status: PR #236 is open** — https://github.com/yosriady/awesome-api-devtools/pull/236
(1 file, +1 line, author disclosed in the description). Opened 2026-10-29 from
`Hashirattari11:add-breaklytix` against `master`. Nothing is merged, so there is
no backlink yet — a link only counts once the maintainer merges it and the entry
is visible on the served page.

Four candidate lists were checked against their own rules before writing
anything. Only one has a category where a closed-source, commercial API-change
monitor belongs. The other three are skipped with the reason and the evidence,
because a rejected PR is worse than no PR: it burns the domain's reputation with
the exact maintainers we want to reach later.

| List | Stars | Their rule | Verdict |
|---|---|---|---|
| `yosriady/awesome-api-devtools` | 4,014 | No `CONTRIBUTING.md`; README: "Contributions are most welcome". `## API Monitoring` already lists commercial services (Runscope, Ping-API, Streamdal). | **Prepared** — one-line entry at the end of `## API Monitoring` |
| `Kikobeats/awesome-api` | 2,988 | Sections are Design / Caching / Security / Format / Discover / Testing / Documentation / Logging / Modeling and SaaS / Libraries / Frameworks / Gateways. No monitoring category, and the list is about *designing* REST APIs. | **Skipped** — no section where a changelog watcher belongs |
| `crazy-canux/awesome-monitoring` | 756 | `CONTRIBUTING.md`: "Make sure one tool/plugin/addon shoud have the official website **and source code website**". | **Skipped** — Breaklytix is closed source, so it fails the stated rule |
| `adriannovegil/awesome-observability` | 723 | `contributing.md` → "What Belongs Here: **Open source** tools, projects, libraries, frameworks, and standards". Categories are metrics/logs/traces APM. | **Skipped** — closed source, and it collects no telemetry |

## Evidence

- Kikobeats section list: `Design, Caching, Security, Format, Discover, Testing,
  Documentation, Logging, Modeling and SaaS, Libraries, Frameworks, Gateways`
  (grepped from `README.md`, 2026-10-29).
- crazy-canux `CONTRIBUTING.md` line 8: "Make sure one tool/plugin/addon shoud
  have the official website and source code website."
- adriannovegil `contributing.md`, "What Belongs Here", bullet 1: "Open source
  tools, projects, libraries, frameworks, and standards related to the topic of
  this list."
- yosriady `README.md` §API Monitoring already contains
  `[Runscope](https://www.runscope.com/): API Performance Monitoring.` and
  `[Ping-API](https://ping-api.com/): Automated API Testing.` — i.e. commercial
  tools are accepted, and this section is not alphabetical (append order).

## Files

- `awesome-api-devtools.patch` — the exact diff, one added line.
- `awesome-api-devtools-pr.md` — PR title + body, including the author
  disclosure. Posted as PR #236.

## Opening (done)

Done on 2026-10-29: fork created under `Hashirattari11`, branch `add-breaklytix`
pushed (commit `32a6bc4`), PR opened with the body above:
**https://github.com/yosriady/awesome-api-devtools/pull/236**

Next: wait for the maintainer. No follow-up email — GitHub notifications are the
channel, and the list has no published editorial inbox. If merged, record the
live URL in `backlink-agent/data/prospects.csv` (`link_url`) so the weekly
`--check-links` run can verify the href.


## If it is rejected

That is a valid outcome, not a failure. Do not re-submit the same entry; the
next move is the editorial route (`console.dev`, `changelog.com/news/submit`),
which needs the `/demo` asset first.
