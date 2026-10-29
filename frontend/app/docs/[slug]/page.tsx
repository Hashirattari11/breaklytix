import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDoc, docsBySection, relatedDocs, prevNext, type DocBlock } from "@/lib/docs";
import { DOC_SEO } from "@/lib/docs-seo";
import { SITE_URL, SITE_NAME, GITHUB_REPO_URL } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonld";
import { LogoMark } from "@/components/Logo";

export function generateStaticParams() {
  return docsBySection().flatMap((g) => g.articles.map((a) => ({ slug: a.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  const seo = DOC_SEO[doc.slug];
  const url = `${SITE_URL}/docs/${doc.slug}`;
  return {
    // `seo.title` is a keyword-bearing fragment tuned for search; the root
    // layout's `%s · Breaklytix` template appends the brand exactly once.
    // `doc.title` remains the on-page H1 (short, human, navigation-friendly).
    title: seo?.title ?? doc.title,
    description: seo?.description ?? doc.summary,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { url, type: "article", siteName: SITE_NAME },
  };
}

/**
 * TechArticle JSON-LD. Breadcrumbs + FAQ alone don't tell an answer engine
 * *what kind* of page this is or when it changed, which is what makes a doc
 * citation-eligible. `dateModified` comes from the same DOC_SEO table the
 * sitemap uses, so the two can never disagree.
 */
function ArticleJsonLd({ doc }: { doc: { title: string; slug: string; summary: string } }) {
  const seo = DOC_SEO[doc.slug];
  const data = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: seo?.title ?? doc.title,
    description: seo?.description ?? doc.summary,
    url: `${SITE_URL}/docs/${doc.slug}`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/docs/${doc.slug}` },
    dateModified: seo?.updated,
    inLanguage: "en",
    author: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
      sameAs: [GITHUB_REPO_URL],
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}

/** Docs › Section › Article breadcrumb, emitted on every article page. */
function BreadcrumbJsonLd({ doc }: { doc: { title: string; slug: string; section: string } }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Docs", item: `${SITE_URL}/docs` },
      { "@type": "ListItem", position: 3, name: doc.section, item: `${SITE_URL}/docs` },
      {
        "@type": "ListItem",
        position: 4,
        name: doc.title,
        item: `${SITE_URL}/docs/${doc.slug}`,
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}

/**
 * FAQPage JSON-LD for articles that declare `faq` pairs. The rendered <h3>/<p>
 * and this data come from the same source, so the structured data can never
 * drift from what a visitor reads on the page.
 */
function FaqJsonLd({
  doc,
  faq,
}: {
  doc: { title: string; slug: string };
  faq: { q: string; a: string }[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.t) {
    case "h":
      return <h2 className="h2" style={{ fontSize: 20, margin: "28px 0 8px" }}>{b.x}</h2>;
    case "p":
      return <p className="p" style={{ marginBottom: 12, lineHeight: 1.7 }}>{b.x}</p>;
    case "tip":
      return (
        <div style={{ borderRadius: 10, padding: "12px 14px", margin: "16px 0", fontSize: 14, lineHeight: 1.6, background: "var(--accent-soft, rgba(99,91,255,0.08))", border: "1px solid rgba(99,91,255,0.25)" }}>
          <strong style={{ display: "block", marginBottom: 2 }}>Tip</strong>
          {b.x}
        </div>
      );
    case "ul":
      return (
        <ul style={{ margin: "8px 0 16px", paddingLeft: 20, display: "grid", gap: 6 }}>
          {b.x.map((li, i) => (
            <li key={i} style={{ lineHeight: 1.6 }}>{li}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre style={{ padding: 14, borderRadius: 10, overflowX: "auto", fontSize: 13, lineHeight: 1.6, background: "var(--code-bg, #0f1117)", color: "#e2e8f0", margin: "12px 0 16px" }}>{b.x}</pre>
      );
    default:
      return null;
  }
}

export default async function DocArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const groups = docsBySection();
  const related = relatedDocs(doc.slug);
  const { prev, next } = prevNext(doc.slug);

  return (
    <div className="p-docs" style={{ paddingTop: 64 }}>
      <BreadcrumbJsonLd doc={doc} />
      <ArticleJsonLd doc={doc} />
      {doc.faq && doc.faq.length > 0 && <FaqJsonLd doc={doc} faq={doc.faq} />}
      <div className="p-docs-layout" style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px 80px" }}>
        {/* Left nav (desktop) */}
        <nav className="p-docs-nav" aria-label="Documentation sections" style={{ position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <LogoMark size={22} />
            <Link href="/docs" style={{ fontWeight: 700, fontSize: 15, textDecoration: "none", color: "inherit" }}>Docs home</Link>
          </div>
          {groups.map((g) => (
            <div key={g.section} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted-strong, #55555f)", marginBottom: 6 }}>{g.section}</div>
              {g.articles.map((a) => (
                <a
                  key={a.slug}
                  href={`/docs/${a.slug}`}
                  className={`p-docs-navlink ${a.slug === doc.slug ? "active" : ""}`}
                  aria-current={a.slug === doc.slug ? "page" : undefined}
                  style={{
                    display: "block",
                    padding: "3px 0 3px 10px",
                    fontSize: 13,
                    textDecoration: "none",
                    borderLeft: a.slug === doc.slug ? "2px solid var(--accent, #635bff)" : "2px solid transparent",
                    color: a.slug === doc.slug ? "var(--accent-text, #4f46e5)" : "inherit",
                    opacity: a.slug === doc.slug ? 1 : 0.7,
                  }}
                >
                  {a.title}
                </a>
              ))}
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted-strong, #55555f)", marginBottom: 6 }}>Policies</div>
            {[
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/terms", label: "Terms of Service" },
              { href: "/acceptable-use", label: "Acceptable Use" },
              { href: "/cookies", label: "Cookies" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{ display: "block", padding: "3px 0 3px 10px", fontSize: 13, textDecoration: "none", borderLeft: "2px solid transparent", color: "inherit", opacity: 0.7 }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Article */}
        <main style={{ minWidth: 0 }}>
        <article style={{ minWidth: 0 }}>
          {/* Mobile collapsible nav */}
          <details className="p-docs-mobilenav" style={{ marginBottom: 20 }}>
            <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, rgba(128,128,128,.22))", background: "var(--surface, #fff)" }}>
              {doc.section} · Contents
            </summary>
            <div style={{ padding: "8px 4px" }}>
              {groups.map((g) => (
                <div key={g.section} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted-strong, #55555f)", margin: "6px 0" }}>{g.section}</div>
                  {g.articles.map((a) => (
                    <a key={a.slug} href={`/docs/${a.slug}`} style={{ display: "block", padding: "3px 8px", fontSize: 13.5, textDecoration: "none", color: "inherit", fontWeight: a.slug === doc.slug ? 700 : 400 }}>{a.title}</a>
                  ))}
                </div>
              ))}
            </div>
          </details>

          <header style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--muted-strong, #55555f)", marginBottom: 6 }}>{doc.section}</div>
            <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>{doc.title}</h1>
            <p className="p" style={{ color: "var(--muted-strong, #55555f)", maxWidth: 640 }}>{doc.summary}</p>
          </header>
          <div className="p-docs-body" style={{ maxWidth: 680 }}>
            {doc.content.map((b, i) => (
              <Block key={i} b={b} />
            ))}
            {doc.faq && doc.faq.length > 0 && (
              <section aria-label="Frequently asked questions">
                {doc.faq.map((item) => (
                  <div key={item.q}>
                    <h3 style={{ fontSize: 17, margin: "26px 0 6px" }}>{item.q}</h3>
                    <p style={{ marginBottom: 10, lineHeight: 1.7 }}>{item.a}</p>
                  </div>
                ))}
              </section>
            )}
          </div>

          {doc.sources && doc.sources.length > 0 && (
            <section
              aria-label="Further reading"
              style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border, rgba(128,128,128,0.2))" }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted-strong, #55555f)", marginBottom: 10 }}>
                Further reading
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                {doc.sources.map((source) => (
                  <li key={source.href} style={{ lineHeight: 1.6 }}>
                    <a
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent-text, #4f46e5)" }}
                    >
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <div style={{ marginTop: 36, paddingTop: 20, borderTop: "1px solid var(--border, rgba(128,128,128,0.2))" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted-strong, #55555f)", marginBottom: 10 }}>Related articles</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {related.map((r) => (
                  <a key={r.slug} href={`/docs/${r.slug}`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>{r.title}</a>
                ))}
              </div>
            </div>
          )}

          {(prev || next) && (
            <nav aria-label="Article pagination" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 32 }}>
              {prev ? (
                <a href={`/docs/${prev.slug}`} style={{ textDecoration: "none", display: "block", maxWidth: "48%", color: "var(--accent-text, #4f46e5)" }}>
                  <span style={{ fontSize: 12, color: "var(--muted-strong, #55555f)" }}>← Previous</span>
                  <strong style={{ display: "block" }}>{prev.title}</strong>
                </a>
              ) : <span />}
              {next ? (
                <a href={`/docs/${next.slug}`} style={{ textDecoration: "none", display: "block", textAlign: "right", maxWidth: "48%", color: "var(--accent-text, #4f46e5)" }}>
                  <span style={{ fontSize: 12, color: "var(--muted-strong, #55555f)" }}>Next →</span>
                  <strong style={{ display: "block" }}>{next.title}</strong>
                </a>
              ) : <span />}
            </nav>
          )}
        </article>
        </main>
      </div>
    </div>
  );
}