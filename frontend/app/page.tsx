import type { Metadata } from "next";
import LandingClient from "../components/LandingClient";
import { SITE_URL, SITE_DESCRIPTION } from "../lib/site";

export const metadata: Metadata = {
  title: "Breaklytix — Know What API Changes Will Break Your Code",
  description:
    "Breaklytix monitors API changes and maps their potential impact to your GitHub repositories, files, and code usage before they become production incidents.",
  alternates: { canonical: SITE_URL + "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Breaklytix — Know What API Changes Will Break Your Code",
    description: SITE_DESCRIPTION,
    url: SITE_URL + "/",
    type: "website",
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
        "@type": "Offer",
        url: SITE_URL + "/pricing",
      },
    },
    {
      "@type": "Organization",
      name: "Breaklytix",
      url: SITE_URL + "/",
      logo: SITE_URL + "/opengraph-image.png",
    },
    {
      "@type": "WebSite",
      name: "Breaklytix",
      url: SITE_URL + "/",
      publisher: { "@type": "Organization", name: "Breaklytix" },
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
