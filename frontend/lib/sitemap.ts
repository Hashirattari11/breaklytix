import { CONTENT_UPDATED, SITE_URL } from "@/lib/site";
import { DOCS } from "@/lib/docs";
import { DOC_SEO } from "@/lib/docs-seo";

/**
 * Sitemap data, split by section.
 *
 * A single 43-URL sitemap works, but a sitemap index with one child per section
 * gives Search Console separate coverage numbers for marketing pages, docs and
 * legal pages. That is what makes an indexing problem visible: if 30 of 32 docs
 * are "Discovered – currently not indexed" while the marketing pages are fine,
 * the cause is the docs, not the whole site.
 *
 * `lastModified` is a real per-route date (see CONTENT_UPDATED and
 * DOC_SEO[slug].updated), never `new Date()`. A build timestamp makes every URL
 * look modified on every deploy, and crawlers discount that to noise.
 */
export type SitemapEntry = {
  url: string;
  lastModified?: string;
  changeFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
};

const absolute = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);

// Marketing routes that carry the commercial intent.
const CORE_PAGES: { path: string; priority: number; changeFrequency: SitemapEntry["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/providers", priority: 0.8, changeFrequency: "weekly" },
  { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/security", priority: 0.4, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.3, changeFrequency: "monthly" },
];

// Policy pages: they must be crawlable and indexable, but they are not
// acquisition pages, so they are separated from the marketing set.
const LEGAL_PAGES: { path: string; priority: number }[] = [
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
  { path: "/acceptable-use", priority: 0.2 },
  { path: "/cookies", priority: 0.2 },
];

// The one guide written to rank for informational queries. Everything else in
// /docs is reference material and stays at the default priority.
const FLAGSHIP_DOC = "breaking-api-changes";

export function coreEntries(): SitemapEntry[] {
  return CORE_PAGES.map(({ path, priority, changeFrequency }) => ({
    url: absolute(path),
    lastModified: CONTENT_UPDATED[path],
    changeFrequency,
    priority,
  }));
}

export function legalEntries(): SitemapEntry[] {
  return LEGAL_PAGES.map(({ path, priority }) => ({
    url: absolute(path),
    lastModified: CONTENT_UPDATED[path],
    changeFrequency: "monthly",
    priority,
  }));
}

export function docEntries(): SitemapEntry[] {
  return DOCS.map((doc) => ({
    url: `${SITE_URL}/docs/${doc.slug}`,
    lastModified: DOC_SEO[doc.slug]?.updated,
    changeFrequency: doc.slug === FLAGSHIP_DOC ? "weekly" : "monthly",
    priority: doc.slug === FLAGSHIP_DOC ? 0.8 : 0.6,
  }));
}

/** Newest lastModified in a set — used as the child sitemap's own lastmod. */
export function latest(entries: SitemapEntry[]): string | undefined {
  const dates = entries
    .map((entry) => entry.lastModified)
    .filter((value): value is string => Boolean(value))
    .sort();
  return dates.length ? dates[dates.length - 1] : undefined;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function urlsetXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`];
      if (entry.lastModified) parts.push(`    <lastmod>${entry.lastModified}</lastmod>`);
      if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      if (entry.priority !== undefined) parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function sitemapIndexXml(children: { loc: string; lastmod?: string }[]): string {
  const items = children
    .map(({ loc, lastmod }) => {
      const parts = [`    <loc>${escapeXml(loc)}</loc>`];
      if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

/** Section registry — the single place that decides what a child sitemap holds. */
export const SITEMAP_SECTIONS = [
  { id: "pages", build: coreEntries },
  { id: "docs", build: docEntries },
  { id: "legal", build: legalEntries },
] as const;

export function sectionEntries(id: (typeof SITEMAP_SECTIONS)[number]["id"]): SitemapEntry[] {
  const section = SITEMAP_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown sitemap section: ${id}`);
  return section.build();
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
} as const;
