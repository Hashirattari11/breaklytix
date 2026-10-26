import type { Metadata } from "next";
import { LegalFooter } from "@/components/LegalLayout";
import { LogoMark } from "@/components/Logo";
import Link from "next/link";
import { LEGAL_ENTITY, SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonld";

/**
 * /about — the entity page.
 *
 * Search engines and answer engines need one unambiguous page that says who
 * operates the site, what the product actually is, and how it is built. Without
 * it, an Organization node in JSON-LD has no page to point at and every claim
 * about the product is only made on the marketing homepage.
 *
 * Everything here is verifiable from the product itself or from /security and
 * /privacy — no founding myths, team-size claims, or addresses we cannot back up.
 */

export const metadata: Metadata = {
  title: "About Breaklytix and How It Works",
  description:
    "Breaklytix monitors provider changelogs, detects breaking API changes, and maps each one to the exact files in your GitHub repositories.",
  alternates: { canonical: `${SITE_URL}/about` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/about"),
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "@id": `${SITE_URL}/about#page`,
      url: `${SITE_URL}/about`,
      name: `About ${SITE_NAME}`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
      about: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: LEGAL_ENTITY,
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
      description: `${SITE_NAME} monitors third-party API changelogs and maps breaking changes to the code that depends on them.`,
      email: SUPPORT_EMAIL,
      sameAs: [] as string[],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "About", item: `${SITE_URL}/about` },
      ],
    },
  ],
};

const PRINCIPLES = [
  {
    title: "Access you control",
    body: "Repository scanning uses the GitHub access you authorize with the repo scope, including private repositories. Breaklytix reads repository contents to detect API usage; it never pushes, merges or edits a repository unless you explicitly enable auto-fix pull requests, and even then a human reviews and merges.",
  },
  {
    title: "Official sources only",
    body: "Changes come from each provider's own changelog, release notes or release feed. No scraped aggregators, no guessed release dates, no invented severity scores.",
  },
  {
    title: "Provider keys encrypted",
    body: "Scanning detects which APIs your code calls from imports, packages, endpoint strings and environment variable names; it does not need provider credentials. If you add a provider API key for runtime signals, it is encrypted with Fernet at rest and never returned to the browser.",
  },
  {
    title: "Honest empty states",
    body: "When a provider has no telemetry yet, the dashboard says so instead of showing a synthetic health score. An alert that does not match your code is labelled unmatched, not silently dismissed.",
  },
];

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--surface, #ffffff)",
          borderBottom: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Link href="/" className="brand" style={{ color: "var(--text)", fontSize: 17 }}>
            <LogoMark size={26} withWordmark />
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 13 }}>
            <Link href="/providers" style={{ color: "var(--muted)", textDecoration: "none" }}>Providers</Link>
            <Link href="/pricing" style={{ color: "var(--muted)", textDecoration: "none" }}>Pricing</Link>
            <Link href="/docs" style={{ color: "var(--muted)", textDecoration: "none" }}>Docs</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "56px 24px 96px" }}>
        <h1 className="h1" style={{ fontSize: 38, lineHeight: 1.15, marginBottom: 14 }}>
          About {SITE_NAME}
        </h1>
        <p className="p" style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 32 }}>
          {SITE_NAME} is an API change monitoring service. It watches the changelogs of the third-party
          APIs a codebase depends on, detects changes that can break an integration, and maps each one to
          the repositories, files and lines that use the affected endpoint.
        </p>

        <section style={{ marginBottom: 40 }}>
          <h2 className="h2" style={{ fontSize: 22, marginBottom: 10 }}>The problem it solves</h2>
          <p style={{ lineHeight: 1.7, fontSize: 15.5 }}>
            Every application sits on a stack of external APIs — payments, messaging, AI models, storage,
            auth. Those providers publish breaking changes continuously, but the announcement lands in a
            changelog nobody on the team reads. The change reaches production later as a failed request in
            a place that is hard to trace back to a provider release note.
          </p>
          <p style={{ lineHeight: 1.7, fontSize: 15.5 }}>
            {SITE_NAME} closes that gap in both directions: it reads the provider side so you do not have
            to, and it reads your code so an alert only fires when the change actually touches something
            you call.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 className="h2" style={{ fontSize: 22, marginBottom: 10 }}>How it works</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10, lineHeight: 1.7, fontSize: 15.5 }}>
            <li>Connect a GitHub repository through OAuth.</li>
            <li>The scanner maps the providers, SDKs, endpoints and environment variable names your code uses.</li>
            <li>Provider changelogs are fetched daily and normalised into classified change entries.</li>
            <li>Each entry is matched against your detected usage; matches become alerts with file and line references.</li>
            <li>Mechanical fixes can be proposed as reviewable pull requests.</li>
          </ol>
          <p style={{ fontSize: 14, color: "var(--muted-strong, #55555f)", marginTop: 14 }}>
            Read the full documentation at <Link href="/docs">/docs</Link>, or browse the{" "}
            <Link href="/providers">list of monitored providers</Link>.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 className="h2" style={{ fontSize: 22, marginBottom: 14 }}>Design principles</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 12,
                  padding: "16px 18px",
                  background: "var(--surface, #fff)",
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{p.title}</h3>
                <p style={{ margin: 0, lineHeight: 1.65, fontSize: 14.5 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 8 }}>
          <h2 className="h2" style={{ fontSize: 22, marginBottom: 10 }}>Contact</h2>
          <p style={{ lineHeight: 1.7, fontSize: 15.5 }}>
            Questions about the product, security, or data handling:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent-text, #4f46e5)" }}>{SUPPORT_EMAIL}</a>.
            The service is operated by {LEGAL_ENTITY}. See the{" "}
            <Link href="/security">security overview</Link>, <Link href="/privacy">privacy policy</Link> and{" "}
            <Link href="/terms">terms of service</Link> for the formal details.
          </p>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}
