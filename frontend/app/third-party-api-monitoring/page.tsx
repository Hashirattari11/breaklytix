import type { Metadata } from "next";
import { SITE_URL, pageOpenGraph } from "@/lib/site";
import SeoLandingPage from "@/components/SeoLandingPage";

export const metadata: Metadata = {
  title: "Third-Party API Monitoring for Your Code",
  description:
    "Breaklytix monitors third-party APIs your repos depend on, scanning code for usage and alerting on breaking changes.",
  alternates: { canonical: `${SITE_URL}/third-party-api-monitoring` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/third-party-api-monitoring"),
};

const sections = [
  {
    heading: "What third-party API monitoring means",
    paragraphs: [
      "Third-party API monitoring is the practice of keeping track of the external services your application relies on — payments, messaging, AI models, storage, authentication — and the changes those providers publish that could affect your integration.",
      "It has two sides: the provider side (changelogs and release notes) and the code side (which endpoints and SDKs you actually call). Breaklytix connects both.",
    ],
  },
  {
    heading: "How Breaklytix monitors third-party APIs",
    paragraphs: [
      "Breaklytix connects to your GitHub repositories and scans them for third-party API usage. It then fetches each provider's official changelog daily and classifies every entry.",
      "When a classified change overlaps the detected usage, Breaklytix creates an alert with the repository, file and line. It also runs a code health report on the scanned repository, including dependency advisories and security patterns.",
    ],
    bullets: [
      "Detection of 44 monitored providers in your code",
      "Daily fetch of official provider changelogs",
      "Confidence-rated alerts with file and line references",
      "Code health report with dependency and security checks",
    ],
  },
  {
    heading: "See what your code depends on",
    paragraphs: [
      "Most teams do not have a complete list of the third-party APIs their code calls. Breaklytix builds that list by scanning imports, packages, endpoint strings and environment variable names, so you always know what your application depends on.",
    ],
  },
];

const faqs = [
  {
    q: "Which third-party APIs does Breaklytix monitor?",
    a: "Breaklytix monitors 44 providers including Stripe, OpenAI, Anthropic, Twilio, SendGrid, Supabase, Firebase, Slack, Resend, Shopify, PayPal, Plaid, Clerk, Auth0, Algolia, Sentry and others.",
  },
  {
    q: "Does Breaklytix work with private repositories?",
    a: "Yes. Repository scanning uses the GitHub access you authorize, including private repositories.",
  },
  {
    q: "How do I start monitoring my repos?",
    a: "Connect your GitHub account, add the repositories you want monitored, and Breaklytix will scan them and begin daily changelog checks.",
  },
  {
    q: "Can I try it without an account?",
    a: "Yes. The instant repo scan on the homepage analyses a public GitHub repository and reports the APIs it uses plus a code health score, with no account required.",
  },
];

export default function Page() {
  return (
    <SeoLandingPage
      path="/third-party-api-monitoring"
      title="Third-Party API Monitoring for Your Repositories"
      description="Breaklytix monitors the third-party APIs your repositories depend on, scanning code for API usage and alerting you when a provider publishes a breaking change."
      h1="Third-Party API Monitoring"
      intro="Breaklytix monitors the third-party APIs your repositories depend on. It scans your code to find every provider you use and alerts you when a provider publishes a change that may affect your integration."
      sections={sections}
      faqs={faqs}
      cta="Scan your repository for free"
    />
  );
}
