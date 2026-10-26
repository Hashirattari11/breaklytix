import type { Metadata } from "next";
import Link from "next/link";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import type { ProviderCategory } from "@/lib/providers/types";
import { LegalFooter } from "@/components/LegalLayout";
import { LogoMark } from "@/components/Logo";
import { SITE_NAME, SITE_URL, pageOpenGraph } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonld";

/**
 * Public provider directory.
 *
 * Why this page exists: the product's whole premise is "we watch provider
 * changelogs for you", but before this only a logged-in dashboard showed which
 * providers are covered. That made the site invisible for the highest-intent
 * long-tail queries developers actually type ("stripe api changelog", "openai
 * api breaking changes", "twilio changelog monitoring"). One crawlable page
 * that names every provider, links each official changelog, and explains what
 * counts as a breaking change serves users and search engines with the same
 * content — no doorway pages, no per-provider thin templating.
 */

export const metadata: Metadata = {
  title: "Monitored API Providers and Changelogs",
  description:
    "The 44 third-party APIs Breaklytix monitors — Stripe, OpenAI, AWS, Slack, Twilio, Supabase and more — with a link to each official changelog source.",
  alternates: { canonical: `${SITE_URL}/providers` },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/providers"),
};



const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  payment: "Payments",
  communication: "Communication & messaging",
  cloud: "Cloud & hosting",
  ai: "AI & ML",
  analytics: "Analytics & product data",
  database: "Databases & storage",
  devtools: "Developer tools",
  media: "Media",
  other: "Platforms & other APIs",
};

const CATEGORY_ORDER: ProviderCategory[] = [
  "payment",
  "communication",
  "ai",
  "devtools",
  "cloud",
  "database",
  "analytics",
  "media",
  "other",
];

