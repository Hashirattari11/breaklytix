import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonld";

/**
 * BreadcrumbList for a two-level public page (Home › Page).
 *
 * Marketing and legal pages had no structured data at all, so the search
 * result showed a bare URL instead of a breadcrumb trail. The markup mirrors
 * the visible URL hierarchy exactly — Google only renders a breadcrumb rich
 * result when the trail matches what a visitor can navigate.
 */
export function BreadcrumbJsonLd({ name, path }: { name: string; path: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}

/**
 * ContactPage + Organization contactPoint.
 *
 * /contact is one of the two thinnest public pages and previously carried only
 * a BreadcrumbList, so search engines had no machine-readable way to attach the
 * support address to the Breaklytix entity. Everything here mirrors what is
 * already visible on the page (support email, canonical URL) — nothing invented.
 */
export function ContactPageJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: `Contact ${SITE_NAME}`,
    url: `${SITE_URL}/contact`,
    mainEntity: {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: SUPPORT_EMAIL,
          url: `${SITE_URL}/contact`,
          availableLanguage: ["en"],
        },
      ],
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}
