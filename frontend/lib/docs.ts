// Breaklytix documentation registry — REAL features only.
// Structured content blocks (no external markdown dependency):
//   h: heading, p: paragraph, ul: bullet list, code: pre-formatted block, tip: callout

export type DocBlock =
  | { t: "h"; x: string }
  | { t: "p"; x: string }
  | { t: "ul"; x: string[] }
  | { t: "tip"; x: string }
  | { t: "code"; x: string };

export type DocArticle = {
  slug: string;
  title: string;
  section: string;
  order: number;
  summary: string;
  content: DocBlock[];
  related?: string[];
  /**
   * Authoritative out-of-site documentation for the concepts in the article
   * (provider changelogs, API versioning docs, specifications). Rendered as a
   * "Further reading" list with real <a href> elements, so readers and answer
   * engines can follow the primary source instead of trusting a summary.
   */
  sources?: { label: string; href: string }[];
  /**
   * Optional question/answer pairs. Rendered as <h3>/<p> pairs and emitted as
   * schema.org FAQPage JSON-LD, so search engines and AI answer engines can
   * lift the answers out of the page. Ground every answer in a real feature.
   */
  faq?: { q: string; a: string }[];
};

export const DOC_SECTIONS: { name: string; blurb: string }[] = [
  { name: "Getting Started", blurb: "What Breaklytix watches, how alerts work, and your first scan." },
  { name: "Guides", blurb: "Concept guides to API change monitoring, written to be useful on their own." },
  { name: "Authentication & GitHub", blurb: "Sign in securely with GitHub and connect your repositories." },
  { name: "Provider Monitoring", blurb: "Which APIs we monitor for breaking changes." },
  { name: "Runtime Intelligence", blurb: "Runtime health signals — findings, incidents, anomalies and rate limits." },
  { name: "Code Break Detection", blurb: "Static analysis that finds where provider changes hit your code." },
  { name: "Impact Engine", blurb: "See what a breaking change means for your repos — and fire drills." },
  { name: "Alerts & Notifications", blurb: "Email and bell alerts, preferences, and the weekly digest." },
  { name: "Agency Mode", blurb: "Manage external clients that install Breaklytix on their repos." },
  { name: "CLI & Integrations", blurb: "The developer CLI and Slack integration." },
  { name: "Settings & Security", blurb: "Profile, API keys, security model, and legal policies." },
  { name: "Billing & Plans", blurb: "Plans, monitored-API limits, and invoice details." },
  { name: "Troubleshooting & FAQ", blurb: "Common issues, error messages, and how to get help." },
];

