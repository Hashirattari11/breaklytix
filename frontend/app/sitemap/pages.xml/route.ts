import { SITEMAP_HEADERS, sectionEntries, urlsetXml } from "@/lib/sitemap";

export const dynamic = "force-static";

export function GET() {
  return new Response(urlsetXml(sectionEntries("pages")), { headers: SITEMAP_HEADERS });
}
