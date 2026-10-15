import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /authorize is intentionally absent — it returns 404 and disallowing a
        // non-existent URL only adds noise to the ruleset.
        disallow: ["/dashboard", "/admin", "/auth"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}