import type { Metadata } from "next";
import { DOC_SECTIONS, docsBySection, DOCS } from "@/lib/docs";
import { SITE_URL, pageOpenGraph } from "@/lib/site";
import { LogoMark } from "@/components/Logo";
import { DocsSearch } from "@/components/DocsSearch";
import { BreadcrumbJsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  // No "| Breaklytix" suffix here — the root layout title template already
  // appends "· Breaklytix" (a full suffix produced a duplicated brand).
  title: "API Monitoring Documentation and Guides",
  description:
    "Guides for monitoring provider API changelogs, detecting code breaks in your repositories, running fire drills, and using the Breaklytix Impact Engine.",
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/docs"),
  alternates: { canonical: `${SITE_URL}/docs` },
};

export default function DocsPage() {
  const groups = docsBySection();
  return (
    <div className="p-docs">
      <BreadcrumbJsonLd name="Documentation" path="/docs" />
      <header className="p-docs-hero" style={{ padding: "72px 24px 48px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <LogoMark size={44} />
          </div>
          <h1 className="h1" style={{ marginBottom: 12 }}>Breaklytix Documentation</h1>
          <p className="p" style={{ maxWidth: 620, margin: "0 auto" }}>
            Everything about monitoring the APIs you depend on, detecting code breaks, and
            acting before provider changes break your product.
          </p>
        </div>
      </header>

      <DocsSearch />

      <main className="p-docs-main" style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px 80px" }}>
        {groups.map((group) => (
          <section key={group.section} className="p-docs-section" style={{ marginBottom: 40 }}>
            <h2 className="h2" style={{ marginBottom: 4 }}>{group.section}</h2>
            <p className="p" style={{ color: "var(--muted-strong, #55555f)", marginBottom: 16, fontSize: 15 }}>
              {DOC_SECTIONS.find((s) => s.name === group.section)?.blurb}
            </p>
            <div className="p-docs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {group.articles.map((a) => (
                <a key={a.slug} href={`/docs/${a.slug}`} className="p-docs-card">
                  <strong style={{ display: "block", marginBottom: 6 }}>{a.title}</strong>
                  <span style={{ fontSize: 13, color: "var(--muted-strong, #55555f)", lineHeight: 1.5 }}>{a.summary}</span>
                </a>
              ))}
            </div>
          </section>
        ))}

        <p className="p" style={{ textAlign: "center", color: "var(--muted-strong, #55555f)", fontSize: 13, marginTop: 40 }}>
          {DOCS.length} articles covering every feature of Breaklytix.
        </p>

        <nav aria-label="Policies" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, marginTop: 18, fontSize: 13 }}>
          <a href="/privacy" style={{ color: "var(--accent-text, #4f46e5)" }}>Privacy Policy</a>
          <a href="/terms" style={{ color: "var(--accent-text, #4f46e5)" }}>Terms of Service</a>
          <a href="/acceptable-use" style={{ color: "var(--accent-text, #4f46e5)" }}>Acceptable Use</a>
          <a href="/cookies" style={{ color: "var(--accent-text, #4f46e5)" }}>Cookies</a>
        </nav>
      </main>
    </div>
  );
}