# PR: Add Breaklytix to API Monitoring

**Target:** `yosriady/awesome-api-devtools`
**Branch:** `add-breaklytix` (from `master`, commit `3df480f`)
**Diff:** one added line in `## API Monitoring`

## Title

```
Add Breaklytix to API Monitoring
```

## Body

```markdown
Adds Breaklytix to the API Monitoring section.

- Site: https://breaklytix.site/
- What it does: monitors third-party API provider changelogs, detects breaking
  changes, and maps their impact to the files in connected GitHub repositories.
- **Disclosure: I am the author of Breaklytix, so this is a self-submission.**

Why it belongs here: the list already covers tools that surface breaking API
changes (Optic CI, under API Testing) and services that monitor APIs
(Runscope, Ping-API). Breaklytix covers the upstream side of the same problem —
the provider's changelog rather than runtime traffic.

It is not a runtime APM: it does not collect metrics, traces or latency. If you
consider that a requirement for this section, closing this PR is a fair call.

Placement keeps the existing format (`- [Name](url): Description.`) and is
appended to the end of the section, which is not alphabetical.

Happy to adjust the wording or move it to a different section.
```

## Checklist (filled from their README, since there is no CONTRIBUTING.md)

- [x] One resource, one PR
- [x] Format matches the section: `- [Name](url): Description.`
- [x] Appended to the end of the relevant section (section is in insertion order)
- [x] Description is factual and copied from the site's own meta description
- [x] No tracking parameters, canonical URL `https://breaklytix.site/`
- [x] Link returns HTTP 200 (checked 2026-10-29)
- [x] Author disclosed in the PR body
- [ ] Fork + push + open PR — **waiting for approval**
