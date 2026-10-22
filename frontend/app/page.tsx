import type { Metadata } from "next";
import LandingClient from "../components/LandingClient";
import { SITE_URL, SITE_DESCRIPTION, pageOpenGraph } from "../lib/site";
import { LANDING_FAQ } from "../lib/landing-faq";

export const metadata: Metadata = {
  title: "Breaklytix — Know What API Changes Will Break Your Code",
  description:
    "Breaklytix monitors API changes and maps their potential impact to your GitHub repositories, files, and code usage before they become production incidents.",
  alternates: { canonical: SITE_URL + "/" },
  robots: { index: true, follow: true },
  // pageOpenGraph("/") supplies url + type + siteName, matching every other
  // public page. This block previously hand-rolled `openGraph`, which is why
  // og:site_name was the ONLY public page missing it — social scrapers saw no
  // site name attached to the homepage share card.
  openGraph: {
    ...pageOpenGraph("/"),
    title: "Breaklytix — Know What API Changes Will Break Your Code",
    description: SITE_DESCRIPTION,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Breaklytix",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: SITE_URL + "/",
      description: SITE_DESCRIPTION,
      offers: {
        // Aggregate of the three plans on /pricing: Starter $500, Growth
        // $2,000, Enterprise $10,000. A bare Offer with only a url told search
        // engines nothing about price, which is the one thing a pricing entity
        // is supposed to carry.
        "@type": "AggregateOffer",
        url: SITE_URL + "/pricing",
        lowPrice: "500",
        highPrice: "10000",
        priceCurrency: "USD",
        offerCount: 3,
      },
    },
    {
      "@type": "Organization",
      name: "Breaklytix",
      url: SITE_URL + "/",
      logo: SITE_URL + "/logo.png",
    },
    {
      "@type": "WebSite",
      name: "Breaklytix",
      url: SITE_URL + "/",
      publisher: { "@type": "Organization", name: "Breaklytix" },
    },
    {
      "@type": "FAQPage",
      mainEntity: LANDING_FAQ.map((item) => ({
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingClient />
    </>
  );
}
