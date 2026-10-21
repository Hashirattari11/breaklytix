import { SITE_URL } from "@/lib/site";

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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
