import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt
 *
 * Policy: allow everything public AND private. Private routes (dashboard,
 * admin, auth, consent gate) inherit `noindex` from the root layout, so
 * blocking them in robots.txt would only prevent Google from seeing the
 * noindex and turn them into "Blocked by robots.txt" in Search Console.
 * Letting Googlebot crawl them exercises the noindex signal instead.
 *
 * `/authorize/<token>` is deliberately absent for the same reason.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Private routes are noindex (via the root layout) rather than
        // blocked, so Googlebot can crawl them and see that signal.
        allow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
