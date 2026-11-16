import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, pageOpenGraph } from "@/lib/site";
import SeoLandingPage from "@/components/SeoLandingPage";

export const metadata: Metadata = {
  title: "API Change Monitoring for Your Codebase",
  description:
    "Breaklytix monitors third-party API changelogs and maps every change to the files and lines in your repositories. Catch breaking API changes before they reach production.",
  alternates: { canonical: `${SITE_URL}/api-change-monitoring` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/api-change-monitoring"),
};

const sections = [
  {
    heading: "What is API change monitoring?",
    paragraphs: [
      "API change monitoring is the practice of tracking the release notes, changelogs and deprecation notices published by the third-party APIs your application depends on, and checking whether any of those changes affect the code you actually ship.",
      "Most teams only learn about an API change when a request starts failing in production. API change monitoring moves that signal earlier: it reads the provider side for you and tells you, in your own repository, which calls are at risk.",
    ],
  },
  {
    heading: "How Breaklytix monitors API changes",
    paragraphs: [
      "Breaklytix connects to your GitHub repositories and scans them for third-party API usage — SDK imports, endpoint strings, environment variable names and package dependencies. It then fetches each provider's official changelog daily and classifies every entry.",
      "When a change matches a detected usage, Breaklytix creates an alert pointing at the exact file and line. Mechanical fixes can be proposed as reviewable pull requests.",
    ],
    bullets: [
      "Daily fetch of 44 provider changelogs from official sources only",
      "Detection of SDKs, endpoints, objects and environment variables in your code",
      "Confidence-rated matches, never a blanket 'this may break' guess",
      "File and line references in every alert",
    ],
  },
  {
    heading: "Why it matters",
    paragraphs: [
      "Third-party APIs change on their own schedule. A renamed field, a removed endpoint or a new authentication requirement can break an integration silently. API change monitoring gives your team time to react before users see the failure.",
    ],
  },
];

const faqs = [
  {
    q: "What kinds of API changes does Breaklytix track?",
    a: "Breaking changes, deprecations, API version changes, endpoint changes, request and response schema changes, authentication changes, SDK changes, rate-limit changes and behaviour changes published in official provider changelogs.",
  },
  {
    q: "Does Breaklytix read my source code?",
    a: "Yes — with the GitHub access you authorize. It reads repository contents to detect which APIs your code calls. It never pushes or merges changes on its own; proposed fixes are pull requests you review and merge.",
  },
  {
    q: "How often are changelogs checked?",
    a: "Provider changelogs are fetched daily. Alerts are created when a classified change matches detected usage in a connected repository.",
  },
  {
    q: "Is there a free way to try it?",
    a: "Yes. The instant repo scan on the homepage analyses a public GitHub repository and reports the APIs it uses plus a code health score, with no account required.",
  },
];

export default function Page() {
  return (
    <SeoLandingPage
      path="/api-change-monitoring"
      title="API Change Monitoring for Your Codebase"
      description="Breaklytix monitors third-party API changelogs and maps every change to the files and lines in your repositories. Catch breaking API changes before they reach production."
      h1="API Change Monitoring"
      intro="Breaklytix watches the changelogs of the third-party APIs your code depends on and tells you, file by file, when a published change may affect your integration. Stop learning about breaking API changes from production errors."
      sections={sections}
      faqs={faqs}
      cta="Scan your repository for free"
    />
  );
}
