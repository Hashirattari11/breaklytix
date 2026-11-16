import Link from "next/link";
import { LegalFooter } from "./LegalLayout";
import { LogoMark } from "./Logo";
import { SITE_NAME, SITE_URL, pageOpenGraph } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonld";

export type SeoSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type SeoFaq = { q: string; a: string };

export default function SeoLandingPage({
  path,
  title,
  description,
  h1,
  intro,
  sections,
  faqs,
  cta,
}: {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: SeoSection[];
  faqs: SeoFaq[];
  cta: string;
}) {
  const url = `${SITE_URL}${path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: title,
        description,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: h1, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
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
          {h1}
        </h1>
        <p className="p" style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 32 }}>
          {intro}
        </p>

        {sections.map((s) => (
          <section key={s.heading} style={{ marginBottom: 40 }}>
            <h2 className="h2" style={{ fontSize: 22, marginBottom: 10 }}>{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} style={{ lineHeight: 1.7, fontSize: 15.5, marginBottom: 12 }}>{p}</p>
            ))}
            {s.bullets && s.bullets.length ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 8, lineHeight: 1.7, fontSize: 15.5 }}>
                {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            ) : null}
          </section>
        ))}

        <section style={{ marginBottom: 40 }}>
          <h2 className="h2" style={{ fontSize: 22, marginBottom: 14 }}>Frequently asked questions</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {faqs.map((f) => (
              <div
                key={f.q}
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 12,
                  padding: "16px 18px",
                  background: "var(--surface, #fff)",
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{f.q}</h3>
                <p style={{ margin: 0, lineHeight: 1.65, fontSize: 14.5 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>Related guides</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, lineHeight: 1.7, fontSize: 14.5 }}>
            {[
              { href: "/api-change-monitoring", label: "API Change Monitoring" },
              { href: "/api-breaking-changes", label: "API Breaking Changes" },
              { href: "/api-deprecation-monitoring", label: "API Deprecation Monitoring" },
              { href: "/code-impact-analysis", label: "Code Impact Analysis" },
              { href: "/third-party-api-monitoring", label: "Third-Party API Monitoring" },
            ].filter((l) => l.href !== path).map((l) => (
              <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
            ))}
          </ul>
        </section>

        <section style={{ marginBottom: 8, textAlign: "center" }}>
          <Link href="/#instant-scan" className="btn btn-primary" style={{ display: "inline-block", padding: "14px 28px", borderRadius: 12, fontSize: 15, fontWeight: 700 }}>
            {cta}
          </Link>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
            Free instant scan. No credit card. <Link href="/pricing">See pricing</Link>.
          </p>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}
