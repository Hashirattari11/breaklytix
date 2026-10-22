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
  { name: "Runtime Intelligence", blurb: "Live health signals — errors, failures, incidents, anomalies, rate limits." },
  { name: "Code Break Detection", blurb: "Static analysis that finds where provider changes hit your code." },
  { name: "Impact Engine", blurb: "See what a breaking change means for your repos — and fire drills." },
  { name: "Alerts & Notifications", blurb: "Email and bell alerts, preferences, and the daily digest." },
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
    related: ["quickstart", "github-connection"],
    content: [
      { t: "p", x: "Breaklytix monitors your repositories and the public changelogs of the APIs you depend on. When a provider announces a breaking change — a renamed endpoint, a removed field, a new required header — Breaklytix matches it against the API usage in your code and tells you exactly where you need to change things." },
      { t: "ul", x: [
        "Provider monitoring: Slack, Stripe, Shopify, Twilio, SendGrid, GitHub, OpenAI, Anthropic, Vercel, Supabase, Firebase, Resend and more.",
        "Code break detection: static analysis of your repositories to find affected call sites.",
        "Runtime intelligence: health scores, error rates, incidents, and rate-limit events per provider.",
        "Auto-fix PRs: optional GitHub pull requests that apply mechanical fixes to your code.",
        "Agency mode: run Breaklytix for client repositories under your own GitHub App.",
      ] },
      { t: "tip", x: "Start by connecting GitHub. Breaklytix works with read-only access — it never pushes to your repositories unless you explicitly enable auto-fix PRs." },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    section: "Getting Started",
    order: 2,
    summary: "From sign-in to your first repository scan in under five minutes.",
    related: ["github-connection", "repository-scanner", "alerts"],
    content: [
      { t: "ul", x: [
        "1. Sign in with GitHub (read-only scopes: public_repo, read:user, user:email).",
        "2. On first login you'll be asked to accept the Privacy Policy and Terms.",
        "3. Open the Repository Scanner under Code Break Detection and scan a repository.",
        "4. The scanner reports API usage in your code and any matches against recent provider changes.",
        "5. Review your notifications tab to control which alerts reach your inbox.",
      ] },
      { t: "p", x: "That's it — Breaklytix's background cron jobs fetch provider changelogs every morning (08:00 UTC), process them, and run the daily repository scan." },
    ],
  },
  {
    slug: "breaking-api-changes",
    title: "What counts as a breaking API change?",
    section: "Getting Started",
    order: 3,
    summary: "The six categories of change that break integrations, real examples from common providers, and how to catch them before production.",
    related: ["changelog", "code-breaks", "deprecated-apis"],
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
      { q: "How quickly does Breaklytix notice a change?", a: "Provider sources are polled on a schedule throughout the day and deduplicated by a stable fingerprint. The delay between a provider publishing an entry and an alert being created is bounded by that polling cadence, not by a human reading changelogs." },
      { q: "What is the difference between a code break and an API error?", a: "A code break is a static mismatch between your source and a changed interface, found before or after the change ships. An API error is a runtime signal that calls are currently failing. Breaklytix reports both, in Code Break Detection and Runtime Intelligence respectively." },
    ],
  },

  // ─────────────────────── Authentication & GitHub ───────────────────────
  {
    slug: "sign-in",
    title: "Signing in with GitHub",
    section: "Authentication & GitHub",
    order: 1,
    summary: "Breaklytix uses GitHub OAuth for authentication. No passwords, no tokens stored in our database.",
    related: ["github-connection", "security-model"],
    content: [
      { t: "p", x: "Breaklytix authenticates exclusively through GitHub OAuth. When you sign in: GitHub returns your public profile, email, and a short-lived token. Breaklytix encrypts that token (Fernet) and stores it so background scans can read your repositories." },
      { t: "ul", x: [
        "Scopes requested: read:user, user:email, public_repo. All are read-only.",
        "Your GitHub access token is encrypted before storage; it is never returned to the browser.",
        "You can disconnect GitHub from Settings -> General at any time.",
      ] },
      { t: "tip", x: "If your email is private or unverified on GitHub, sign-in will prompt you to verify it — a verified email is required so alerts can reach you." },
    ],
  },
  {
    slug: "github-connection",
    title: "Connecting and disconnecting GitHub",
    section: "Authentication & GitHub",
    order: 2,
    summary: "Manage the read-only GitHub connection that powers repository scanning.",
    related: ["repository-scanner", "sign-in"],
    content: [
      { t: "p", x: "Settings -> General shows your connected GitHub account. From there you can reconnect (if you changed permissions on GitHub) or disconnect entirely." },
      { t: "ul", x: [
        "Reconnect: re-runs the OAuth flow with the same read-only scopes.",
        "Disconnect: removes your encrypted token. Background scans will stop until you reconnect.",
        "Disconnecting does not delete your account data, alerts, or repositories.",
      ] },
    ],
  },
  {
    slug: "repository-scanner",
    title: "Repository Scanner",
    section: "Authentication & GitHub",
    order: 3,
    summary: "Static analysis that maps the APIs used in your code and checks them against provider changes.",
    related: ["code-breaks", "deprecated-apis", "auto-fix-prs"],
    content: [
      { t: "p", x: "The scanner (Code Break Detection -> Repository Scanner) reads your repository and builds a map of third-party API usage using static analysis — it inspects symbols, imports, and SDK calls without executing your code." },
      { t: "ul", x: [
        "Scans up to 1,500 files of up to 400 KB each.",
        "Detects client SDKs and direct REST usage for monitored providers.",
        "Flags deprecated versions, broken call patterns, and potential breaks against recent provider changes.",
        "Each finding links to the exact location in your code.",
      ] },
      { t: "code", x: "On-demand scans run immediately. The daily scan (08:30 UTC) keeps coverage fresh automatically." },
    ],
  },

  // ───────────────────────── Provider Monitoring ─────────────────────────
  {
    slug: "providers",
    title: "Monitored providers",
    section: "Provider Monitoring",
    order: 1,
    summary: "The API providers Breaklytix tracks, and how coverage works.",
    related: ["runtime-intelligence", "changelog"],
    content: [
      { t: "p", x: "Breaklytix tracks public changelogs and release notes for a curated set of providers and monitors your usage of each." },
      { t: "ul", x: [
        "Payments: Stripe",
        "Commerce: Shopify",
        "Communications: Twilio, SendGrid, Slack",
        "Developer platforms: GitHub, OpenAI, Anthropic, Vercel, Supabase, Firebase",
        "Email: Resend",
      ] },
      { t: "p", x: "Provider pages show a live health score, error rate, incident status, and rate-limit events pulled from real data." },
      { t: "tip", x: "Coverage is additive — providers are shipped in phases. New providers appear on the landing page as they come online." },
    ],
  },
  {
    slug: "changelog",
    title: "Provider changes & changelog",
    section: "Provider Monitoring",
    order: 2,
    summary: "How breaking changes are collected, matched, and turned into alerts.",
    related: ["alerts", "impact-overview"],
    content: [
      { t: "p", x: "Every morning at 08:00 UTC Breaklytix fetches the latest changelog entries for each monitored provider. New events are processed at 08:15 UTC: they are classified (new feature, bug fix, or breaking change) and scored for severity and confidence." },
      { t: "ul", x: [
        "Breaking changes are matched against the API usage detected in your repositories.",
        "High-confidence matches become alerts; lower-confidence ones appear as notices.",
        "Alerts respect your notification preferences and daily caps.",
      ] },
    ],
  },

  // ───────────────────────── Runtime Intelligence ─────────────────────────
  {
    slug: "runtime-intelligence",
    title: "Runtime Intelligence overview",
    section: "Runtime Intelligence",
    order: 1,
    summary: "Live health signals for each provider you connect: errors, failures, incidents, and rate limits.",
    related: ["api-errors", "provider-incidents", "rate-limit-events"],
    content: [
      { t: "p", x: "Runtime Intelligence shows the operational health of the APIs your app depends on, based on health checks and incident feeds Breaklytix collects." },
      { t: "ul", x: [
        "Health overview: aggregate score and status (Healthy / Degraded / Unavailable / Unknown) per provider.",
        "API errors & failures: elevated error rates on your integrations.",
        "Provider incidents: official incident status feeds.",
        "Rate limit events: when your usage approaches rate limits.",
        "Anomalies: unusual reliability signals worth investigating.",
      ] },
      { t: "tip", x: "Runtime signals come from real collected data. When no data is available yet, sections show 'Not available' instead of inventing numbers." },
    ],
  },
  {
    slug: "api-errors",
    title: "API errors & failures",
    section: "Runtime Intelligence",
    order: 2,
    summary: "Elevated error rates and failed calls on your integrations.",
    related: ["runtime-intelligence"],
    content: [
      { t: "p", x: "The API Errors page lists observed errors on your monitored connections, and Failures tracks calls that did not complete. Breaklytix correlates these with provider incidents so you can tell a provider outage from a code regression." },
    ],
  },
  {
    slug: "provider-incidents",
    title: "Provider incidents",
    section: "Runtime Intelligence",
    order: 3,
    summary: "Official incident status for monitored providers.",
    related: ["runtime-intelligence", "alerts"],
    content: [
      { t: "p", x: "Breaklytix watches each provider's status page and reflects incidents as investigating, identified, monitoring, or resolved. When a provider you use has an open incident, it appears across the dashboard and can trigger alerts." },
    ],
  },
  {
    slug: "rate-limit-events",
    title: "Rate limit events",
    section: "Runtime Intelligence",
    order: 4,
    summary: "See when your usage approaches or exceeds API rate limits.",
    related: ["runtime-intelligence"],
    content: [
      { t: "p", x: "The Rate Limit Events page records rate-limit hits from collected runtime snapshots and GitHub's rate-limit endpoint for your connected repos, so you can plan quota headroom." },
    ],
  },

  // ───────────────────────── Code Break Detection ─────────────────────────
  {
    slug: "code-breaks",
    title: "Code break detection",
    section: "Code Break Detection",
    order: 1,
    summary: "Static analysis results that locate the code a provider change affects.",
    related: ["repository-scanner", "impact-overview"],
    content: [
      { t: "p", x: "When a provider change matches API usage in your code, Breaklytix records a potential break with the exact file location, the affected symbol, and the change details. Code Break Detection pages list potential breaks, deprecated APIs, and SDK/library check results." },
      { t: "tip", x: "Labels use 'static analysis' wording — these are code-level findings, not runtime measurements." },
    ],
  },
  {
    slug: "deprecated-apis",
    title: "Deprecated APIs",
    section: "Code Break Detection",
    order: 2,
    summary: "Usage of API versions or endpoints providers have deprecated.",
    related: ["code-breaks"],
    content: [
      { t: "p", x: "The Deprecated APIs page lists places where your code uses endpoints, SDK methods, or versions that a provider has deprecated — the usual first step before a breaking change." },
    ],
  },
  {
    slug: "auto-fix-prs",
    title: "Auto-fix PRs",
    section: "Code Break Detection",
    order: 3,
    summary: "Mechanical fixes Breaklytix proposes when a change is unambiguous.",
    related: ["code-breaks", "impact-overview"],
    content: [
      { t: "p", x: "For changes that are mechanically safe (a renamed export, a swapped argument order), Breaklytix can open a GitHub pull request with the fix. Auto-fix PRs are opt-in and clearly labeled for review before merge." },
      { t: "ul", x: [
        "PRs are created only when a fix is unambiguous and confidence is high.",
        "You control Breaklytix PR creation from repository settings.",
        "Merge at your own pace — nothing is merged automatically.",
      ] },
    ],
  },

  // ───────────────────────── Impact Engine ─────────────────────────
  {
    slug: "impact-overview",
    title: "Impact Engine",
    section: "Impact Engine",
    order: 1,
    summary: "Quantify what a breaking change means for your repositories before it ships.",
    related: ["fire-drill", "auto-fix-prs", "deploy-day"],
    content: [
      { t: "p", x: "The Impact Engine analyzes a specific breaking change against your repos and estimates blast radius: which repos, which files, which lines, and how severe the fix effort is." },
      { t: "ul", x: [
        "Repo-level impact summaries with risk ratings (Critical / High / Medium / Low).",
        "Per-repo analysis with suggested fixes.",
        "Deploy-day reports: what to fix, in what order, before migration.",
      ] },
    ],
  },
  {
    slug: "fire-drill",
    title: "API Fire Drill",
    section: "Impact Engine",
    order: 2,
    summary: "Simulate a breaking change to see how your team would respond — without waiting for a real one.",
    related: ["impact-overview"],
    content: [
      { t: "p", x: "Fire Drill runs a simulated breaking change against your repositories to produce a dry-run impact report. Use it to shrink response time before real changes ship." },
    ],
  },
  {
    slug: "deploy-day",
    title: "Deploy day checklist",
    section: "Impact Engine",
    order: 3,
    summary: "A practical playbook for the day a breaking provider change lands.",
    related: ["impact-overview", "alerts"],
    content: [
      { t: "ul", x: [
        "Review your open alerts and impact summaries for the affected provider.",
        "Fix Critical and High findings first — they are merge-blockers for most teams.",
        "Merge auto-fix PRs after reviewing the diff.",
        "Re-run the repository scanner and the provider's checks to confirm green.",
        "Update your team in Slack or email with the migration notes.",
      ] },
    ],
  },

  // ───────────────────────── Alerts & Notifications ─────────────────────────
  {
    slug: "alerts",
    title: "Alerts",
    section: "Alerts & Notifications",
    order: 1,
    summary: "The alert lifecycle: created, matched, resolved, ignored.",
    related: ["notifications", "email-alerts"],
    content: [
      { t: "p", x: "Alerts are created when a breaking provider change matches your code, an incident affects a provider you use, or Breaklytix detects an anomaly. The bell icon in the dashboard shows open alerts; the Alerts page manages the full list with severity and status filters." },
      { t: "ul", x: [
        "Statuses: open, resolved, ignored.",
        "Test alerts are marked and excluded from your real counts.",
        "Each alert links to the affected repository and change details.",
      ] },
    ],
  },
  {
    slug: "notifications",
    title: "Notification preferences",
    section: "Alerts & Notifications",
    order: 2,
    summary: "Which triggers email you: breaking changes, code breaks, errors, incidents, digests.",
    related: ["email-alerts", "alerts"],
    content: [
      { t: "p", x: "Settings -> Notifications lets you toggle each alert category independently, plus the daily status email. Preferences are stored per account and apply to automated alert emails." },
      { t: "ul", x: [
        "Categories: breaking changes, code breaks, API errors, rate limits, quota, provider incidents, anomalies, auto-fix results, scan results, weekly digest.",
        "Daily status email: a daily summary even when nothing is wrong (off by default).",
        "Email is sent only for categories you enable, within daily caps.",
      ] },
    ],
  },
  {
    slug: "email-alerts",
    title: "Email alerts & delivery status",
    section: "Alerts & Notifications",
    order: 3,
    summary: "How alert emails are sent, and what 'accepted by provider' means.",
    related: ["notifications"],
    content: [
      { t: "p", x: "Alert emails are sent through Resend. Delivery status is reported honestly: 'accepted by provider' means Resend accepted the message — final inbox delivery is handled by the provider, not Breaklytix." },
      { t: "ul", x: [
        "Failures are categorized (sender configuration, rejected, rate limited, network, unknown) and surfaced in the UI.",
        "If the sender is still in Resend's sandbox (onboarding@resend.dev), emails only reach the account owner — the UI warns you with '(sandbox sender)'.",
        "Settings -> Email has a 'Send test email' button to verify your delivery path end to end.",
      ] },
      { t: "tip", x: "For production email to real recipients, add a verified domain sender (RESEND_FROM_EMAIL) — see the environment configuration section at the end of this guide." },
    ],
  },

  // ───────────────────────── Agency Mode ─────────────────────────
  {
    slug: "agency-mode",
    title: "Agency Mode",
    section: "Agency Mode",
    order: 1,
    summary: "Run Breaklytix for external clients through your own GitHub App installation.",
    related: ["agency-invites", "github-connection"],
    content: [
      { t: "p", x: "Agency Mode lets an agency or consultancy monitor client repositories. Clients install your agency's GitHub App (rather than their own), and you manage access through the Agency dashboard." },
      { t: "ul", x: [
        "Invite clients by email; they authorize via a secure link.",
        "Each client's repositories, alerts, and scans are scoped to the client.",
        "The agency owner sees all clients; individual clients see only their own data.",
      ] },
    ],
  },
  {
    slug: "agency-invites",
    title: "Client invites & email status",
    section: "Agency Mode",
    order: 2,
    summary: "Inviting clients, resending, and reading honest email status.",
    related: ["agency-mode", "email-alerts"],
    content: [
      { t: "p", x: "From the Agency dashboard you invite a client by email. The invite link expires after 7 days. You can resend an invite at any time; the status shown reflects the provider's acceptance of the email, not final inbox delivery." },
      { t: "ul", x: [
        "Invite link: 7-day expiry, single-use.",
        "Revoking a client removes access immediately.",
        "Use 'Send test email' to verify your sender is production-ready before inviting clients.",
      ] },
    ],
  },

  // ───────────────────────── CLI & Integrations ─────────────────────────
  {
    slug: "cli",
    title: "Developer CLI",
    section: "CLI & Integrations",
    order: 1,
    summary: "Scan a repository and get Breaklytix findings without leaving the terminal.",
    related: ["repository-scanner", "api-keys"],
    content: [
      { t: "p", x: "The developer CLI lets you scan a repository from your terminal using your Breaklytix key. It produces the same static-analysis findings as the web scanner." },
      { t: "code", x: "autofix scan <repo-url>\nautofix status\nautofix alerts --open" },
      { t: "tip", x: "Generate your API key under Settings -> API Keys. Treat it like a password." },
    ],
  },
  {
    slug: "slack-integration",
    title: "Slack integration",
    section: "CLI & Integrations",
    order: 2,
    summary: "Mirror alerts to a Slack channel.",
    related: ["alerts", "notifications"],
    content: [
      { t: "p", x: "Settings -> Integrations connects the Breaklytix Slack app. When alerts are created, Breaklytix can mirror them to your channel so the whole team sees breaking changes without leaving Slack." },
      { t: "tip", x: "Slack delivery is best-effort: if the webhook is unreachable, the alert still exists in the dashboard bell and email." },
    ],
  },

  // ───────────────────────── Settings & Security ─────────────────────────
  {
    slug: "settings",
    title: "Settings overview",
    section: "Settings & Security",
    order: 1,
    summary: "Profile, GitHub connection, theme, notifications, email, billing, and danger zone.",
    related: ["notifications", "theme", "billing"],
    content: [
      { t: "ul", x: [
        "General: GitHub connection, plan badge, theme (light / dark / system).",
        "Notifications: per-category email switches + daily status email.",
        "Email: send a test email to verify delivery.",
        "Billing: plan, monitored-API usage, renewal date.",
        "Danger zone: disconnect GitHub and related destructive actions.",
      ] },
    ],
  },
  {
    slug: "theme",
    title: "Theme (light / dark / system)",
    section: "Settings & Security",
    order: 2,
    summary: "Appearance preference stored on your device, applied without flash.",
    related: ["settings"],
    content: [
      { t: "p", x: "Choose light, dark, or follow your operating system. The preference is stored locally on your device ('autofix_theme') and applied before first paint so there's no flash of the wrong theme." },
      { t: "ul", x: [
        "Quick toggle in the dashboard header flips light/dark instantly.",
        "Settings -> General and the account menu offer explicit Light / Dark / System choices.",
        "System mode re-applies automatically if you change your OS preference.",
      ] },
    ],
  },
  {
    slug: "api-keys",
    title: "API keys",
    section: "Settings & Security",
    order: 3,
    summary: "Programmatic access to your Breaklytix data for scripts and the CLI.",
    related: ["cli"],
    content: [
      { t: "p", x: "Settings -> API Keys generates scoped keys for programmatic access. Store them safely — Breaklytix displays them once and never returns them again." },
      { t: "tip", x: "Rotate keys by revoking and re-issuing when they may have leaked." },
    ],
  },
  {
    slug: "security-model",
    title: "Security model & privacy",
    section: "Settings & Security",
    order: 4,
    summary: "Encryption, scoping, and why Breaklytix never sees your keys.",
    related: ["api-keys", "settings"],
    content: [
      { t: "ul", x: [
        "Authentication: GitHub OAuth only; no passwords stored.",
        "Tokens: encrypted at rest with Fernet (TOKEN_ENCRYPTION_KEY); never exposed to the browser.",
        "Session: short-lived signed JWT issued after OAuth callback.",
        "Data scoping: every query filters by the authenticated user (or agency client).",
        "Debug/introspection endpoints require the internal secret and are disabled for external callers.",
        "Email delivery logs exclude message content and secrets.",
      ] },
      { t: "p", x: "Full details live in the Security page and Privacy Policy linked in the footer." },
    ],
  },

  // ───────────────────────── Billing & Plans ─────────────────────────
  {
    slug: "billing",
    title: "Plans & billing",
    section: "Billing & Plans",
    order: 1,
    summary: "Trials, monitored-API limits, and renewal.",
    related: ["settings"],
    content: [
      { t: "ul", x: [
        "Trial plan: get started with a limited number of monitored API connections.",
        "Growth plan: higher monitored-API limit for scaling teams.",
        "Every plan includes repository scanning and alerting; enterprise is available on request.",
        "Your current plan, monitored-API usage, and renewal date are on Settings -> Billing.",
      ] },
    ],
  },

  // ───────────────────────── Troubleshooting & FAQ ─────────────────────────
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    section: "Troubleshooting & FAQ",
    order: 1,
    summary: "Common issues and their fixes.",
    related: ["faq"],
    content: [
      { t: "ul", x: [
        "'Email failed — sender not configured': the backend RESEND_FROM_EMAIL is unset. Configure a verified sender (see environment configuration).",
        "'No data yet': the provider hasn't produced collected runtime data yet — this is honest 'not available', not a bug.",
        "Scanner finds nothing: confirm the repository contains monitored providers, or trigger an on-demand scan.",
        "Alerts stopped: check notification preferences, the daily caps, and that your GitHub connection is still active.",
        "Can't sign in: make sure your GitHub email is verified.",
      ] },
    ],
  },
  {
    slug: "faq",
    title: "FAQ",
    section: "Troubleshooting & FAQ",
    order: 2,
    summary:
      "Answers to common Breaklytix questions: secrets and code access, auto-merged pull requests, private repositories, alert timing, and disconnecting GitHub.",
    related: ["troubleshooting"],
    content: [
      { t: "p", x: "Everything below reflects how Breaklytix actually behaves today — there is no planned behaviour listed as if it shipped." },
    ],
    faq: [
      {
        q: "Does Breaklytix read my secrets?",
        a: "No. Breaklytix requests public code access (public_repo) plus your profile metadata. It scans code structure — imports, SDK calls, API hostnames — and never reads, stores or logs credential values. Any secret-shaped string found during a scan is redacted before it is stored or displayed.",
      },
      {
        q: "Does Breaklytix auto-merge pull requests?",
        a: "No. Auto-fix pull requests are opt-in and human-reviewed. Breaklytix opens a pull request with the proposed change and waits — nothing is ever merged automatically, and every change is a reviewable diff you can reject.",
      },
      {
        q: "Can I monitor private repositories?",
        a: "Repository access follows exactly the OAuth scopes you approved when you connected GitHub. The default is read-only public repository access. Private repository support requires a GitHub App install with Contents:read, which grants read-only visibility without write access to your code.",
      },
      {
        q: "How fast will I get an alert?",
        a: "Provider changelogs are fetched daily at 08:00 UTC and processed at 08:15 UTC, so a change shipped during the day reaches you the next morning. You do not have to wait for the cron — an on-demand scan runs immediately and reports what it finds.",
      },
      {
        q: "What happens if I disconnect GitHub?",
        a: "Background scanning pauses until you reconnect. Your connected repositories, scan history, alerts and findings are all retained, so reconnecting resumes where you left off. Nothing is deleted on disconnect.",
      },
      {
        q: "What does Breaklytix actually monitor?",
        a: "Public changelogs and release notes for 44 provider APIs, spanning payments, communication, AI/ML, cloud and developer infrastructure. Detection is deterministic — regex and structured scraping, no language model in the monitoring path — so the same published change always produces the same result.",
      },
      {
        q: "How is Breaklytix different from Dependabot?",
        a: "Dependabot watches package versions inside your dependency file. Breaklytix watches the changelogs of third-party APIs you call, and then maps a published change onto the exact files, lines and symbols in your repository that could break. A provider can change behaviour without shipping a new package version, and Dependabot stays silent on that.",
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
    related: ["breaking-api-changes", "changelog", "providers"],
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
    related: ["breaking-api-changes", "deprecated-apis", "providers"],
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