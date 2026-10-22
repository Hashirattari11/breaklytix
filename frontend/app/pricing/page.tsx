import type { Metadata } from "next";
import PricingClient from "../../components/PricingClient";
import { PRICING_FAQ } from "../../lib/pricing-faq";
import { SITE_URL, SITE_NAME, pageOpenGraph } from "../../lib/site";

export const metadata: Metadata = {
  title: "API Monitoring Pricing & Plans",
  description:
    "Transparent API monitoring pricing: Starter $500/mo for 10 APIs, Growth $2,000/mo for 50, Enterprise $10,000/mo. Every plan includes a 14-day free trial.",
  alternates: { canonical: SITE_URL + "/pricing" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/pricing"),
};

/**
 * Product + Offer structured data. Without this, pricing sits in a single
 * unlabelled card list and search engines have nothing to attach price or
 * plan information to. Kept in one object graph so all plans share a brand.
 */
const PRICING_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
    },
    {
      "@type": "Product",
      "@id": `${SITE_URL}/pricing#product`,
      name: `${SITE_NAME} API change monitoring`,
      description:
        "Monitors provider API changelogs and maps breaking changes to the exact files and lines in your GitHub repositories.",
      brand: { "@type": "Brand", name: SITE_NAME },
      category: "DeveloperApplication",
      offers: [
        {
          "@type": "Offer",
          name: "Starter",
          price: "500",
          priceCurrency: "USD",
          description: "Up to 10 monitored APIs per repository.",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/pricing`,
        },
        {
          "@type": "Offer",
          name: "Growth",
          price: "2000",
          priceCurrency: "USD",
          description: "Up to 50 monitored APIs per repository.",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/pricing`,
        },
        {
          "@type": "Offer",
          name: "Enterprise",
          price: "10000",
          priceCurrency: "USD",
          description: "Unlimited monitored APIs per repository.",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/contact`,
        },
      ],
    },
    // Pricing questions are the highest-intent queries on the page, so the
    // answers are also published as FAQPage. Rendered from the same PRICING_FAQ
    // array the accordion uses.
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/pricing#faq`,
      mainEntity: PRICING_FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_JSON_LD) }}
      />
      <PricingClient />
    </>
  );
}