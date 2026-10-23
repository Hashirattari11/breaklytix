// Central site config — single source of truth for SEO metadata.
// Custom domain verified on Vercel (2026-10-01).
export const SITE_URL = "https://breaklytix.site";
export const SITE_NAME = "Breaklytix";
// Keep between 150–160 chars so search engines show the full snippet.
export const SITE_DESCRIPTION =
  "Breaklytix detects the third-party APIs your repos use, monitors 44+ provider changelogs around the clock, and alerts you the moment a breaking change ships.";

// Support contact. Configure via NEXT_PUBLIC_SUPPORT_EMAIL. The default is the
// brand-domain address; the mailbox/forwarding for it must be provisioned by an
// operator (see PRODUCTION_READINESS_REPORT.md) before claiming it is monitored.
export const SUPPORT_EMAIL =
  (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "").trim() || "support@breaklytix.site";

/**
 * Build the per-page `openGraph` block for a public marketing/docs page.
 *
 * Next.js does NOT derive og:url from `alternates.canonical`, and the root
 * layout deliberately leaves openGraph.url unset. Without an explicit url here
 * every page falls back to the URL that was fetched, which works — but the
 * helper makes the canonical OG url explicit and keeps every page consistent.
 * Title/description are intentionally omitted so Next inherits the page's own
 * `title` / `description` instead of a site-wide boilerplate string.
 */
export function pageOpenGraph(path = "/") {
  const url = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
  return { url, type: "website" as const, siteName: SITE_NAME };
}

// Legal operator configuration. Set NEXT_PUBLIC_LEGAL_ENTITY and
// NEXT_PUBLIC_LEGAL_ADDRESS in the hosting environment when a registered
// address is legally required; public pages only render the address when it is
// non-empty (never "undefined"/"null" or a placeholder).
export const LEGAL_ENTITY =
  (process.env.NEXT_PUBLIC_LEGAL_ENTITY || "").trim() || "Breaklytix";
export const LEGAL_ADDRESS = (process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "").trim();

/** Absolute URL builder — all canonical / og / schema URLs go through this. */
export function absoluteUrl(path = "/"): string {
  if (!path || path === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Real "content last changed" dates for the static marketing routes.
 *
 * The sitemap used to stamp `new Date()` at build time, so all 42 URLs claimed
 * to have changed on every single deploy. Search engines learn to ignore a
 * lastmod that always equals the crawl date, which throws away the one signal
 * that gets a changed page recrawled quickly.
 *
 * Bump the entry for a route when you actually change its copy. The docs
 * articles read their own dates from `lib/docs-seo.ts`.
 */
export const CONTENT_UPDATED: Record<string, string> = {
  "/": "2026-10-22",
  "/about": "2026-10-21",
  "/providers": "2026-10-21",
  "/pricing": "2026-10-22",
  "/docs": "2026-10-22",
  "/contact": "2026-10-21",
  "/privacy": "2026-10-21",
  "/terms": "2026-10-21",
  "/security": "2026-10-21",
  "/acceptable-use": "2026-10-21",
  "/cookies": "2026-10-21",
};