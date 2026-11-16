import type { Metadata } from "next";
import { SITE_URL, pageOpenGraph } from "@/lib/site";
import SeoLandingPage from "@/components/SeoLandingPage";

export const metadata: Metadata = {
  title: "API Breaking Changes: Detect Them Before Production",
  description:
    "Breaklytix detects API breaking changes published by your providers and maps each one to the exact files and lines in your code that use the affected endpoint.",
  alternates: { canonical: `${SITE_URL}/api-breaking-changes` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/api-breaking-changes"),
};

const sections = [
  {
    heading: "What counts as an API breaking change",
    paragraphs: [
      "An API breaking change is any published modification to a provider's interface that can make an existing integration fail: a removed or renamed endpoint, a changed request or response field, a new required parameter, an authentication change, a version deprecation, or a rate-limit change.",
      "Providers publish these in changelogs and release notes. The problem is that the announcement is rarely read by the people whose code depends on it.",
    ],
  },
  {
    heading: "How Breaklytix surfaces breaking API changes",
    paragraphs: [
      "Breaklytix scans your repository to find every third-party API call — SDK imports, HTTP endpoints, environment variables and package dependencies. It then fetches provider changelogs daily and classifies each entry.",
      "When a classified change overlaps the endpoints, SDKs or symbols detected in your code, Breaklytix raises an alert with the repository, file and line. Alerts are confidence-rated so you can triage them honestly.",
    ],
    bullets: [
      "Official provider sources only — no scraped aggregators",
      "Matching against your detected usage, not just the provider name",
      "File and line references in every alert",
      "Mechanical fixes proposed as reviewable pull requests",
    ],
  },
  {
    heading: "React before the change reaches production",
    paragraphs: [
      "Because alerts arrive while the change is still a release note, your team can update the affected code, run tests and ship a fix before the provider removes or alters the behaviour.",
    ],
  },
];

const faqs = [
  {
    q: "How is a breaking API change different from a deprecation?",
    a: "A deprecation is a warning that something will be removed or changed later. A breaking change is the actual removal or alteration. Breaklytix tracks both and labels them separately.",
  },
  {
    q: "Does Breaklytix guess whether a change will break my code?",
    a: "No. It matches the provider's published change against the endpoints, SDKs and symbols detected in your repository. If there is no concrete overlap beyond the provider name, the change is not reported as a risk.",
  },
  {
    q: "Which providers are covered?",
    a: "Breaklytix monitors 44 providers including Stripe, OpenAI, Anthropic, Twilio, SendGrid, Supabase, Firebase, Slack, Resend, Shopify, PayPal, Plaid, Clerk, Auth0, Algolia, Sentry and others. See the full list on the providers page.",
  },
  {
    q: "Can I scan a public repo without signing up?",
    a: "Yes. The instant repo scan on the homepage analyses a public GitHub repository and reports the APIs it uses plus a code health score, with no account required.",
  },
];

export default function Page() {
  return (
    <SeoLandingPage
      path="/api-breaking-changes"
      title="API Breaking Changes: Detect Them Before Production"
      description="Breaklytix detects API breaking changes published by your providers and maps each one to the exact files and lines in your code that use the affected endpoint."
      h1="API Breaking Changes"
      intro="Breaklytix detects API breaking changes the moment a provider publishes them and maps each one to the exact files and lines in your code that use the affected endpoint. Find out before production does."
      sections={sections}
      faqs={faqs}
      cta="Scan your repository for free"
    />
  );
}