export const DOCS: DocArticle[] = [
  // ─────────────────────────── Getting Started ───────────────────────────
  {
    slug: "overview",
    title: "What is Breaklytix?",
    section: "Getting Started",
    order: 1,
    summary: "Breaklytix detects the third-party APIs your code uses and alerts you the moment a provider ships a breaking change.",
    related: ["quickstart", "sign-in", "providers"],
    content: [
      { t: "p", x: "Every product depends on APIs it does not control. Stripe changes a response field, GitHub retires an API version, OpenAI shuts down a model snapshot, and a build that passed yesterday can fail today without a single line of your code changing. The announcement is usually public, but it is buried in a provider changelog written for that provider's users, on that provider's schedule." },
      { t: "p", x: "Breaklytix closes that gap. It reads the third-party APIs your repositories actually use, watches the official changelogs of 44 providers, and turns a relevant change into an alert that names the files and lines you need to review. The goal is not another dashboard of everything that changed. It is a short list of changes that can affect your code." },
      { t: "h", x: "What Breaklytix does" },
      { t: "ul", x: [
        "Provider monitoring: polls official changelogs, release notes and release feeds for 44 APIs across payments, communication, AI, cloud, databases, analytics and developer tools.",
        "Repository scanning: static analysis maps the SDKs, REST endpoints, environment variables and package versions your code uses. It reads source files; it does not execute them.",
        "Code break detection: matches a provider change against that usage map and points to the exact file and line that calls the affected surface.",
        "Impact analysis: estimates the blast radius of a change across repositories, files and call sites, and supports dry runs with the fire drill.",
        "Runtime intelligence: health scores, high-severity reliability findings, provider incidents for five status feeds, and GitHub rate-limit snapshots.",
        "Auto-fix PRs: for mechanical changes only, Breaklytix can propose a pull request. Nothing is merged automatically.",
        "Agency mode: consultancies can monitor client repositories through their own GitHub App installation.",
      ] },
      { t: "h", x: "What Breaklytix is not" },
      { t: "p", x: "It is not an uptime monitor, an API gateway or a replacement for your test suite. Static analysis can miss a URL assembled at runtime, a client generated at build time, or a call hidden behind a dynamic import. Runtime intelligence is separate from static analysis and only reports data that has actually been collected. When there is not enough data, the product says so instead of inventing a number." },
      { t: "h", x: "How it fits your workflow" },
      { t: "ul", x: [
        "Connect GitHub and scan a repository to build the first usage map.",
        "Review potential breaks, deprecated APIs and SDK findings, then decide what to fix.",
        "Choose whether breaking-change alerts and the weekly digest reach your inbox; every alert stays in the dashboard.",
        "Use impact analysis and the deploy-day checklist when a provider announces a breaking change.",
        "Approve an auto-fix pull request only when the proposed diff is a reviewed, mechanical change.",
      ] },
      { t: "tip", x: "Start with one repository. A single scan is enough to see whether Breaklytix recognises the APIs you depend on before you connect more code." },
      { t: "p", x: "The next step is the quickstart, which walks from GitHub sign-in to your first scan and alert." },
    ],
    faq: [
      { q: "Does Breaklytix need access to my source code?", a: "It reads the repositories you connect so it can detect API usage. Files are processed for static analysis; your code is not executed, and detected secret-shaped strings are redacted before they are stored or displayed." },
      { q: "How many providers does Breaklytix monitor?", a: "44 providers, each tracked from its own official changelog, release notes or release feed. The public providers page lists every source." },
      { q: "Is Breaklytix a replacement for tests or observability?", a: "No. It finds a specific class of problem earlier: a third-party interface change that your tests may not cover. Keep your tests and your observability; use Breaklytix to shorten the gap between a provider announcement and a code review." },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    section: "Getting Started",
    order: 2,
    summary: "From GitHub sign-in to your first repository scan and alert in about five minutes.",
    related: ["sign-in", "repository-scanner", "alerts"],
    content: [
      { t: "p", x: "This walkthrough takes one repository from connection to first scan. You need a GitHub account with a verified email, access to at least one repository, and permission to authorize an OAuth app for that account." },
      { t: "h", x: "1. Sign in with GitHub" },
      { t: "p", x: "Open the login page and choose Sign in with GitHub. GitHub asks you to authorize Breaklytix. The app requests read:user and user:email for your profile, plus repo so it can read repositories and open a pull request after you approve a specific proposed fix. Breaklytix never sees your GitHub password. After the callback, the backend stores an encrypted GitHub token and issues a signed session token that the browser keeps in local storage." },
      { t: "p", x: "On first sign-in you are asked to accept the Privacy Policy and Terms. A verified email is required because alert emails and account notices go to that address." },
      { t: "h", x: "2. Connect a repository" },
      { t: "p", x: "Open the Repository Scanner under Code Break Detection. Choose the repository you want to inspect. If the repository is not in the list, reconnect GitHub from Settings → General and confirm that the account has access to it." },
      { t: "h", x: "3. Run your first scan" },
      { t: "p", x: "Select the repository and choose Scan now. The scanner fetches the repository, analyses supported source files, detects API usage, checks SDKs and dependencies, reviews reliability signals and builds a health report. A scan reads up to 1,500 files of up to 400 KB each. When it finishes you get the number of files scanned, the number of detections and the APIs that were recognised." },
      { t: "h", x: "4. Read the results" },
      { t: "ul", x: [
        "Repository Scanner shows the scan history and the APIs detected in the selected repository.",
        "Potential Breaks lists higher-risk findings with the file and line that calls the affected surface.",
        "Deprecated APIs shows endpoints, versions and SDK methods that a provider has already marked for retirement.",
        "SDK checks and reliability findings catch outdated clients and risky call patterns that are not tied to a single changelog entry.",
      ] },
      { t: "p", x: "A finding is a candidate, not proof. Review the call site before changing code, especially when the endpoint is assembled dynamically." },
      { t: "h", x: "5. Choose your alerts" },
      { t: "p", x: "Open Settings → Notifications. The page lists ten preference categories, but only two currently control email: Breaking change alerts and the Weekly digest. The other switches are saved as preferences and do not gate a separate category email. Scan-result, welcome, agency-invite and test messages are transactional. Use Settings → Email to send a test message and confirm the delivery path before you rely on alerts." },
      { t: "h", x: "What happens next" },
      { t: "p", x: "The production pipeline runs once a day at 06:00 UTC: it fetches provider changelogs, processes new entries into classified events, matches them against your scanned code, and runs the daily repository scan. A change that matches your code creates an alert; a change that does not match is still stored and labelled, but it does not page anyone." },
      { t: "tip", x: "If the scanner finds nothing, confirm that the repository uses a provider in the monitoring registry. A repository that only calls an internal API will not produce third-party findings." },
    ],
    faq: [
      { q: "Do I need a credit card to start?", a: "No. Every plan starts with a 10-day free trial, and the trial does not require a credit card." },
      { q: "How long does the first scan take?", a: "Most repositories finish in well under a minute. Large repositories take longer because the scanner reads more files; the per-scan limits are 1,500 files and 400 KB per file." },
    ],
  },
  {
    slug: "breaking-api-changes",
    title: "What counts as a breaking API change?",
    section: "Getting Started",
    order: 3,
    summary: "The six categories of change that break integrations, real examples from common providers, and how to catch them before production.",
    related: ["providers", "code-breaks"],
    content: [
      { t: "p", x: "A breaking API change is any change to a provider's interface that can make code that worked yesterday fail, misbehave, or return different data today — without the calling code changing at all. The dangerous property is the asymmetry: nothing in your repository changes, so nothing in your build, tests, or code review catches it." },
      { t: "h", x: "The six categories that break real integrations" },
      { t: "ul", x: [
        "Removed or renamed endpoints: a path stops existing, or moves from /v1/charges to /v2/payments. Calls return 404 immediately.",
        "Removed response fields: a property your code reads is no longer returned. A strict parser throws; a loose one silently writes null into your database.",
        "New required parameters or headers: the call starts returning 400 because an argument you never sent is now mandatory.",
        "Authentication changes: an API key scheme is replaced by OAuth, a signing algorithm changes, or a header is renamed.",
        "API version retirement: a dated version keeps working until a shutdown date, then returns errors for everyone still on it.",
        "Semantic changes: the field still exists and the type is unchanged, but the meaning or unit changed — cents to dollars, a timestamp becoming a string, pagination defaulting differently.",
      ] },
      { t: "p", x: "The first five produce loud failures. The sixth produces silent corruption, which is why it is worth tracking alongside the obvious ones." },
      { t: "h", x: "How providers actually ship these changes" },
      { t: "p", x: "Most large API providers publish changes continuously rather than on a release cadence, and each has its own mechanism for signalling risk:" },
      { t: "ul", x: [
        "Stripe publishes a dated changelog and keeps old API versions alive per account, so the break arrives when an account upgrades its version or when an old version is retired.",
        "GitHub versions its REST API by date through the X-GitHub-Api-Version header and announces sunset dates in its changelog.",
        "OpenAI retires model snapshots on a published schedule, so a pinned model name can stop resolving even though your request shape never changed.",
        "Slack and Twilio change response payloads and auth requirements through their developer changelogs, often with a deprecation window rather than a hard cutover.",
        "AWS ships service-level release notes per product, which means one repository can depend on several independent change streams at once.",
      ] },
      { t: "p", x: "The common thread: the announcement is public, but it is published by the provider, in the provider's format, on the provider's schedule. Nobody on your team is subscribed to forty of them." },
      { t: "h", x: "Why dependency updates do not cover it" },
      { t: "p", x: "Lockfile updates and Dependabot-style alerts track the SDK package you install. They do not track the remote service that package talks to. A pinned SDK version is entirely compatible with a server that has already removed the endpoint that SDK calls — which is why an integration can break with no dependency change, no commit, and no failing build." },
      { t: "h", x: "How to catch breaking changes before production" },
      { t: "ul", x: [
        "Pin the provider API version explicitly and record the retirement date somewhere a human will see it.",
        "Subscribe to every provider changelog your code touches — and route it to a place the on-call engineer actually reads.",
        "Add contract tests that assert the response fields you depend on, so a removed field fails a test instead of a customer request.",
        "Keep an inventory of which repositories call which endpoints, so an announcement can be turned into a list of files to change.",
        "Automate the matching step: static analysis of your code against the changelog feed, which is exactly what Breaklytix does.",
      ] },
      { t: "h", x: "How Breaklytix classifies a change" },
      { t: "p", x: "Breaklytix normalises each provider entry into a change type — breaking change, deprecation, API version change, endpoint change, request or response schema change, authentication change, SDK change, rate limit change or behaviour change — and assigns a severity. It then matches the entry against the providers, SDKs, environment variable names and endpoint strings detected in your repositories. An entry that matches produces an alert with the affected files and lines; an entry that does not match is still recorded, but it does not page anyone." },
      { t: "tip", x: "An unmatched alert is not a guarantee of safety. It means Breaklytix found no detected usage of the changed surface in the repositories you connected — a dynamic call built from a string at runtime can hide from static analysis." },
      { t: "p", x: "See the list of monitored providers and their official changelog sources, or read how the changelog pipeline classifies and deduplicates entries." },
    ],
    faq: [
      { q: "Is a deprecation the same as a breaking change?", a: "No. A deprecation announces that something will stop working later; a breaking change is the point where it stops. Deprecations matter because they are the last warning before the break, so Breaklytix tracks both and treats a deprecation with a shutdown date as high priority." },
      { q: "Can a breaking change break code that does not use the changed endpoint?", a: "Yes, indirectly. Shared SDKs, shared auth middleware and shared response parsers mean a change to one endpoint can affect call sites that never touched it. That is why impact is scored against the repository as a whole rather than a single file." },
      { q: "Do I need to upgrade my API version to be affected?", a: "Not always. Versioned APIs only protect you while your pinned version is supported. When a provider retires that version, every account still on it is affected at the same time, regardless of what your code does." },
      { q: "How quickly does Breaklytix notice a change?", a: "Provider sources are checked on the daily 06:00 UTC pipeline and deduplicated by a stable fingerprint. The delay between a provider publishing an entry and an alert being created is bounded by that daily cadence, not by a human reading changelogs. An on-demand repository scan runs immediately and reports what it finds." },
      { q: "What is the difference between a code break and an API error?", a: "A code break is a static mismatch between your source and a changed interface, found before or after the change ships. An API error is a runtime signal that calls are currently failing. Breaklytix reports both, in Code Break Detection and Runtime Intelligence respectively." },
    ],
  },

  // ─────────────────────── Authentication & GitHub ───────────────────────
  {
    slug: "sign-in",
    title: "Sign in and connect GitHub",
    section: "Authentication & GitHub",
    order: 1,
    summary: "How GitHub OAuth works in Breaklytix, which permissions are requested, and how to reconnect or sign out.",
    related: ["repository-scanner", "settings"],
    content: [
      { t: "p", x: "Breaklytix uses GitHub OAuth as its only sign-in method. There is no Breaklytix password to create, reset or leak. The account you authorize is the account that owns your repositories, alerts and billing record." },
      { t: "h", x: "What happens when you sign in" },
      { t: "ul", x: [
        "The login page redirects to GitHub with a one-time state value stored in the browser session.",
        "GitHub asks you to authorize the Breaklytix OAuth app and then redirects back to /auth/callback.",
        "The backend exchanges the temporary code for a GitHub access token and reads your GitHub profile and verified email.",
        "The GitHub token is encrypted with Fernet before it is stored. It is never returned to the browser.",
        "The backend issues a signed session token valid for 30 days; the frontend keeps it in browser storage.",
        "On first sign-in you accept the Privacy Policy and Terms before using the dashboard.",
      ] },
      { t: "h", x: "Permissions requested" },
      { t: "p", x: "The OAuth app requests three scopes: read:user, user:email and repo. The first two read your public profile and verified email address. The repo scope is broader than read-only: it lets Breaklytix read public and private repositories and open a pull request after you approve a specific proposed fix." },
      { t: "p", x: "That breadth is deliberate. Repository scanning needs to read private source files for private repositories, and auto-fix PRs need permission to create a branch and open a pull request. Breaklytix does not push to a repository, merge a pull request, or change code unless you approve a specific proposed fix." },
      { t: "h", x: "Where the token goes" },
      { t: "ul", x: [
        "The GitHub token is encrypted at rest with TOKEN_ENCRYPTION_KEY and is only decrypted server-side for a scan or an approved fix.",
        "The token is never sent to the browser, placed in a URL, written to an email or included in logs.",
        "The browser only holds the signed session token, which expires after 30 days and can be invalidated by signing out.",
        "Provider API keys you add for monitoring are encrypted the same way and displayed only as masked identifiers.",
      ] },
      { t: "h", x: "Reconnect, sign out and revoke" },
      { t: "ul", x: [
        "Sign in again from the login page if you changed permissions on GitHub or the stored token is no longer valid. The new authorization replaces the old connection.",
        "Signing out clears the session token in this browser. Settings → General places the same sign-out action behind a confirmation; it does not delete your account, repositories, scan history or billing record.",
        "To remove Breaklytix's GitHub authorization entirely, revoke the OAuth app from GitHub → Settings → Applications. The encrypted token on file stops working immediately and scans fail until you sign in again.",
        "Revoking on GitHub is the authoritative disconnect. Breaklytix cannot use a revoked token, and it never receives a new one without your authorization.",
      ] },
      { t: "h", x: "Sign-in troubleshooting" },
      { t: "ul", x: [
        "Private or unverified GitHub email: verify the address on GitHub, then sign in again. Breaklytix requires a verified email for account notices and alerts.",
        "redirect_uri_mismatch: the OAuth app does not have this site's /auth/callback URL registered. Use the canonical https://breaklytix.site/auth/callback address.",
        "Application suspended: the GitHub OAuth app has been suspended; contact support before retrying.",
        "Session expired: sign in again. A 401 from the API usually means the session token is missing or no longer valid.",
      ] },
      { t: "tip", x: "If you work with client repositories through an agency, do not share your personal OAuth token. Agency Mode uses a separate GitHub App installation with its own scoped access." },
    ],
    faq: [
      { q: "Does Breaklytix store my GitHub password?", a: "No. Authentication happens on GitHub. Breaklytix never receives your password; it receives an OAuth access token after you authorize the app." },
      { q: "Why does Breaklytix ask for the repo scope?", a: "The repo scope is required to read private repositories and to open an auto-fix pull request after you approve one. It is broader than read-only, which is why a write only happens after you approve a specific proposed fix." },
      { q: "What happens if I sign out?", a: "Signing out — including the Sign out of this browser action in Settings — clears the session token in this browser and leaves your account, repositories, scan history and billing record intact. To revoke Breaklytix's GitHub authorization completely, revoke the OAuth app on GitHub; scanning stops until you sign in again." },
    ],
  },
  {
    slug: "repository-scanner",
    title: "Repository Scanner",
    section: "Authentication & GitHub",
    order: 2,
    summary: "Static analysis that maps the APIs used in your code and checks them against provider changes.",
    related: ["code-breaks", "impact-overview", "providers"],
    content: [
      { t: "p", x: "The Repository Scanner is the inventory step behind every other feature. It reads a repository and builds a map of the third-party APIs the code uses, then keeps that map fresh so a provider change can be matched to real call sites." },
      { t: "h", x: "What the scanner reads" },
      { t: "ul", x: [
        "Client SDK imports and constructor calls, including the package and version declared in manifests and lockfiles.",
        "Direct REST calls: hostnames, base URLs, endpoint paths and the HTTP method where it can be determined statically.",
        "Environment variable names that commonly hold provider credentials or base URLs.",
        "Deprecated SDK methods, retired API versions and call patterns that a provider has flagged.",
        "Reliability signals such as hard-coded timeouts, missing retry handling and unguarded pagination.",
      ] },
      { t: "p", x: "The scanner does not execute your code. It parses supported source files and inspects symbols, imports and string literals. That keeps scans safe and fast, but it also defines the blind spots described below." },
      { t: "h", x: "How a scan runs" },
      { t: "ul", x: [
        "Choose a repository in the Repository Scanner and select Scan now.",
        "The scanner fetches the repository, analyses files, detects APIs, checks SDKs and dependencies, reviews reliability signals and generates a health report.",
        "The result shows files scanned, detections found and the APIs recognised, followed by the scan history.",
        "On-demand scans run immediately. The daily scan at 06:00 UTC keeps coverage fresh without manual work.",
        "Each scan is limited to 1,500 files of up to 400 KB each; symlinks and oversized files are skipped.",
      ] },
      { t: "h", x: "What the findings mean" },
      { t: "p", x: "A detection is evidence that the code mentions a provider surface, not proof that the surface is used at runtime. A potential break is a match between that evidence and a provider change. A deprecated API finding means the provider has announced a retirement, even if the endpoint still works today. Severity reflects the potential impact and the confidence of the match, not a guarantee that production is broken." },
      { t: "h", x: "Where to go next" },
      { t: "ul", x: [
        "Open Potential Breaks to review the highest-risk matches with file and line links.",
        "Open Deprecated APIs to plan migrations before a shutdown date.",
        "Use the Impact Engine to see how one provider change spreads across repositories and services.",
        "Approve a proposed auto-fix only when the diff is a reviewed, mechanical change.",
      ] },
      { t: "h", x: "Limits and blind spots" },
      { t: "ul", x: [
        "A URL assembled at runtime from user input or configuration may not be visible to static analysis.",
        "Generated clients and code produced during the build can hide the real endpoint strings.",
        "A monorepo may exceed the file limit; scan the service directories that matter most.",
        "Private repositories require the repo scope granted during GitHub sign-in. If a repository is missing, reconnect and confirm the account can see it.",
      ] },
      { t: "tip", x: "Run a scan after a large refactor or a dependency upgrade. The daily scan catches drift, but an on-demand scan gives you an immediate answer." },
    ],
    faq: [
      { q: "Does the scanner send my source code anywhere?", a: "It reads the repository through the GitHub API and processes the files for static analysis. Your code is not executed. Detected secret-shaped strings are redacted before they are stored or displayed." },
      { q: "Why did the scanner miss an API call?", a: "Static analysis cannot see a URL that is assembled at runtime, a client generated during the build, or a call hidden behind a dynamic import. The limits are documented above; use runtime signals and tests to cover those gaps." },
      { q: "How often should I scan?", a: "The daily scan at 06:00 UTC is enough for most repositories. Run an on-demand scan after a refactor, a dependency upgrade or a provider migration." },
    ],
  },

  // ───────────────────────── Provider Monitoring ─────────────────────────
  {
    slug: "providers",
    title: "Monitored providers and changelog pipeline",
    section: "Provider Monitoring",
    order: 1,
    summary: "The 44 APIs Breaklytix tracks, how coverage is decided, and how a changelog entry becomes an alert.",
    related: ["runtime-intelligence", "alerts", "code-breaks"],
    content: [
      { t: "p", x: "Breaklytix monitors 44 third-party APIs across payments, communication, AI, cloud, databases, analytics, media and developer tools. The public provider directory lists every provider with a link to its official changelog source, so you can check coverage before you connect a repository." },
      { t: "p", x: "Coverage is deliberately curated. A provider is added only when there is a stable official source to read and a detection pattern that can be grounded in real API usage. A generic aggregator or a scraped news feed is not enough." },
      { t: "h", x: "What monitored means" },
      { t: "ul", x: [
        "Each provider has a source entry: an official changelog, release notes page or release feed.",
        "The registry is shared by the scanner, the dashboard and the public provider directory. Adding a provider to the registry makes it visible everywhere.",
        "Some providers publish no machine-readable changelog. Those are tracked from the most stable official page available, and a provider that cannot be fetched is reported as an error rather than silently skipped.",
        "Runtime health, incidents and rate limits are separate signals. A provider can be monitored for changelog changes even when runtime data is not available.",
      ] },
      { t: "h", x: "The daily pipeline" },
      { t: "p", x: "The production scheduler runs once a day at 06:00 UTC. The stages run in sequence:" },
      { t: "ul", x: [
        "Fetch: request each provider's official source in parallel, with per-provider isolation so one failed source does not stop the rest.",
        "Normalise and fingerprint: turn each entry into a stable record and deduplicate it, so the same published item is not turned into two alerts.",
        "Classify: assign a change type and a severity using deterministic pattern matching and structured parsing. No language model sits in the monitoring path.",
        "Match: compare the change against the providers, SDKs, environment variable names and endpoint strings detected in your repositories.",
        "Alert: create an alert only when the change matches detected usage. Send a breaking-change email according to your preferences and daily cap, and mirror the alert to Slack when a connection exists.",
      ] },
      { t: "h", x: "How changes are classified" },
      { t: "ul", x: [
        "Breaking change: an interface change that can make existing code fail or behave differently.",
        "Deprecation: a retirement announcement, usually with a shutdown date.",
        "API version change: a new dated version or the retirement of an old one.",
        "Endpoint change: a path added, renamed, moved or removed.",
        "Schema change: a request or response field added, removed or retyped.",
        "Authentication change: a key scheme, signing algorithm or required header changes.",
        "SDK change: a client library changes its API or drops support for a version.",
        "Rate limit or behaviour change: quota, pagination, units or semantics change without the shape changing.",
      ] },
      { t: "h", x: "Matched, unmatched and safe" },
      { t: "p", x: "A matched change has evidence in your code: a detected SDK call, a direct endpoint string, an environment variable or a package version. The alert names the files and lines that call the affected surface. An unmatched change is still stored and labelled, but it does not page anyone, because there is no detected usage to act on." },
      { t: "tip", x: "Unmatched is not the same as safe. A URL assembled at runtime, a generated client or a call hidden behind a dynamic import can evade static analysis. Treat an unmatched change as a prompt to check the areas static analysis cannot see." },
      { t: "h", x: "Coverage gaps" },
      { t: "p", x: "Coverage is additive. If a provider you depend on is missing, tell us which one and which official source it publishes. The registry is designed to grow without changing the scanner's matching model, so a new provider becomes available to every connected repository." },
    ],
    faq: [
      { q: "How many providers does Breaklytix monitor?", a: "44 providers, each tracked from its own official changelog, release notes or release feed. The public providers page lists every source." },
      { q: "How often are changelogs checked?", a: "The production pipeline runs once a day at 06:00 UTC: fetch, normalise and deduplicate, classify, match against your code, then alert. On-demand repository scans run immediately and use the latest stored events." },
      { q: "What happens if a provider source fails?", a: "The fetch is isolated per provider. A failed source is reported in the monitoring status instead of being treated as no changes, so a temporary outage does not silently hide a breaking change." },
    ],
  },

  // ───────────────────────── Runtime Intelligence ─────────────────────────
  {
    slug: "runtime-intelligence",
    title: "Runtime Intelligence",
    section: "Runtime Intelligence",
    order: 1,
    summary: "Runtime health signals for the APIs you depend on: scores, high-severity findings, incidents for five providers, and GitHub rate limits.",
    related: ["providers", "alerts", "code-breaks"],
    content: [
      { t: "p", x: "Static analysis answers a different question from runtime monitoring. Code Break Detection tells you what could break when a provider changes; Runtime Intelligence reports what has actually been collected about the APIs you depend on. The two views are deliberately separate, because a runtime signal is not always a code break and a code break does not always produce an immediate error." },
      { t: "h", x: "Health overview" },
      { t: "p", x: "The health overview combines the signals collected for your connected repositories into a score from 0 to 100. The label follows the score: Excellent (90+), Healthy (75–89), Warning (50–74), At Risk (25–49) and Critical (below 25). The score is a summary, not a guarantee; open the underlying page before you act on a single number." },
      { t: "h", x: "API errors and failures" },
      { t: "ul", x: [
        "API Errors lists open reliability findings with critical or high severity, excluding provider incidents. It is a filtered view of recorded findings, not a live error stream.",
        "Failures groups open findings into code-side and provider-side categories: customer_code, customer_usage, configuration and provider_incident.",
        "Each finding can be marked resolved so the list reflects what is still open.",
        "When a finding and a provider incident coincide, check the incident before changing your code.",
      ] },
      { t: "h", x: "Provider incidents" },
      { t: "p", x: "Breaklytix collects incidents from the official status feeds of five providers: Stripe, OpenAI, GitHub, Twilio and SendGrid. The feed is refreshed during a repository scan when that provider is detected in the repository, so it is scan-fresh rather than continuously streamed. Stripe's Atom feed is stored as reported; the Statuspage providers expose investigating, identified, monitoring and resolved. The incidents view is scoped to providers detected in the selected repository." },
      { t: "h", x: "Rate limits and quota" },
      { t: "ul", x: [
        "Every repository scan records a real GitHub rate-limit snapshot: remaining requests, the limit and the reset window.",
        "The rate-limit timeline shows each snapshot and highlights usage at or above 80% of the limit.",
        "Use the trend to plan headroom before a batch job or a large scan exhausts the quota.",
        "Rate-limit events are evidence from collected snapshots, not a prediction of future usage.",
      ] },
      { t: "h", x: "Anomalies" },
      { t: "p", x: "The Anomalies view is a filtered list, not a statistical anomaly detector. It shows open reliability findings whose computed risk level is high or critical, sorted by risk. Use it as the shortlist of highest-risk findings; the underlying records live in the issue list." },
      { t: "h", x: "Honest data policy" },
      { t: "p", x: "Runtime Intelligence only reports data that has actually been collected. When a provider has not produced a snapshot yet, the section says Not available or No data yet instead of showing a fabricated zero. This matters more than a full-looking dashboard: a fake green score is worse than an honest blank." },
      { t: "tip", x: "Runtime signals are not a replacement for your own observability. Keep your application metrics and traces; use Breaklytix to connect provider-side incidents and GitHub rate-limit pressure to the repositories that depend on them." },
    ],
    faq: [
      { q: "Why does a provider show Not available?", a: "Breaklytix has not collected a runtime snapshot for that provider yet. The product deliberately shows an honest blank instead of inventing a score or an error rate." },
      { q: "How often is runtime data refreshed?", a: "Provider incidents and GitHub rate-limit snapshots are refreshed when a repository is scanned. The daily 06:00 UTC scan refreshes them for repositories whose providers are detected. There is no continuous runtime polling between scans." },
      { q: "Does Runtime Intelligence replace uptime monitoring?", a: "No. It complements uptime monitoring by connecting provider incidents and GitHub rate-limit pressure to the code that depends on those APIs. Keep your existing uptime and observability tools." },
    ],
  },

  // ───────────────────────── Code Break Detection ─────────────────────────
  {
    slug: "code-breaks",
    title: "Code breaks, deprecations and auto-fix PRs",
    section: "Code Break Detection",
    order: 1,
    summary: "How Breaklytix finds the code a provider change affects, and when it can propose a reviewed pull request.",
    related: ["repository-scanner", "impact-overview", "alerts"],
    content: [
      { t: "p", x: "Code Break Detection answers one question: if this provider change reaches production, which lines of my code are exposed? It combines the usage map built by the Repository Scanner with the provider events collected by the changelog pipeline, then records a finding for every match it can ground in source code." },
      { t: "h", x: "The three finding types" },
      { t: "ul", x: [
        "Potential breaks: a provider announced a change that can alter or remove behaviour, and the scanner found code using the affected surface. This is the highest-signal list.",
        "Deprecated APIs: your code uses an endpoint, version, parameter or SDK method that the provider has marked for retirement. It may still work, but it has a deadline.",
        "SDK and reliability findings: an outdated client library, a call pattern the SDK now warns about, or a reliability issue such as a missing timeout or an unguarded retry.",
      ] },
      { t: "h", x: "From changelog entry to code finding" },
      { t: "ul", x: [
        "The daily pipeline classifies a provider entry and extracts the affected surface: an endpoint, a field, an SDK method, an API version or an authentication scheme.",
        "The matcher compares that surface with the provider detections recorded for each repository: SDK imports, direct endpoint strings, environment variable names and package versions.",
        "A match becomes a finding with the file, line, symbol, severity and a link to the provider's published entry.",
        "A change with no detected usage is stored but not turned into a finding, because there is nothing in your code to act on.",
      ] },
      { t: "h", x: "Deprecated does not mean broken yet" },
      { t: "p", x: "A deprecation is an announcement with a horizon: the provider still serves the surface today and will stop at a published date, or after a migration window. Treat the deprecation list as a plan, not an outage. The most useful move is to schedule the migration while the old surface still works, so the shutdown date is not the first time the team looks at it." },
      { t: "p", x: "A potential break is different. The provider has described behaviour that can fail on a version you may already be using, so severity depends on the API version your account and requests actually use. Stripe, for example, pins an account to a dated API version; an entry may describe behaviour that is only active on a newer version. Check the version before you assume the worst." },
      { t: "h", x: "Severity and confidence" },
      { t: "ul", x: [
        "Severity is the potential impact if the finding is real: critical, high, medium or low.",
        "Confidence reflects how strong the static evidence is, not how likely the provider is to ship the change.",
        "A critical finding with high confidence is the first thing to review. A medium finding with low confidence is a prompt to check, not a merge blocker.",
        "Every finding names the provider, the change type, the affected surface and the source entry, so the reasoning is inspectable.",
      ] },
      { t: "h", x: "Auto-fix pull requests" },
      { t: "p", x: "Some changes are mechanical: a renamed method, a moved argument, a retired call with a documented replacement. For those, Breaklytix can prepare a fix from a hand-curated rule and, after approval, open a real GitHub pull request." },
      { t: "ul", x: [
        "Rules are authored and versioned by hand. There is no language model generating code in the auto-fix path.",
        "A fix moves through pending, needs_review, pr_created, merged or rejected. Only needs_review and pending fixes can be approved.",
        "On approval, Breaklytix fetches the current file, applies a deterministic replacement, validates the resulting syntax and opens the pull request on a fresh branch. If validation fails, no PR is created.",
        "Nothing is merged automatically. The pull request is a normal reviewable diff that your team can change or close.",
        "Rules cover a deliberately small set of well-documented migrations. A finding with no matching rule still appears; it just needs a human fix.",
      ] },
      { t: "h", x: "Reviewing a finding well" },
      { t: "ul", x: [
        "Open the provider's source entry before reading the code. Confirm what changed and on which version.",
        "Check the call site. A static match can point at a helper rather than the production path.",
        "Decide whether the code is actually exposed. A test-only or dead-code usage is lower priority than a request path.",
        "If a fix is proposed, read the diff and run your tests. Syntax validation is not a behavioural guarantee.",
        "Mark the finding resolved or ignored so the list reflects reality. An ignored finding is a decision, not a disappearance.",
      ] },
      { t: "tip", x: "Do not treat a green Code Break Detection page as proof that a provider change is harmless. Static analysis cannot see a URL assembled at runtime or a client generated during the build. Use it to focus review, not to skip it." },
    ],
    faq: [
      { q: "Does Breaklytix change my code automatically?", a: "No. It can prepare a fix and, after you approve it, open a pull request. Nothing is written to your default branch and nothing is merged automatically." },
      { q: "Why does a deprecated API still work?", a: "A deprecation is a retirement announcement with a future date or migration window. The surface keeps working until the provider removes it, which is why the finding is a planning item rather than an outage." },
      { q: "What is the difference between a potential break and a code break?", a: "A potential break is a static match between a provider change and detected usage; it is a candidate. A confirmed break is one your team has verified at the call site or observed at runtime. Breaklytix labels the evidence it has and does not pretend a candidate is confirmed." },
      { q: "Can I disable auto-fix PRs?", a: "There is no repository-level auto-fix switch. Auto-fix is approval-based: a proposed fix does nothing until you approve that specific fix from the dashboard. Dismissing or ignoring a fix means no branch or pull request is created." },
    ],
  },

  // ───────────────────────── Impact Engine ─────────────────────────
  {
    slug: "impact-overview",
    title: "Impact Engine, fire drills and deploy day",
    section: "Impact Engine",
    order: 1,
    summary: "Estimate the blast radius of a provider change, rehearse it with a fire drill, and work a deploy-day checklist.",
    related: ["code-breaks", "alerts", "repository-scanner"],
    content: [
      { t: "p", x: "A code break tells you that one repository is exposed. The Impact Engine answers the next question: across everything you run, how much does this provider change actually matter, and in what order should you fix it?" },
      { t: "p", x: "It takes a specific changelog event and analyses it against a repository's detected API usage. The output is an impact record: affected files, affected SDK packages, a severity, a confidence score, an explanation of the expected behaviour, and a verification status." },
      { t: "h", x: "What an impact analysis contains" },
      { t: "ul", x: [
        "Provider, change type, the affected endpoint or surface, and a link to the provider's published source.",
        "Affected files with the line and matched field that produced the match.",
        "Affected SDKs, when the repository depends on a client package tied to the provider.",
        "Severity (critical, high, medium or low) and a confidence score between 0 and 1.",
        "Expected behaviour and potential failure, written from the change type rather than invented per repository.",
        "A verification status that says how strong the evidence is.",
      ] },
      { t: "h", x: "Verification status is the honesty layer" },
      { t: "ul", x: [
        "verified: the event matched real repository usage and the match is strong — an endpoint or SDK match, or a hard removal or rename that the code directly references.",
        "potential: usage matched, but the version or endpoint specifics could not be confirmed. This is the most common result and the most useful one to review manually.",
        "not_found: no repository usage matched the event. The change is real, but this repository shows no evidence of exposure.",
        "unknown: the event itself could not be interpreted well enough to judge.",
      ] },
      { t: "p", x: "The status exists because a plausible-looking impact report is easy to fake. A row that says verified without evidence is worse than a row that admits it is potential. Use the status to decide how much of your afternoon the finding deserves." },
      { t: "h", x: "The fire drill" },
      { t: "p", x: "A fire drill is a dry run. Instead of waiting for a provider to ship a breaking change, you ask what would happen if it did, using the provider's recorded events and your repository's real detections." },
      { t: "ul", x: [
        "Single-provider drill: analyse one repository against one provider's recent changelog events.",
        "Matrix drill: classify every monitored provider for a repository in one pass — active (usage detected and a recent event exists), at_risk (usage exists but no recent event), unknown (events exist but no usage was found), inactive (neither).",
        "A drill never changes code, opens a pull request or sends a customer-facing alert. It produces an impact record you can read, share and act on.",
        "Run a drill before a migration window, after onboarding a large repository, or when you want to know whether a provider you just added is actually used.",
      ] },
      { t: "p", x: "The matrix is also a coverage check. A provider marked at_risk is one you depend on but have no recent event for — not a problem, just a statement that the dependency exists. A provider marked unknown is the opposite: events are being collected, but the scanner found no usage. That is worth a look if you expected the repository to use it." },
      { t: "h", x: "Deploy day" },
      { t: "p", x: "When a breaking change is real and the migration date has arrived, the work is mostly sequencing. A practical order:" },
      { t: "ul", x: [
        "Open the alerts and impact summaries for the affected provider. Confirm which repositories are verified and which are only potential.",
        "Fix critical and high findings first. They are the ones most likely to be merge blockers or production failures.",
        "Review proposed auto-fix pull requests as normal diffs. Merge the safe ones; rewrite or reject the rest.",
        "Re-run the repository scanner and the provider's checks to confirm the new state.",
        "Record what changed. A short migration note in your team channel or runbook is worth more than a dashboard screenshot.",
      ] },
      { t: "h", x: "What the Impact Engine cannot tell you" },
      { t: "ul", x: [
        "It cannot see runtime behaviour. A verified match means the code references the surface; it does not prove the path executes in production.",
        "It cannot price the fix. Severity reflects potential breakage, not engineering hours.",
        "It cannot see what static analysis misses: URLs built at runtime, generated clients and dynamic imports.",
        "It cannot make a provider change safe. It can only shorten the time between the announcement and a decision.",
      ] },
      { t: "tip", x: "Use the fire drill as a rehearsal, not a score. The value is in finding the repository you forgot was using that provider, not in a green matrix." },
    ],
    faq: [
      { q: "Does a fire drill affect production?", a: "No. It analyses stored changelog events against detected usage and writes an impact record. It does not change code, create branches or send alerts." },
      { q: "What does at_risk mean in the fire-drill matrix?", a: "The repository has detected usage of that provider, but no changelog event was recorded for it in the last year. It means the dependency exists and there is no recent known change, not that the integration is broken." },
      { q: "Why is an impact analysis marked potential instead of verified?", a: "Usage matched, but the endpoint or provider version could not be confirmed strongly enough. Review the call site and the provider's version before treating it as a confirmed break." },
    ],
  },

  // ───────────────────────── Alerts & Notifications ─────────────────────────
  {
    slug: "alerts",
    title: "Alerts, notifications and email delivery",
    section: "Alerts & Notifications",
    order: 1,
    summary: "How alerts are created, how email delivery works, and how Slack mirrors matched breaking-change alerts.",
    related: ["providers", "runtime-intelligence", "settings"],
    content: [
      { t: "p", x: "An alert is the product's decision that something deserves your attention. It is created when a breaking provider change matches detected usage in your code, or when a reliability finding reaches high or critical severity. Everything else stays in the dashboard as history." },
      { t: "h", x: "The alert lifecycle" },
      { t: "ul", x: [
        "Open: the default state. The bell in the dashboard counts open alerts, and the Alerts page filters to them by default.",
        "Resolved: you have dealt with it. The alert stays in history and stops appearing in the open list.",
        "Ignored: you have decided it does not apply. It is a deliberate dismissal, not a deletion.",
        "Each alert carries a severity, the affected repository, the provider and change details. Provider-change alerts link to the published source; reliability findings created from scan results may not have an external source URL.",
        "Test alerts are labelled and excluded from your real counts.",
      ] },
      { t: "p", x: "Resolve an alert when the code has changed or you have confirmed it is unaffected. Ignore it when the finding is technically correct but irrelevant to your deployment. Both actions are reversible from the full list; neither deletes the record." },
      { t: "h", x: "Notification categories" },
      { t: "p", x: "Settings → Notifications lists ten preference categories, all on by default. The switches are saved to your account, and every alert remains visible in the dashboard regardless of the email setting. Today only two categories actually gate an email: Breaking change alerts and the Weekly digest. The other eight are stored as preferences and do not currently gate a separate category email." },
      { t: "ul", x: [
        "Breaking change alerts: email when a monitored API ships a change that matches your code and passes the severity and confidence rules.",
        "Weekly digest: a Monday summary of alerts, fixes and monitored APIs. Sent once a week at 09:00 UTC unless the switch is off.",
        "The other eight categories — code breaks, API errors, rate limits, quota, provider incidents, anomalies, auto-fix results and scan results — remain dashboard views. A related transactional message, such as a one-time scan confirmation, is sent regardless of the switch.",
      ] },
      { t: "p", x: "There is no daily status email. Scan-result, welcome, agency-invite and test messages are transactional: they are sent for the action that triggered them, not from the category switches." },
      { t: "h", x: "Caps and deduplication" },
      { t: "ul", x: [
        "A user receives at most five alert emails per day. The cap applies to alert email; the weekly digest is sent on its own weekly schedule and is not blocked by the cap. Alerts beyond the cap still appear in the dashboard.",
        "Identical alert emails are deduplicated within a 60-minute window, so a burst of events does not become a burst of mail.",
      ] },
      { t: "h", x: "Email delivery, honestly" },
      { t: "p", x: "Alert emails are sent through Resend. The status shown in the UI reflects what Breaklytix can actually know: accepted by the provider means Resend accepted the message and returned a message id. Final inbox placement is decided by the recipient's mail provider, so Breaklytix does not claim it." },
      { t: "ul", x: [
        "Failures are categorised: sender configuration, rejected, rate limited, network or unknown.",
        "If the backend has no RESEND_API_KEY or no valid RESEND_FROM_EMAIL, sending fails closed with a clear message instead of pretending the email was sent.",
        "If the sender is still in Resend's sandbox (an @resend.dev address), delivery only reaches the account owner. The UI warns you with a sandbox sender note.",
        "Settings → Email has a Send test email button. Use it before you rely on alerts; it verifies the sender, the provider and the route to your inbox.",
      ] },
      { t: "h", x: "Slack" },
      { t: "p", x: "Settings → Integrations connects the Breaklytix Slack app to a channel. Once connected, breaking-change alerts that match detected usage are mirrored to that channel with the severity, provider, repository, change type and a link to the source. Slack is notification-only: fixes are approved in the dashboard, not from Slack." },
      { t: "ul", x: [
        "Slack delivery is best-effort: if the channel is unreachable, the alert still exists in the dashboard and email delivery is unaffected.",
        "The Slack connection is workspace-specific. Reconnect it if the bot is removed from the channel or the installation is revoked.",
        "Slack mirroring is independent of the email switches. Turning off Breaking change alerts stops the email but does not stop the Slack post.",
      ] },
      { t: "tip", x: "If alerts seem to have stopped, check three things in order: the Breaking change alerts switch in Settings → Notifications, the daily email cap, and the GitHub connection. A revoked GitHub authorization stops matching, so no new alerts are created." },
    ],
    faq: [
      { q: "Will I get an email for every alert?", a: "No. Email is currently sent for breaking-change alerts that match your code, plus the weekly digest. Alert email is capped at five per user per day and deduplicated within a 60-minute window. Every alert remains visible in the dashboard." },
      { q: "Does accepted by provider mean the email reached the inbox?", a: "No. It means Resend accepted the message and returned a message id. Final delivery is handled by the recipient's mail provider, so Breaklytix reports acceptance rather than claiming inbox placement." },
      { q: "Can I send alerts to Slack only?", a: "Slack mirroring is independent of the email switches. If you connect Slack, matched breaking-change alerts are posted there regardless of which email categories are on. The alert remains in the dashboard either way, and Slack delivery is best-effort." },
      { q: "How do I stop a recurring alert?", a: "Resolve it if the code has been fixed, or ignore it if it does not apply. For breaking-change email, turn off Breaking change alerts. For Slack, disconnect the integration. The other categories do not currently gate a separate category email." },
    ],
  },

  // ───────────────────────── Agency Mode ─────────────────────────
  {
    slug: "agency-mode",
    title: "Agency Mode: clients, invites and access",
    section: "Agency Mode",
    order: 1,
    summary: "Run Breaklytix for client repositories through your own GitHub App installation, from invite to revocation.",
    related: ["sign-in", "settings", "alerts"],
    content: [
      { t: "p", x: "Agency Mode is for consultancies, fractional CTOs and managed-service teams that monitor repositories they do not own. The agency keeps one Breaklytix account, invites each client, and connects the client's repositories through the agency's GitHub App installation. The client keeps control of which repositories are shared." },
      { t: "p", x: "The important design decision is separation. Each client's repositories, scans, findings, alerts and fixes are scoped to that client. The agency owner can see every client; a client cannot see another client's data, and the agency does not gain a personal OAuth token for the client's account." },
      { t: "h", x: "Before you invite anyone" },
      { t: "ul", x: [
        "Agency Mode must be enabled on your account. Without the agency flag, the Agency dashboard and the client endpoints return an access error.",
        "The GitHub App must be configured on the backend with an app id, private key and slug. The client installs that app on the repositories it wants monitored.",
        "Your email sender should be production-ready. An invite sent from the Resend sandbox only reaches the account owner, which makes the client invite useless.",
        "Decide who owns the relationship. The invite email says which agency invited the client, using your GitHub login or account email.",
      ] },
      { t: "h", x: "Inviting a client" },
      { t: "ul", x: [
        "Open the Agency dashboard and choose Invite client. Enter a display name and the client's email address.",
        "Breaklytix creates a pending client and sends an email with an authorization link.",
        "The link is single-use and expires after seven days. Only a pending client can be resent; an authorized client must be revoked first.",
        "The invite stores only a SHA-256 hash of the token. The raw token exists in the email link and is never recoverable from the database.",
        "If an invite is already pending or authorized for that email, the request is rejected rather than creating a duplicate client.",
      ] },
      { t: "h", x: "What the client does" },
      { t: "p", x: "The client opens the link, sees which agency invited them, and installs the agency's GitHub App on the repositories they choose. The installation callback is protected by a short-lived signed state, so an installation cannot be bound to the wrong client. When the callback completes, the client moves from pending to authorized, the invite token is invalidated, and the repositories granted to the installation are imported under that client." },
      { t: "ul", x: [
        "The client chooses the repositories in GitHub's own installation screen. The agency cannot silently widen that selection.",
        "Repository access is read through the GitHub App installation token. The agency does not need the client's personal access token.",
        "Once authorized, the client appears in the agency dashboard with its repositories and scan state.",
        "If the client later changes the installation on GitHub, the next scan uses the current installation scope.",
      ] },
      { t: "h", x: "Invite status and email status are different things" },
      { t: "p", x: "Every client row has a status: pending, authorized or revoked. Separately, the invite email has a delivery status reported by the email provider. Accepted by provider means the provider accepted the message and returned an id; it does not mean the client received it. A sandbox sender is called out explicitly, because in that case only the account owner can receive the mail." },
      { t: "h", x: "Revoking access" },
      { t: "ul", x: [
        "Revoking sets the client to revoked, invalidates any outstanding invite and removes stored repository token snapshots.",
        "The client record is kept rather than deleted, so scan and alert history remains auditable.",
        "A revoked authorization link returns a clear message and cannot be reused.",
        "To restore access, invite the client again; revocation is not an undelete.",
      ] },
      { t: "tip", x: "Test the whole chain with one internal client before you invite a real one: send the invite, install the app, confirm the repositories appear, run a scan, then revoke and confirm access is gone." },
    ],
    faq: [
      { q: "Do clients need their own Breaklytix account?", a: "No. The agency owns the Breaklytix account. The client authorizes the agency's GitHub App installation on the repositories they want monitored, and their data stays scoped to that client." },
      { q: "How long does an agency invite last?", a: "Seven days. The link is single-use, and resending an invite replaces the token with a new seven-day link. Only pending clients can be resent." },
      { q: "What happens to a client's data when access is revoked?", a: "Access stops immediately, the invite is invalidated and repository token snapshots are removed. The client record and historical scans remain so the agency can audit what happened." },
      { q: "Can an agency see every client's repositories?", a: "The agency owner can see every client in the agency dashboard, but each repository is bound to its client. The data model keeps client scoping on every query rather than relying on the UI to hide rows." },
    ],
  },

  // ───────────────────────── CLI & Integrations ─────────────────────────
  {
    slug: "cli",
    title: "Developer CLI and Slack integration",
    section: "CLI & Integrations",
    order: 1,
    summary: "Scan from the terminal with the Breaklytix CLI, and route alerts into a Slack channel.",
    related: ["repository-scanner", "settings", "alerts"],
    content: [
      { t: "p", x: "The CLI is for the moment before code is pushed. It runs a local provider detection pass without sending a repository to the server, and it can trigger a server-side scan when you want the full pipeline. It is distributed from source; there is no published npm package yet." },
      { t: "h", x: "Install" },
      { t: "p", x: "You need Node.js 18 or newer and git. Clone the repository and install the CLI globally:" },
      { t: "code", x: "git clone https://github.com/Hashirattari11/breaklytix.git\ncd breaklytix/cli && npm install -g ." },
      { t: "p", x: "The binary is called breaklytix. It works on Linux, macOS and Windows. The configuration is stored in .autofixrc in your home directory and is created with owner-only permissions because it holds a live API key." },
      { t: "h", x: "Authenticate" },
      { t: "ul", x: [
        "Create a key in Settings → API Keys. The key is shown once and cannot be retrieved later.",
        "Run breaklytix login and paste the key. Input is hidden and the key is validated against the API before it is saved.",
        "The CLI keeps the key in .autofixrc; it does not put it in a URL, a log line or a repository file.",
        "Point the CLI at a different environment with AUTOFIX_API_URL and AUTOFIX_WEB_URL if you are testing against a local backend.",
      ] },
      { t: "h", x: "Commands" },
      { t: "ul", x: [
        "breaklytix scan — scan the current git repository. The CLI identifies the repository from its git remote and asks the API to run a server-side scan.",
        "breaklytix scan --dir ./path — scan a local directory without uploading it. The detection runs on your machine and prints the findings in the terminal.",
        "breaklytix watch — re-scan the current directory every 30 seconds. Useful while you are migrating a large surface.",
        "breaklytix status — list alerts and fixes returned by the API for your account.",
        "breaklytix login — replace or validate the stored API key.",
      ] },
      { t: "h", x: "Local scan limits" },
      { t: "p", x: "The local scan walks the directory, skips dependency and build folders such as node_modules, .git, dist, build and .next, and reads supported source and configuration files. It is bounded to 5,000 files of up to 512 KB each and a directory depth of 25. Secret-shaped strings in a matched line are redacted before they are printed." },
      { t: "p", x: "The local scan is intentionally narrower than the server scanner: it recognises a small set of provider patterns and does not build the full repository usage map. Use it for a quick answer in the terminal; use the dashboard scan when you want findings matched against changelog events, impact analysis and alerts." },
      { t: "h", x: "Slack integration" },
      { t: "p", x: "Settings → Integrations connects the Breaklytix Slack app to a channel through Slack's OAuth flow. Once connected, breaking-change alerts that match detected usage are mirrored to that channel with the severity, provider, repository, change type and a link to the official source. Slack is notification-only: fixes are approved in the dashboard." },
      { t: "ul", x: [
        "Connect from Settings → Integrations and choose the channel in Slack's own authorization screen.",
        "The connection belongs to the workspace installation. Removing the bot from the channel or revoking the app stops delivery.",
        "Slack delivery is best-effort. If Slack is unavailable, the dashboard alert still exists and the breaking-change email is unaffected.",
        "Reconnect if the channel is renamed or the installation is replaced; the stored channel id will no longer resolve.",
      ] },
      { t: "tip", x: "Do not commit .autofixrc. If a key leaks, revoke it in Settings → API Keys and run breaklytix login with a new one. Revocation is immediate." },
    ],
    faq: [
      { q: "Is there an npm package for the CLI?", a: "Not yet. The CLI is installed from the project source with npm install -g . after cloning the repository. It requires Node.js 18 or newer." },
      { q: "Does breaklytix scan --dir upload my code?", a: "No. The local scan reads files on your machine and prints the findings. The plain breaklytix scan command asks the API to scan a connected repository server-side." },
      { q: "Where is the API key stored?", a: "In .autofixrc in your home directory, created with owner-only permissions. The CLI sends it as a bearer token to the API and never writes it to a URL or log." },
      { q: "Why did Slack stop receiving alerts?", a: "The bot was likely removed from the channel or the Slack installation was revoked. Reconnect from Settings → Integrations; the dashboard and email alerts are unaffected." },
    ],
  },

  // ───────────────────────── Settings & Security ─────────────────────────
  {
    slug: "settings",
    title: "Settings, theme, API keys and security",
    section: "Settings & Security",
    order: 1,
    summary: "Account settings, appearance, API keys, email testing, and how Breaklytix protects your data.",
    related: ["sign-in", "alerts", "billing"],
    content: [
      { t: "p", x: "Settings is the control surface for the account, not for a single repository. It is split into General, Notifications, Email, Billing and Session. The choices here apply across every repository you connect." },
      { t: "h", x: "General" },
      { t: "ul", x: [
        "Shows the connected GitHub account, the verified email and the current plan.",
        "Reconnect GitHub if you changed permissions or revoked access; the new authorization replaces the stored token.",
        "Sign out of this browser clears the session in this browser. It does not delete the account or revoke the GitHub authorization.",
        "To revoke Breaklytix at GitHub, use GitHub → Settings → Applications. That is the authoritative disconnect.",
      ] },
      { t: "h", x: "Theme" },
      { t: "p", x: "Choose Light, Dark or System. The preference is stored in this browser under autofix_theme and is applied by a small inline script before the page paints, so a dark-mode user does not see a white flash on load. System follows the operating system and re-applies when the OS preference changes." },
      { t: "ul", x: [
        "The dashboard header has a quick light/dark toggle that updates the same preference.",
        "The setting is per browser, not per account: a different device can use a different theme.",
        "Clearing site data resets the preference to System.",
      ] },
      { t: "h", x: "API keys" },
      { t: "p", x: "Settings → API Keys creates keys for the public API and the CLI. A key is shown once, at creation, and never again. The backend stores only a SHA-256 hash and a short prefix for display." },
      { t: "ul", x: [
        "Keys are prefixed afx_live_ and are sent as a bearer token.",
        "Each key records when it was created and when it was last used, so an idle key is easy to spot.",
        "Revoking a key takes effect immediately. Revoked keys cannot be restored.",
        "Create a separate key per tool or machine so a leak has a small blast radius.",
      ] },
      { t: "h", x: "Email" },
      { t: "p", x: "Settings → Email sends a test message through the same path as alert email. Use it before you rely on alerts. The page reports the sender and whether the backend is using a sandbox sender; an @resend.dev sender only delivers to the account owner." },
      { t: "h", x: "Security model" },
      { t: "ul", x: [
        "Authentication: GitHub OAuth only. Breaklytix stores no passwords.",
        "GitHub tokens and provider API keys: encrypted at rest with Fernet using TOKEN_ENCRYPTION_KEY. They are decrypted server-side only when a scan or an approved fix needs them.",
        "Session: a signed JWT issued after the OAuth callback, valid for 30 days. It is held in browser storage and cleared on sign-out.",
        "Authorization: every data query is scoped to the authenticated user. Agency repositories are additionally scoped to the client.",
        "Internal endpoints require a server-side internal secret and are not reachable from the browser.",
        "Email delivery logs record the recipient, subject, alert type, status and provider ids. They do not store the message body or secrets.",
        "Scan output is redacted for secret-shaped strings before it is stored or displayed.",
      ] },
      { t: "p", x: "The public Security page and Privacy Policy describe the controls in more detail. If you find a vulnerability, report it through the support address rather than opening a public issue." },
      { t: "tip", x: "Commit to a key rotation habit: revoke a key the moment a machine or teammate no longer needs it, and create a new one instead of sharing an existing key." },
    ],
    faq: [
      { q: "Does signing out delete my account?", a: "No. It clears the session in this browser. Your account, repositories, scan history and billing record remain. To revoke Breaklytix's GitHub authorization, revoke the OAuth app on GitHub." },
      { q: "Where is the theme preference stored?", a: "In this browser under autofix_theme. It is not stored on your account, so each device can use a different theme." },
      { q: "Can I see an API key again after creating it?", a: "No. The full key is shown once. Only a hash and a short prefix are stored, so a lost key must be revoked and replaced." },
      { q: "How long does a session last?", a: "The signed session token is valid for 30 days. Signing out clears it from the browser; revoking the GitHub authorization makes the underlying GitHub token unusable immediately." },
    ],
  },

  // ───────────────────────── Billing & Plans ─────────────────────────
  {
    slug: "billing",
    title: "Plans, trials and billing",
    section: "Billing & Plans",
    order: 1,
    summary: "What each plan includes, how the 10-day trial works, and how to manage a subscription.",
    related: ["settings", "providers", "alerts"],
    content: [
      { t: "p", x: "Breaklytix is sold as a monthly subscription with a per-account limit on monitored APIs. Every plan includes repository scanning, code break detection, runtime intelligence and alerting; the difference is how many third-party APIs you can monitor at once and the level of support." },
      { t: "h", x: "Plans" },
      { t: "ul", x: [
        "Starter — $500/month, 10 monitored APIs. Includes the full monitoring, repository scanning, code-break detection and alerting feature set.",
        "Growth — $2,000/month, 50 monitored APIs. Same product features with a larger account-level limit and priority email support.",
        "Enterprise — $10,000/month, unlimited monitored APIs. Adds a dedicated support engineer and custom fix-rule development.",
      ] },
      { t: "p", x: "The current plan, the monitored-API count and the renewal date are shown in Settings → Billing and on the public pricing page. Enterprise is handled as a conversation through the contact page rather than self-serve checkout." },
      { t: "h", x: "The 10-day trial" },
      { t: "ul", x: [
        "Every new account starts with a 10-day trial from the moment the account is created.",
        "During the trial, monitored APIs are unlimited, so you can connect the real set of providers before deciding on a plan.",
        "No credit card is required to start the trial.",
        "When the trial ends without a subscription, the account falls back to the default limit of 10 monitored APIs until a plan is active.",
        "The trial is tied to the account, not to a browser or a repository.",
      ] },
      { t: "h", x: "Upgrading and managing payment" },
      { t: "ul", x: [
        "Choose a plan on the pricing page or from Settings → Billing. Starter and Growth open a Stripe Checkout session.",
        "Payment details are entered on Stripe, not on Breaklytix. Breaklytix stores the Stripe customer and subscription identifiers, not your card number.",
        "The Billing Portal link opens Stripe's hosted portal for invoices, receipts, payment methods and cancellation.",
        "Plan changes and renewals are applied from Stripe webhooks. The dashboard shows the status Stripe reports; when Stripe is unreachable, it shows no renewal date rather than inventing one.",
        "Cancelling at the end of the period keeps access until the period ends. A cancelled subscription eventually sets the monitored-API limit to zero.",
      ] },
      { t: "h", x: "What counts as a monitored API" },
      { t: "p", x: "A monitored API is a provider you have connected for monitoring, not a repository and not an individual endpoint. Multiple repositories using the same provider count once. Removing a provider frees the slot for another; the historical events remain in the dashboard." },
      { t: "h", x: "Failed payments and past-due accounts" },
      { t: "p", x: "If a payment fails, the subscription moves to past_due and the dashboard reports that state. Update the payment method in the Billing Portal to restore the subscription. A subscription that is cancelled or cannot be collected moves to cancelled, and the monitored-API limit becomes zero until billing is resolved." },
      { t: "tip", x: "Start the trial with the providers you actually use, not the ones you might use later. The trial is the cheapest time to find out whether your most important integration is covered." },
    ],
    faq: [
      { q: "How much does Breaklytix cost?", a: "Starter is $500/month for 10 monitored APIs, Growth is $2,000/month for 50, and Enterprise is $10,000/month with unlimited monitored APIs. Every new account starts with a 10-day free trial." },
      { q: "Does the trial require a credit card?", a: "No. The 10-day trial starts when the account is created and does not require payment details." },
      { q: "What happens when the trial ends?", a: "Without an active subscription the account falls back to the default limit of 10 monitored APIs. Your repositories, scans and alerts remain; you can subscribe at any time to raise the limit." },
      { q: "Where do I cancel or download an invoice?", a: "Use the Billing Portal link in Settings → Billing. It opens Stripe's hosted portal for cancellation, invoices, receipts and payment methods." },
    ],
  },

  // ───────────────────────── Troubleshooting & FAQ ─────────────────────────
  {
    slug: "troubleshooting",
    title: "Troubleshooting and FAQ",
    section: "Troubleshooting & FAQ",
    order: 1,
    summary: "Common problems, what the error actually means, and direct answers about code access, privacy and alerting.",
    related: ["sign-in", "alerts", "settings"],
    content: [
      { t: "p", x: "Most support questions fall into five buckets: sign-in, missing scan results, email delivery, alerts that did not fire, and billing. Each has a small set of causes worth checking before you contact support." },
      { t: "h", x: "Sign-in and GitHub" },
      { t: "ul", x: [
        "Private or unverified GitHub email: verify the address on GitHub, then sign in again. Breaklytix requires a verified email for account notices and alerts.",
        "redirect_uri_mismatch: the OAuth app does not have this site's /auth/callback URL registered. The canonical callback is https://breaklytix.site/auth/callback.",
        "Application suspended: the GitHub OAuth app was suspended. Contact support before retrying; signing in again will not fix it.",
        "Session expired or 401 from the API: the session token is missing or no longer valid. Sign in again.",
        "Wrong GitHub account: sign out, then authorize the account that owns the repositories you want to scan.",
      ] },
      { t: "h", x: "The scanner finds nothing" },
      { t: "ul", x: [
        "Confirm the repository uses a provider in the monitoring registry. A repository that only calls an internal API will not produce third-party findings.",
        "Check the file types. The scanner reads supported source and configuration files; generated bundles, minified assets and vendored dependencies are skipped.",
        "Check the scan limits. A scan reads up to 1,500 files of up to 400 KB each. A monorepo may need the service directories scanned separately.",
        "Look for dynamic construction. A URL assembled at runtime, a client generated during the build or a call behind a dynamic import can evade static analysis.",
        "Run an on-demand scan after a large refactor or dependency upgrade; the daily scan will catch up, but the immediate answer is more useful.",
      ] },
      { t: "h", x: "No data yet or Not available" },
      { t: "p", x: "This is an honest empty state, not a bug. Runtime Intelligence only reports data that has actually been collected. A provider with no snapshot yet shows Not available instead of a fabricated zero. Run a scan for the repository, then check the provider again." },
      { t: "h", x: "Email failed or never arrived" },
      { t: "ul", x: [
        "Sender is not configured correctly: the backend is missing RESEND_API_KEY or a valid RESEND_FROM_EMAIL in the Name <email> format. An operator must fix the environment.",
        "Sandbox sender: an @resend.dev sender only delivers to the account owner. Add a verified domain sender for real recipients.",
        "Check the Breaking change alerts switch in Settings → Notifications. Only that switch and the Weekly digest currently gate email; the other categories are dashboard-only.",
        "Check the daily cap. A user receives at most five alert emails per day; identical messages are deduplicated within 60 minutes.",
        "Use Settings → Email → Send test email before assuming the alert path is broken.",
        "Accepted by provider does not mean inbox delivery. It means Resend accepted the message and returned an id. Check spam and the recipient provider next.",
      ] },
      { t: "h", x: "Alerts stopped firing" },
      { t: "ul", x: [
        "The GitHub authorization may have been revoked on GitHub. Reconnect and run a scan.",
        "The change may not match any detected usage. Unmatched changes are stored but do not create alerts.",
        "The Breaking change alerts switch may be off, or the daily email cap may have been reached. The dashboard alert still exists.",
        "Slack delivery is best-effort. If Slack is down, email and the dashboard are unaffected.",
      ] },
      { t: "h", x: "Billing and plans" },
      { t: "ul", x: [
        "Trial ended: the account falls back to 10 monitored APIs. Subscribe to raise the limit.",
        "Payment failed: the subscription moves to past_due. Update the payment method in the Billing Portal.",
        "Cancelled: the monitored-API limit drops to zero at the end of the billing period. Reactivate through the portal.",
        "The dashboard shows no renewal date when Stripe is unreachable, rather than inventing one.",
      ] },
      { t: "h", x: "Slack and Agency Mode" },
      { t: "ul", x: [
        "Slack stopped receiving alerts: the bot was removed from the channel or the installation was revoked. Reconnect from Settings → Integrations.",
        "Agency invite not received: check the email status on the client row and whether the sender is in sandbox mode. Resend only works for a pending client.",
        "Agency link expired: invites last seven days and are single-use. Resend the invite to generate a new link.",
        "Agency client cannot see repositories: confirm the client installed the agency's GitHub App on the repositories they want monitored.",
      ] },
    ],
    faq: [
      {
        q: "Does Breaklytix read my secrets?",
        a: "It reads the source files needed to detect API usage, but it does not read credential values as data. Secret-shaped strings found during a scan are redacted before they are stored or displayed. Provider API keys you add for monitoring are encrypted at rest and shown only as masked identifiers.",
      },
      {
        q: "Does Breaklytix auto-merge pull requests?",
        a: "No. Auto-fix pull requests are human-reviewed. Breaklytix opens a pull request only after you approve a specific proposed fix, and waits; nothing is merged automatically, and every change is a reviewable diff you can reject.",
      },
      {
        q: "Can I monitor private repositories?",
        a: "Yes. The OAuth app requests the repo scope, which is broader than read-only: it grants access to private repositories and allows Breaklytix to open an auto-fix pull request after you approve a specific proposed fix. Breaklytix does not push or merge without that approval.",
      },
      {
        q: "How fast will I get an alert?",
        a: "Provider changelogs are fetched and processed once a day at 06:00 UTC, so a change published during the day is matched on the next run. An on-demand repository scan runs immediately and reports what it finds; it does not wait for the daily pipeline.",
      },
      {
        q: "What happens if I sign out?",
        a: "Signing out — including the Sign out of this browser action in Settings — clears the session token in this browser and leaves the account, repositories, scan history and billing record intact. To revoke Breaklytix's GitHub authorization completely, revoke the OAuth app on GitHub; scanning stops until you sign in again.",
      },
      {
        q: "What does Breaklytix actually monitor?",
        a: "Official changelogs, release notes and release feeds for 44 provider APIs, spanning payments, communication, AI, cloud, databases, analytics and developer infrastructure. Classification is deterministic — pattern matching and structured parsing, no language model in the monitoring path — so the same published change always produces the same result.",
      },
      {
        q: "How is Breaklytix different from Dependabot?",
        a: "Dependabot watches package versions inside your dependency file. Breaklytix watches the changelogs of third-party APIs you call, then maps a published change onto the exact files, lines and symbols in your repository that could break. A provider can change behaviour without shipping a new package version, and Dependabot stays silent on that.",
      },
      {
        q: "Are the findings guaranteed to be correct?",
        a: "No. Code Break Detection is static analysis: it can miss a URL assembled at runtime or a client generated during the build, and a match can point at a helper rather than the production path. Findings are evidence to review, not proof. Runtime Intelligence reports only data that has actually been collected and says so when it has none.",
      },
    ],
  },

  // ── Guides ───────────────────────────────────────────────────────────────
  {
    slug: "api-change-monitoring",
    title: "What is API change monitoring?",
    section: "Guides",
    order: 1,
    summary:
      "API change monitoring watches the changelogs of the services you call and turns a published change into a decision for your team — before it reaches production.",
    related: ["breaking-api-changes", "providers", "code-breaks"],
    sources: [
      { label: "Stripe — API changelog", href: "https://docs.stripe.com/changelog" },
      {
        label: "GitHub — REST API versioning",
        href: "https://docs.github.com/en/rest/about-the-rest-api/api-versions",
      },
      {
        label: "Keep a Changelog — a convention for human-readable changelogs",
        href: "https://keepachangelog.com/en/1.1.0/",
      },
      { label: "Semantic Versioning 2.0.0", href: "https://semver.org/" },
    ],
    content: [
      {
        t: "p",
        x: "API change monitoring is the practice of watching the public change feeds of the third-party services your software calls — changelogs, release notes and version announcements — and turning those entries into something your team can act on. The unit being monitored is not your server. It is another company's interface.",
      },
      {
        t: "p",
        x: "That distinction matters because most teams already run monitoring, and it answers a different question.",
      },
      { t: "h", x: "Three different things people call API monitoring" },
      {
        t: "ul",
        x: [
          "Uptime monitoring asks: is the service reachable right now? It sends requests on a schedule and alerts on elevated latency or error rates. It is blind to a change that has been announced but not yet deployed.",
          "Runtime monitoring asks: what is failing in production? It reads your own error rates and traces. It is the most accurate signal available and the most expensive one, because the incident has already reached a customer.",
          "Change monitoring asks: what did the provider say it is going to do? It reads the provider's own publication, which typically arrives before the behaviour changes.",
        ],
      },
      {
        t: "p",
        x: "The three are complementary. Change monitoring is the only one that gives you lead time.",
      },
      { t: "h", x: "Dependency monitoring tracks the package, not the service" },
      {
        t: "p",
        x: "Dependency tooling — Dependabot, Renovate, npm audit — watches the packages in your manifest. That is a real risk surface, and it is not this one. A pinned SDK version can be perfectly compatible with a server that has already removed the endpoint that SDK calls. Nothing in the manifest changes, so nothing in the dependency tooling fires.",
      },
      {
        t: "p",
        x: "Semantic versioning does not close the gap either. SemVer governs how a package author signals change inside a package. A hosted API is not a package: it has no installed version in your repository unless the provider versions it explicitly, and many providers version by date rather than by major number.",
      },
      { t: "h", x: "What change monitoring actually reads" },
      {
        t: "ul",
        x: [
          "A dated changelog page, where entries are appended continuously and old entries stay online (Stripe is the clearest example).",
          "Release notes grouped by product or service, which is how large cloud providers publish (AWS splits them per service).",
          "A blog-style changelog with tags and categories, often the only structured feed a developer-tools company offers.",
          "A release feed — RSS, Atom, or GitHub Releases — when the provider ships an SDK rather than a hosted service.",
          "A versioned API reference that documents which versions still exist and when older ones stop being accepted.",
        ],
      },
      {
        t: "p",
        x: "The formats differ, but every one of them contains the same four things a team needs: what changed, which surface it affects, when it takes effect, and where the primary source is.",
      },
      { t: "h", x: "What the output should contain" },
      {
        t: "ul",
        x: [
          "Provider and source URL, so a reader can verify the claim without trusting a summary.",
          "Change type — breaking change, deprecation, additive change, version retirement, auth change, schema change — because the response differs by type.",
          "Affected surface: an endpoint, a response field, a header, an SDK major version, or a whole API version.",
          "Effective date, or the explicit statement that none was published.",
          "A stable identifier for the entry, so the same change is not alerted twice and is not silently reworded into a new alert.",
        ],
      },
      { t: "h", x: "Where change monitoring stops" },
      {
        t: "p",
        x: "It cannot prevent an outage. It reports what a provider published, and providers sometimes ship without publishing, publish late, or describe a change in prose that no parser can classify with certainty. A monitoring system that hides those limits is harder to trust than one that states them.",
      },
      {
        t: "p",
        x: "It also does not tell you whether a change matters to you until it is matched against your own usage. A removed field in a service you call once, from a background job, is a different problem from the same field in a payment path.",
      },
      { t: "h", x: "How Breaklytix implements it" },
      {
        t: "p",
        x: "Breaklytix polls the official changelog or release feed of 44 providers, normalises each entry into a stable record with a fingerprint, and classifies it deterministically — pattern matching and structured scraping, no language model in the monitoring path. When a change matches API usage detected in a connected repository, the alert names the file and line that calls the affected surface. When nothing matches, the entry is still stored and labelled unmatched rather than discarded.",
      },
      {
        t: "tip",
        x: "If you only do one thing after reading this: list the five providers your revenue path depends on, subscribe to their changelogs, and route them to a channel a human reads during working hours.",
      },
    ],
    faq: [
      {
        q: "Is API change monitoring the same as uptime monitoring?",
        a: "No. Uptime monitoring tests whether a service responds correctly right now. API change monitoring reads the provider's published changelog to find changes that are announced but may not be live yet. Uptime monitoring detects an incident after it starts; change monitoring gives you lead time before it starts.",
      },
      {
        q: "Do I still need to read changelogs if I use a monitoring tool?",
        a: "For anything that could affect revenue, yes — at least the linked source entry. A tool can classify and route a change, but the provider's own text is the primary source. Breaklytix stores the source URL next to every entry so the original wording is one click away.",
      },
      {
        q: "Does API change monitoring prevent production incidents?",
        a: "No. It reduces the chance that a published change reaches production unnoticed. Providers can ship without announcing, publish after deploying, or describe a change ambiguously. Monitoring is a warning system, not a guarantee.",
      },
    ],
  },
  {
    slug: "github-api-change-impact",
    title: "How API changes affect GitHub repositories",
    section: "Guides",
    order: 2,
    summary:
      "A provider change becomes concrete only when you can name the repositories, files and call sites it touches. Here is how to build that map.",
    related: ["repository-scanner", "code-breaks", "impact-overview"],
    sources: [
      {
        label: "GitHub — REST API versioning",
        href: "https://docs.github.com/en/rest/about-the-rest-api/api-versions",
      },
      { label: "GitHub — changelog", href: "https://github.blog/changelog/" },
      { label: "Stripe — API versioning and upgrades", href: "https://docs.stripe.com/upgrades" },
    ],
    content: [
      {
        t: "p",
        x: "A changelog entry is not an incident. It becomes one only when it maps onto code you run. The repository is where that mapping happens, and the hard part is that API usage is rarely declared in one obvious place.",
      },
      { t: "h", x: "Where API usage actually hides" },
      {
        t: "ul",
        x: [
          "Environment variable names: STRIPE_SECRET_KEY, OPENAI_API_KEY, TWILIO_AUTH_TOKEN. The name identifies the provider even when no import mentions it.",
          "SDK imports and constructors: import stripe, from openai import OpenAI, new Twilio(...). These survive refactors better than raw HTTP calls.",
          "Package names in manifests: stripe, @slack/web-api, openai. Useful, but they only cover the client library, not the endpoint being called.",
          "Raw endpoint strings: https://api.stripe.com/v1/charges, https://slack.com/api/chat.postMessage. These are the most precise signal and the easiest to miss, because they can live in config, tests and fixtures.",
          "Webhook routes: hooks.stripe.com, /webhooks/github. A provider change to signature verification or payload shape breaks these without touching a client call.",
        ],
      },
      {
        t: "p",
        x: "A repository-wide scan that only reads dependency manifests will find the fourth of those and miss the rest. That is the usual reason a team believes it has an inventory when it has a list of packages.",
      },
      { t: "h", x: "Version pinning is where most surprises start" },
      {
        t: "p",
        x: "GitHub versions its REST API by date and asks clients to send that date explicitly: X-GitHub-Api-Version: 2022-11-28. A request without the header does not fail — it falls back to a default version, and that default can move. The same request can start returning a different response shape without a line of your code changing.",
      },
      {
        t: "code",
        x: "curl -H 'Accept: application/vnd.github+json' \\\n  -H 'X-GitHub-Api-Version: 2022-11-28' \\\n  https://api.github.com/repos/OWNER/REPO/issues",
      },
      {
        t: "p",
        x: "Stripe uses a related but different model: each account has a default API version, a request can override it with a version header, and the changelog describes what changes between dated versions. The practical consequence is the same — the version you are effectively using is a property of configuration and request code, not of the package version in your manifest.",
      },
      { t: "h", x: "From changelog entry to file list" },
      {
        t: "p",
        x: "A useful impact map answers four questions for a single entry, in this order:",
      },
      {
        t: "ul",
        x: [
          "Which surface does the entry change? An endpoint path, a response field, a header, an auth scheme, or an entire version.",
          "Which repositories in the organisation reference that surface? Grep is the right first tool: endpoint hostnames and path prefixes are highly specific strings.",
          "Which call sites inside those repositories depend on the specific behaviour that changed? A removed field only matters where that field is read.",
          "Is the call on a critical path? Payment capture and a nightly analytics sync deserve different response times.",
        ],
      },
      {
        t: "p",
        x: "Skipping the third question is what turns a monitoring system into an alarm that everyone mutes. A repository that imports the Stripe SDK but never touches the changed endpoint is not affected, and saying so explicitly is more valuable than listing it as a risk.",
      },
      { t: "h", x: "Monorepos and multi-repo organisations" },
      {
        t: "p",
        x: "In a monorepo the scan is one pass but the ownership question is harder: a shared client package can be called by a dozen services, and the changelog impact lands on whichever squad owns the caller. In a multi-repo organisation the opposite is true — ownership is obvious per repository, but nothing guarantees that every repository is connected to the same view of provider changes.",
      },
      {
        t: "p",
        x: "Either way, the unit of decision is the call site, not the repository. Repository-level labels are only useful because they route the work to a team.",
      },
      { t: "h", x: "What to do with the map" },
      {
        t: "ul",
        x: [
          "Pin the API version explicitly in code and record the retirement date next to it.",
          "Add a contract test that asserts the fields you read, so a removal fails a test rather than a customer request.",
          "Keep the endpoint inventory current — regenerate it on every default-branch push rather than in a quarterly audit.",
          "When a change is classified as additive, record it and move on. Not every entry deserves a ticket.",
        ],
      },
      {
        t: "tip",
        x: "Breaklytix produces this map by scanning repository trees, then matching classified provider changes to detected usage. The output is a file and line reference, plus a confidence level — not a claim that every match will break.",
      },
    ],
    faq: [
      {
        q: "Does a provider change always require a code change?",
        a: "No. Many entries are additive — a new optional field, a new endpoint, a new webhook event. The useful question is whether the change touches a surface your code reads or writes. A change that adds a field your parser ignores is safe to record and close.",
      },
      {
        q: "Why is the API version header more important than the SDK version?",
        a: "The SDK version describes the client library you installed. The API version describes the server behaviour you are asking for. A new SDK talking to an old API version, or an old SDK talking to a new default version, are both possible. The server contract is what actually changes response shapes.",
      },
      {
        q: "How often should repository usage be rescanned?",
        a: "At least on every push to the default branch. API usage moves between releases, and an inventory that is a quarter old will miss new call sites — which are exactly the ones nobody has tested against a provider change yet.",
      },
    ],
  },
  {
    slug: "stripe-changelog-example",
    title: "Worked example: reading Stripe's changelog",
    section: "Guides",
    order: 3,
    summary:
      "A practical walkthrough of one provider's changelog: what a Stripe entry contains, which fields decide impact, and how to turn it into a code change.",
    related: ["breaking-api-changes", "code-breaks", "providers"],
    sources: [
      { label: "Stripe — API changelog", href: "https://docs.stripe.com/changelog" },
      { label: "Stripe — API versioning and upgrades", href: "https://docs.stripe.com/upgrades" },
      { label: "Stripe — API reference", href: "https://docs.stripe.com/api" },
    ],
    content: [
      {
        t: "p",
        x: "Stripe is a useful worked example because its change process is unusually explicit: dated API versions, a public changelog, and an upgrade guide that describes what moves between versions. The same reading method applies to providers with less structure — you just have to infer more.",
      },
      { t: "h", x: "How Stripe versions its API" },
      {
        t: "p",
        x: "Stripe versions the API by date. An account has a default version, and a request can pin a different one for that call alone. That means the version in effect is a combination of account configuration and request code — two places, neither of which is your package manifest.",
      },
      {
        t: "p",
        x: "This is why an integration can keep working for months and then break when someone upgrades the account default, or when Stripe retires an old version. The changelog entry that described the behavioural difference may be years old by the time it reaches you.",
      },
      { t: "h", x: "Anatomy of a changelog entry" },
      {
        t: "p",
        x: "A typical Stripe changelog entry carries a release date, the API version it belongs to, a short heading, and prose describing the change. Reading it as an engineer means extracting five things:",
      },
      {
        t: "ul",
        x: [
          "The affected surface. Which endpoint, object or field does the entry name? If it names an object, which operations on that object change?",
          "The direction of the change. Is something added, removed, renamed, or is the meaning of an existing field different?",
          "Whether it is breaking under your usage. A removed field is breaking only where it is read; an added field is usually safe.",
          "The version boundary. Which dated version introduced it, and which versions still behave the old way?",
          "The migration action. Some entries name a replacement field or endpoint; some only describe new behaviour and leave the migration to you.",
        ],
      },
      { t: "h", x: "Applying one entry to a repository" },
      {
        t: "p",
        x: "Take an entry that changes how a response field is populated. The workflow is the same every time:",
      },
      {
        t: "code",
        x: "# 1. Find the call sites, not just the SDK import\nrg -n 'api\\.stripe\\.com|stripe\\.(charges|customers|subscriptions)'\n\n# 2. Find reads of the specific field\nrg -n 'invoice\\.settings|payment_intent\\.charges'\n\n# 3. Check whether the API version is pinned in requests\nrg -n 'Stripe-Version|stripe_version|apiVersion'",
      },
      {
        t: "p",
        x: "Step one answers which repositories are exposed. Step two answers which call sites actually depend on the changed behaviour. Step three answers the question most teams skip: is this request even using the version the entry describes? A request pinned to an older version is not affected yet — but it will be when that version is retired, so the retirement date belongs in the ticket.",
      },
      { t: "h", x: "The two dates that matter" },
      {
        t: "ul",
        x: [
          "The release date of the version that introduced the change, which tells you how long the old behaviour has been the old behaviour.",
          "The retirement date of the version you are on, if the provider publishes one. This is the date that turns a latent risk into a deadline.",
        ],
      },
      {
        t: "p",
        x: "Teams that track only the first date accumulate a backlog of changes they have not evaluated. Teams that track the second date get a work queue with an expiry, which is far easier to schedule.",
      },
      { t: "h", x: "What this example generalises to" },
      {
        t: "p",
        x: "Replace Stripe with GitHub, Twilio, Slack or AWS and the method holds: find the version boundary, find the surface, find the call sites, then decide. What changes is the amount of help the provider gives you. Stripe publishes dated versions and an upgrade guide. GitHub publishes dated REST versions and a changelog. Some providers publish prose in a blog post with no version boundary at all — in which case the only reliable date is the publication date, and the safe assumption is that the change may already be live.",
      },
      {
        t: "tip",
        x: "Breaklytix keeps the Stripe changelog entry, its classification and its source URL together, then matches it against detected Stripe usage in your repositories. If you want to do this manually, the three ripgrep commands above are the minimum useful version.",
      },
    ],
    faq: [
      {
        q: "Do Stripe changelog entries apply to my account immediately?",
        a: "Not necessarily. Stripe versions the API by date, and an account keeps its existing default version until it is changed or retired. An entry describes behaviour that is available at a given version. Whether it affects you depends on the version your account and your requests actually use.",
      },
      {
        q: "Where can I find Stripe's changelog and upgrade guide?",
        a: "The changelog is at docs.stripe.com/changelog and the upgrade guide at docs.stripe.com/upgrades. Both are linked in the Further reading section of this page.",
      },
      {
        q: "Is the SDK version enough to know which API version I use?",
        a: "No. The SDK is a client library; the API version is a server-side contract, set per account and overridable per request. You need to check both the account setting and any version header in your request code.",
      },
    ],
  },
];

export function docsBySection(): { section: string; articles: DocArticle[] }[] {
  return DOC_SECTIONS.map((sec) => ({
    section: sec.name,
    articles: DOCS.filter((d) => d.section === sec.name).sort((a, b) => a.order - b.order),
  })).filter((group) => group.articles.length > 0);
}

export function getDoc(slug: string): DocArticle | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function relatedDocs(slug: string): DocArticle[] {
  const doc = getDoc(slug);
  if (!doc?.related) return [];
  return doc.related
    .map((s) => getDoc(s))
    .filter((d): d is DocArticle => Boolean(d));
}

export function prevNext(slug: string): { prev?: DocArticle; next?: DocArticle } {
  // `order` is per-section (1..n inside each DOC_SECTIONS group), so the reading
  // order is the flattened sidebar order — not a global sort on `order`, which
  // would interleave unrelated sections.
  const flat = docsBySection().flatMap((group) => group.articles);
  const idx = flat.findIndex((d) => d.slug === slug);
  if (idx === -1) return {};
  return { prev: flat[idx - 1], next: flat[idx + 1] };
}