const FAQ = [
  {
    q: "How many API providers does Breaklytix monitor?",
    a: `Breaklytix monitors ${PROVIDER_REGISTRY.length} third-party API providers across payments, communication, AI, cloud, databases, analytics and developer tools. Every provider is tracked from its own official changelog, release notes or release feed — not from a generic aggregator.`,
  },
  {
    q: "What counts as a breaking change?",
    a: "A breaking change is anything that can make existing integration code fail or behave differently: a removed or renamed endpoint, a required new parameter, a removed response field, a changed authentication scheme, a new API version that retires the old one, or a deprecation with a shutdown date.",
  },
  {
    q: "How often are provider changelogs checked?",
    a: "Changelog sources are polled on a schedule throughout the day and deduplicated by a stable fingerprint, so the same entry is never turned into two alerts. Each provider's cadence follows how often that provider actually publishes.",
  },
  {
    q: "Does Breaklytix monitor providers that are not in this list?",
    a: "The list covers the providers in the detection and monitoring registry. If your stack depends on an API that is missing, tell us which one — new providers are added to the registry and the scanner picks them up automatically.",
  },
  {
    q: "What happens when a monitored provider ships a breaking change?",
    a: "Breaklytix classifies the entry, matches it against the API usage found in your repositories, and alerts you only when your code is affected. The alert links to the exact files and lines that call the changed endpoint.",
  },
  {
    q: "Which providers support automatic fix pull requests?",
    a: "Auto-fix pull requests are offered only for mechanical, unambiguous changes where the correct edit can be derived from the changelog entry. Everything else produces an alert with the affected call sites so a developer can decide.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/providers#page`,
      url: `${SITE_URL}/providers`,
      name: "Monitored API providers and changelogs",
      description: `The ${PROVIDER_REGISTRY.length} third-party API providers whose changelogs ${SITE_NAME} monitors.`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
      about: { "@type": "Thing", name: "API change monitoring" },
    },
    {
      "@type": "ItemList",
      "@id": `${SITE_URL}/providers#list`,
      name: "Monitored API providers",
      numberOfItems: PROVIDER_REGISTRY.length,
      itemListElement: PROVIDER_REGISTRY.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.displayName,
        url: p.changelogConfig.changelogUrl,
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Providers", item: `${SITE_URL}/providers` },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function ProvidersPage() {
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    providers: PROVIDER_REGISTRY.filter((p) => p.category === category).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    ),
  })).filter((g) => g.providers.length > 0);

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
            maxWidth: 1120,
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
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              // Was `flexWrap: nowrap` (implicit): at <=375px the brand (~104px)
              // plus these four items need ~358px inside a 272px content box, so
              // `Sign in` ran past the right edge and got clipped by the page's
              // overflow-x:hidden. Wrapping lets the nav shrink and stack instead.
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: "10px 18px",
              fontSize: 13,
            }}
          >
            <Link href="/docs" style={{ color: "var(--muted)", textDecoration: "none" }}>Docs</Link>
            <Link href="/providers" style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none" }}>Providers</Link>
            <Link href="/pricing" style={{ color: "var(--muted)", textDecoration: "none" }}>Pricing</Link>
            <Link href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Sign in</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "56px 24px 80px" }}>
        <header style={{ maxWidth: 760, marginBottom: 40 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--muted-strong, #55555f)", marginBottom: 10 }}>
            Coverage
          </div>
          <h1 className="h1" style={{ fontSize: 40, lineHeight: 1.15, marginBottom: 14 }}>
            {PROVIDER_REGISTRY.length} API providers, monitored at the source
          </h1>
          <p className="p" style={{ fontSize: 17, lineHeight: 1.65 }}>
            Every provider below is tracked from its own official changelog, release notes or release
            feed. When one of them ships a change that can break an integration, Breaklytix matches it
            against the API calls in your repositories and tells you which files are affected.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
            <Link href="/docs/changelog" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
              How monitoring works
            </Link>
            <Link href="/pricing" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
              See plans
            </Link>
          </div>
        </header>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            margin: "0 0 48px",
            padding: 0,
          }}
        >
          {[
            { k: "Providers monitored", v: PROVIDER_REGISTRY.length },
            { k: "Categories", v: grouped.length },
            { k: "Official sources", v: "Changelogs & release feeds" },
            { k: "Mapped to your code", v: "File + line" },
          ].map((s) => (
            <div
              key={s.k}
              style={{
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 12,
                padding: "14px 16px",
                background: "var(--surface, #fff)",
              }}
            >
              <dt style={{ fontSize: 12, color: "var(--muted-strong, #55555f)", marginBottom: 4 }}>{s.k}</dt>
              <dd style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{s.v}</dd>
            </div>
          ))}
        </dl>

        <nav aria-label="Provider categories" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 36 }}>
          {grouped.map((g) => (
            <a
              key={g.category}
              href={`#${g.category}`}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: "5px 11px",
                borderRadius: 999,
                border: "1px solid var(--border, #e5e7eb)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {g.label} · {g.providers.length}
            </a>
          ))}
        </nav>

        <div style={{ display: "grid", gap: 44 }}>
          {grouped.map((g) => (
            <section key={g.category} id={g.category} style={{ scrollMarginTop: 80 }}>
              <h2 className="h2" style={{ fontSize: 22, marginBottom: 4 }}>{g.label}</h2>
              <p style={{ fontSize: 13.5, color: "var(--muted-strong, #55555f)", margin: "0 0 16px" }}>
                {g.providers.length} monitored {g.providers.length === 1 ? "provider" : "providers"}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                  gap: 12,
                }}
              >
                {g.providers.map((p) => {
                  const packages = p.detectionPatterns.packageNames.slice(0, 3);
                  return (
                    <article
                      key={p.id}
                      style={{
                        border: "1px solid var(--border, #e5e7eb)",
                        borderRadius: 12,
                        padding: "14px 16px",
                        background: "var(--surface, #fff)",
                      }}
                    >
                      <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 6px" }}>{p.displayName}</h3>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12.5 }}>
                        <a
                          href={p.changelogConfig.changelogUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          style={{ color: "var(--accent-text, #4f46e5)" }}
                        >
                          Official changelog ↗
                        </a>
                        {p.changelogConfig.releaseNotesUrl &&
                          p.changelogConfig.releaseNotesUrl !== p.changelogConfig.changelogUrl && (
                            <a
                              href={p.changelogConfig.releaseNotesUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              style={{ color: "var(--muted-strong, #55555f)" }}
                            >
                              Release notes ↗
                            </a>
                          )}
                      </div>
                      {packages.length > 0 && (
                        <p style={{ fontSize: 12, color: "var(--muted-strong, #55555f)", margin: "8px 0 0" }}>
                          Detected via {packages.join(", ")}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <section style={{ marginTop: 64, maxWidth: 760 }}>
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 12 }}>How provider monitoring works</h2>
          <ol style={{ margin: "0 0 16px", paddingLeft: 20, display: "grid", gap: 10, lineHeight: 1.65, fontSize: 15 }}>
            <li>
              <strong>Collect.</strong> Each provider&apos;s official changelog, release notes or release
              feed is fetched on a schedule and normalised into entries.
            </li>
            <li>
              <strong>Classify.</strong> Every entry is tagged as a breaking change, deprecation, API
              version change, schema change, auth change or a non-breaking update.
            </li>
            <li>
              <strong>Match.</strong> The entry is compared with the providers, SDKs, environment
              variables and endpoints detected in your repositories.
            </li>
            <li>
              <strong>Alert.</strong> You get an alert only when your code is affected, with the exact
              files and lines that call the changed API.
            </li>
          </ol>
          <p style={{ fontSize: 14, color: "var(--muted-strong, #55555f)", lineHeight: 1.7 }}>
            Read the details in <Link href="/docs/changelog">provider changes &amp; changelog</Link>, or see how{" "}
            <Link href="/docs/providers">coverage is decided</Link>.
          </p>
        </section>

        <section style={{ marginTop: 56, maxWidth: 820 }}>
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 16 }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3 style={{ fontSize: 17, margin: "24px 0 6px" }}>{f.q}</h3>
              <p style={{ margin: 0, lineHeight: 1.7, fontSize: 15 }}>{f.a}</p>
            </div>
          ))}
        </section>
      </main>

      <LegalFooter />
    </>
  );
}
