import type { MetadataRoute } from "next";
import { CONTENT_UPDATED, SITE_URL } from "@/lib/site";
import { DOCS } from "@/lib/docs";
import { DOC_SEO } from "@/lib/docs-seo";

/**
 * Single source of truth for `/sitemap.xml`.
 *
 * 29 URLs is small enough for one flat urlset, so that is what we ship: one
 * file a person can open and read top to bottom. A sitemap index would add a
 * second hop for the crawler and nothing else at this size.
 *
 * `lastModified` is a real per-route date (see CONTENT_UPDATED and
 * DOC_SEO[slug].updated), never `new Date()`. A build timestamp makes every URL
 * look modified on every deploy, and crawlers discount that to noise — which
 * throws away the one signal that gets a genuinely changed page recrawled.
 */
type SitemapEntry = MetadataRoute.Sitemap[number];

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

// Policy pages must be crawlable and indexable, but they are not acquisition
// pages, so they sit at the bottom of the priority range.
const LEGAL_PAGES: { path: string; priority: number }[] = [
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
  { path: "/acceptable-use", priority: 0.2 },
  { path: "/cookies", priority: 0.2 },
];

// The flagship explainer gets weekly crawl frequency. The other articles —
// including the two long-form guides — are reference material and stay monthly.
const FLAGSHIP_DOC = "breaking-api-changes";

function coreEntries(): SitemapEntry[] {
  return CORE_PAGES.map(({ path, priority, changeFrequency }) => ({
    // Next normalises the home canonical to `https://breaklytix.site` (no
    // trailing slash), so the sitemap entry matches it exactly.
    url: absolute(path),
    lastModified: CONTENT_UPDATED[path],
    changeFrequency,
    priority,
  }));
}

function docEntries(): SitemapEntry[] {
  return DOCS.map((doc) => ({
    url: `${SITE_URL}/docs/${doc.slug}`,
    lastModified: DOC_SEO[doc.slug]?.updated,
    changeFrequency: doc.slug === FLAGSHIP_DOC ? "weekly" : "monthly",
    priority: doc.slug === FLAGSHIP_DOC ? 0.8 : 0.6,
  }));
}

function legalEntries(): SitemapEntry[] {
  return LEGAL_PAGES.map(({ path, priority }) => ({
    url: absolute(path),
    lastModified: CONTENT_UPDATED[path],
    changeFrequency: "monthly",
    priority,
  }));
}

export function allEntries(): MetadataRoute.Sitemap {
  return [...coreEntries(), ...docEntries(), ...legalEntries()];
}
