import type { Metadata } from "next";
import { SITE_URL, pageOpenGraph } from "@/lib/site";
import SeoLandingPage from "@/components/SeoLandingPage";

export const metadata: Metadata = {
  title: "API Deprecation Monitoring for Your Stack",
  description:
    "Track API deprecations across providers you use. Breaklytix monitors changelogs and alerts when deprecated calls are still in your code.",
  alternates: { canonical: `${SITE_URL}/api-deprecation-monitoring` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/api-deprecation-monitoring"),
};

const sections = [
  {
    heading: "What API deprecation monitoring covers",
    paragraphs: [
      "API deprecation monitoring tracks the notices providers publish when an endpoint, field, parameter or SDK method is being phased out. It tells you which deprecated calls still exist in your codebase and gives you time to migrate before the provider removes them.",
      "Deprecations are easy to miss because they are usually announced in a changelog rather than in an error response. By the time the removed endpoint returns a 404, the migration is urgent.",
    ],
  },
  {
    heading: "How Breaklytix handles deprecations",
    paragraphs: [
      "Breaklytix scans your repository for provider usage and fetches official changelogs daily. Each classified deprecation is matched against the endpoints, SDKs and symbols your code calls.",
      "When a match is found, Breaklytix raises an alert with the repository, file and line, labelled as a deprecation with a confidence rating. Mechanical migrations can be proposed as reviewable pull requests.",
    ],
    bullets: [
      "Daily fetch of official provider changelogs",
      "Deprecation entries classified separately from breaking changes",
      "Matched against your detected endpoints and SDK calls",
      "File and line references in every alert",
    ],
  },
  {
    heading: "Plan migrations before the deadline",
    paragraphs: [
      "A deprecation notice gives you a window to migrate on your own schedule. Breaklytix keeps that window visible by surfacing the affected code the day the notice is published, not the day the endpoint stops responding.",
    ],
  },
];

const faqs = [
  {
    q: "Does Breaklytix track deprecations for SDK methods too?",
    a: "Yes. Deprecation notices that reference SDK classes, methods or parameters are matched against the symbols detected in your code.",
  },
  {
    q: "Will I be alerted for every deprecation a provider publishes?",
    a: "No. Only deprecations that overlap the endpoints, SDKs or symbols detected in your connected repositories raise an alert.",
  },
  {
    q: "Can I see deprecated usage without connecting a repo?",
    a: "The instant repo scan on the homepage reports the APIs a public repository uses and a code health score. Connecting a repository enables daily monitoring and alerts.",
  },
  {
    q: "How are deprecation alerts delivered?",
    a: "Alerts are shown in the dashboard and can be delivered by email when a matched change is detected.",
  },
];

export default function Page() {
  return (
    <SeoLandingPage
      path="/api-deprecation-monitoring"
      title="API Deprecation Monitoring for Your Stack"
      description="Track API deprecations across the providers your code uses. Breaklytix monitors provider changelogs and alerts you when a deprecated endpoint or field is still in your code."
      h1="API Deprecation Monitoring"
      intro="Breaklytix monitors provider changelogs for deprecation notices and alerts you when a deprecated endpoint, field or SDK method is still called by your code. Migrate on your schedule, not the provider's."
      sections={sections}
      faqs={faqs}
      cta="Scan your repository for free"
    />
  );
}
