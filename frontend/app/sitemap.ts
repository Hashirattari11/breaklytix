import type { MetadataRoute } from "next";
import { CONTENT_UPDATED, SITE_URL } from "@/lib/site";
import { DOCS } from "@/lib/docs";
import { DOC_SEO } from "@/lib/docs-seo";

// Public marketing/legal/docs pages only — private/authenticated routes
// (dashboard, admin, auth, authorize) and noindexed pages (/login) are never
// listed.
//
// `lastModified` is a per-route constant, not `new Date()`. A build timestamp
// makes every URL look modified on every deploy, which search engines discount
// to noise; a stable, real date keeps the signal usable. See CONTENT_UPDATED.
const PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/providers", priority: 0.8, changeFrequency: "weekly" },
  { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/security", priority: 0.4, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
  { path: "/acceptable-use", priority: 0.2, changeFrequency: "monthly" },
  { path: "/cookies", priority: 0.2, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = PAGES.map(({ path, priority, changeFrequency }) => ({
    // Next normalises the home canonical to `https://breaklytix.site` (no
    // trailing slash), so the sitemap entry matches it exactly.
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    lastModified: CONTENT_UPDATED[path] ?? undefined,
    changeFrequency,
    priority,
  }));

  const docPages = DOCS.map((doc) => ({
    url: `${SITE_URL}/docs/${doc.slug}`,
    lastModified: DOC_SEO[doc.slug]?.updated,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...pages, ...docPages];
}
