import { SITE_URL } from "@/lib/site";
import { SITEMAP_HEADERS, SITEMAP_SECTIONS, latest, sitemapIndexXml } from "@/lib/sitemap";

// Submit this URL: https://breaklytix.site/sitemap.xml
// It is an index; the crawler follows the child sitemaps from here.
export const dynamic = "force-static";

export function GET() {
  const children = SITEMAP_SECTIONS.map(({ id, build }) => {
    const entries = build();
    return { loc: `${SITE_URL}/sitemap/${id}.xml`, lastmod: latest(entries) };
  });

  return new Response(sitemapIndexXml(children), { headers: SITEMAP_HEADERS });
}
