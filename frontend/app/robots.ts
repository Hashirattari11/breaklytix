import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt
 *
 * Policy: allow everything that is public, block only routes a crawler has no
 * reason to spend budget on. Two rules drive the list:
 *
 *  - Never disallow `/_next/`. Google renders pages to judge them, and a
 *    blocked JS/CSS bundle makes a perfectly good page look broken.
 *  - Do not disallow a noindexed page that is still worth crawling. `/login`
 *    inherits `noindex` from the root layout, so it must stay crawlable — a
 *    robots.txt block would hide the noindex and leave the URL eligible to be
 *    indexed from links alone.
 *
 * AI and search crawlers (Googlebot, Bingbot, OAI-SearchBot, GPTBot,
 * ChatGPT-User, PerplexityBot) are intentionally covered by the single `*`
 * group rather than named one by one. In robots.txt a named group REPLACES the
 * `*` group for that crawler, so listing a bot with only `Allow: /` would
 * silently grant it `/dashboard` and `/admin`. The wildcard keeps one ruleset.
 * Verified 2026-10-22: all six user agents above received 200 with no
 * challenge header on /docs/breaking-api-changes.
 *
 * `/authorize/<token>` is deliberately absent: it returns 404 and disallowing a
 * non-existent path only adds noise to the ruleset.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard", // authenticated application
          "/admin", // internal admin screens
          "/auth", // OAuth callbacks and intermediate steps
          "/legal-acceptance", // post-signup consent gate, no standalone value
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
