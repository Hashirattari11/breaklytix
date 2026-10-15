// Central site config — single source of truth for SEO metadata.
// Custom domain verified on Vercel (2026-10-01).
export const SITE_URL = "https://breaklytix.site";
export const SITE_NAME = "Breaklytix";
// Keep between 150–160 chars so search engines show the full snippet.
export const SITE_DESCRIPTION =
  "Breaklytix detects the third-party APIs your repos use, monitors 44+ provider changelogs around the clock, and alerts you the moment a breaking change ships.";

// Support contact. Configure via NEXT_PUBLIC_SUPPORT_EMAIL; falls back to the
// project's actual support address (also shown on the login page).
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hashirattari73@gmail.com";

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

// Legal operator placeholder — replace with the registered company name/address
// before a commercial launch (see NEXT_PUBLIC_LEGAL_ENTITY / _ADDRESS).
export const LEGAL_ENTITY =
  process.env.NEXT_PUBLIC_LEGAL_ENTITY || "Breaklytix";
export const LEGAL_ADDRESS = process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "";