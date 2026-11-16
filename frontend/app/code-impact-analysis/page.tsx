import type { Metadata } from "next";
import { SITE_URL, pageOpenGraph } from "@/lib/site";
import SeoLandingPage from "@/components/SeoLandingPage";

export const metadata: Metadata = {
  title: "Code Impact Analysis for API Changes",
  description:
    "Breaklytix maps each provider change to the repositories, files and lines that use the affected endpoint, so you know exactly what to fix and where.",
  alternates: { canonical: `${SITE_URL}/code-impact-analysis` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/code-impact-analysis"),
};

const sections = [
  {
    heading: "What code impact analysis means",
    paragraphs: [
      "Code impact analysis answers a specific question: when a provider publishes a change, which parts of your codebase are actually affected? Instead of a generic 'Stripe changed something', you get the repository, file and line that calls the affected endpoint.",
      "That precision is what makes the alert actionable. A team can open the referenced file, understand the usage and ship a fix without searching the whole codebase.",
    ],
  },
  {
    heading: "How Breaklytix performs code impact analysis",
    paragraphs: [
      "Breaklytix scans connected GitHub repositories and builds a map of third-party API usage: SDK imports, HTTP endpoints, object and method calls, and environment variable names. It stores the file and line for each detection.",
      "When a classified provider change is fetched, Breaklytix matches it against that map. Matches become alerts that carry the repository, file and line of the affected usage, along with a confidence rating.",
    ],
    bullets: [
      "Detection of providers, SDKs, endpoints and symbols in your code",
      "Confidence-rated matching against published provider changes",
      "File and line references in every alert",
      "Proposed fixes as reviewable pull requests",
    ],
  },
  {
    heading: "Reduce noise, focus on real impact",
    paragraphs: [
      "A provider change that does not touch anything your code calls is not reported as a risk. Breaklytix only surfaces changes with a concrete overlap beyond the provider name, so alerts stay relevant.",
    ],
  },
];

const faqs = [
  {
    q: "Does Breaklytix support private repositories?",
    a: "Yes. Repository scanning uses the GitHub access you authorize, including private repositories. Breaklytix reads repository contents to detect API usage.",
  },
  {
    q: "How precise are the file and line references?",
    a: "Breaklytix records the file path and line number for each detected usage, so alerts point at the exact location in your code.",
  },
  {
    q: "Can Breaklytix propose fixes?",
    a: "Mechanical fixes can be proposed as reviewable pull requests. A human still reviews and merges every change.",
  },
  {
    q: "Is there a free way to try it?",
    a: "Yes. The instant repo scan on the homepage analyses a public GitHub repository and reports the APIs it uses plus a code health score, with no account required.",
  },
];

export default function Page() {
  return (
    <SeoLandingPage
      path="/code-impact-analysis"
      title="Code Impact Analysis for API Changes"
      description="Breaklytix maps each provider change to the repositories, files and lines that use the affected endpoint, so you know exactly what to fix and where."
      h1="Code Impact Analysis"
      intro="Breaklytix performs code impact analysis for every provider change: it maps each published change to the repositories, files and lines that use the affected endpoint. Know exactly what to fix and where."
      sections={sections}
      faqs={faqs}
      cta="Scan your repository for free"
    />
  );
}
