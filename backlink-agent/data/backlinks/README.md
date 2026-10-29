# Backlink CSV exports (optional)

`competitor_gap.py` reads every `*.csv` in this folder. Drop an export from
Ahrefs, Semrush, Moz, or any tool that lists backlinks, and it will find the
domains that link to a competitor but not to you.

Column names are matched case-insensitively and several spellings are accepted:

| Meaning | Accepted column names |
|---|---|
| Page that contains the link | `source_url`, `source`, `from`, `referring_page`, `referring_url`, `url`, `page` |
| Page being linked to | `target_url`, `target`, `to`, `destination`, `linked_page`, `target_domain` |

Comma-separated and tab-separated files both work. Only rows whose target
matches an entry in `competitor_domains` are used, and domains that already
link to you are removed automatically if you also export your own backlinks to
`data/my_backlinks.csv` (same columns).

If this folder is empty, the gap step is skipped with a log line - it never
guesses.

Nothing here is committed: backlink exports are account data.
