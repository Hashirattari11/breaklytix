import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalFooter } from "@/components/LegalLayout";
import { LogoMark } from "@/components/Logo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import {
  badgeMarkdown,
  getInstantScan,
  type ScanProvider,
  type ScanRisk,
} from "@/lib/instant-scan";
import ScanResultClient from "./ScanResultClient";
import { confidenceStyle, pill } from "./scanStyles";
import ShareBlock from "./ShareBlock";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function humanChangeType(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm || `${singular}s`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const scan = await getInstantScan(id).catch(() => null);
  if (!scan) {
    return { title: "Scan not found", robots: { index: false, follow: false } };
  }
  const repo = scan.result.repo;
  const n = scan.result.summary.provider_count;
  const m = scan.result.summary.possible_risk_count;
  const title = `${repo} API scan`;
  const description = `Breaklytix detected ${n} API ${plural(n, "integration")} in ${repo}${
    m ? ` and ${m} possible ${plural(m, "risk")}` : " with no recent official breaking-change notice"
  }.`;
  const url = `${SITE_URL}/scan/${id}`;
  const imageUrl = `${SITE_URL}/scan/${id}/opengraph-image`;
  return {
    title,
    description,
    // Individual scans are shareable but should not become thin search results.
    robots: { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: {
      url,
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${repo} API scan — Breaklytix`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

function ProviderCard({ provider }: { provider: ScanProvider }) {
  return (
    <article
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--surface)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{provider.name}</h3>
        <span style={{ ...pill, ...confidenceStyle(provider.confidence) }}>{provider.confidence} confidence</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ ...pill, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
          {provider.category}
        </span>
        <span style={{ ...pill, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
          {provider.status === "monitored" ? "Monitored provider" : "Provider supported"}
        </span>
      </div>
      <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13.5 }}>
        {provider.evidence_count} {plural(provider.evidence_count, "evidence reference")} across{" "}
        {provider.file_count} {plural(provider.file_count, "file")}
      </p>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "var(--accent)" }}>
          View file and line evidence
        </summary>
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 10 }}>
          {provider.files.map((file) => (
            <li key={file.path} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <code style={{ fontSize: 12.5, wordBreak: "break-all" }}>{file.path}</code>
                {file.lines.length ? (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {file.lines.length === 1 ? "line" : "lines"} {file.lines.join(", ")}
                  </span>
                ) : null}
              </div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
                {file.evidence.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function RiskCard({ risk }: { risk: ScanRisk }) {
  const published = formatDate(risk.published_at);
  return (
    <article
      style={{
        border: "1px solid rgba(245,158,11,0.35)",
        borderRadius: 14,
        background: "rgba(245,158,11,0.06)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{risk.provider_name}</h3>
        <span style={{ ...pill, ...confidenceStyle(risk.confidence) }}>{risk.confidence} confidence</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ ...pill, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#92400e" }}>
          {humanChangeType(risk.change_type)}
        </span>
        {published ? (
          <span style={{ ...pill, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
            {published}
          </span>
        ) : null}
      </div>
      <p style={{ margin: "12px 0 8px", fontSize: 14.5, lineHeight: 1.6 }}>{risk.title}</p>
      <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>{risk.wording}</p>
      {risk.source_url ? (
        <a
          href={risk.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)", fontSize: 13.5, fontWeight: 700 }}
        >
          Official source ↗
        </a>
      ) : null}
    </article>
  );
}

export default async function ScanResultPage({ params }: PageProps) {
  const { id } = await params;
  const scan = await getInstantScan(id);
  if (!scan) notFound();

  const { result } = scan;
  const providers = result.providers || [];
  const risks = result.risks || [];
  const integrationCount = result.summary.integration_count;
  const riskCount = result.summary.possible_risk_count;
  const scanned = formatDate(result.scanned_at);

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link href="/" className="brand" style={{ display: "inline-flex", alignItems: "center" }}>
            <LogoMark size={30} withWordmark />
          </Link>
          <Link href="/#instant-scan" style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>
            Scan another repo
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 64px" }}>
        <section
          aria-labelledby="scan-summary"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 18,
            padding: "26px 24px",
            background: "var(--surface)",
            boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
            Instant Repo Scan
          </p>
          <h1 id="scan-summary" style={{ margin: "8px 0 10px", fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
            {result.repo}
          </h1>
          <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>
            Found {integrationCount} API {plural(integrationCount, "integration")}, {riskCount} possible{" "}
            {plural(riskCount, "risk")}
          </p>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13.5 }}>
            {result.files_scanned} {plural(result.files_scanned, "file")} scanned
            {scanned ? ` · ${scanned}` : ""}
            {typeof result.duration_ms === "number" ? ` · ${(result.duration_ms / 1000).toFixed(1)}s` : ""}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
            Scanned: {result.repo}
            {scanned ? `, ${scanned}` : ""}
          </p>
          {result.partial ? (
            <p
              role="status"
              style={{
                margin: "14px 0 0",
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                color: "#92400e",
                fontSize: 13.5,
              }}
            >
              Partial scan: {result.partial_reason || "this repository is large, so the most relevant files were scanned first."}
            </p>
          ) : null}

          <ShareBlock scanId={scan.id} result={result} variant="top" />
        </section>

        <section aria-labelledby="providers-title" style={{ marginTop: 30 }}>
          <h2 id="providers-title" style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 800 }}>
            Detected API providers
          </h2>
          {providers.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {providers.map((provider) => (
                <ProviderCard key={provider.api_name} provider={provider} />
              ))}
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
                background: "var(--surface)",
                color: "var(--muted)",
                fontSize: 14.5,
                lineHeight: 1.6,
              }}
            >
              No third-party API integrations were detected in the files we scanned. That can mean the repo
              doesn&apos;t call a provider we recognize, or the relevant files were outside the scan limits.
            </div>
          )}
        </section>

        <section aria-labelledby="risks-title" style={{ marginTop: 30 }}>
          <h2 id="risks-title" style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 800 }}>
            Possible risks
          </h2>
          {risks.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {risks.map((risk, index) => (
                <RiskCard key={`${risk.api_name}-${index}`} risk={risk} />
              ))}
            </div>
          ) : (
            <div
              style={{
                border: "1px solid rgba(10,125,61,0.3)",
                borderRadius: 14,
                padding: 20,
                background: "rgba(10,125,61,0.06)",
                color: "var(--text)",
                fontSize: 14.5,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ display: "block", marginBottom: 4 }}>Good news</strong>
              {result.no_risk_message ||
                "No recent official breaking-change notice found for your detected providers."}
            </div>
          )}
        </section>

        <ShareBlock scanId={scan.id} result={result} variant="bottom" />

        <ScanResultClient
          scanId={scan.id}
          result={result}
          badgeSnippet={badgeMarkdown(result.repo, scan.id)}
        />

        <p style={{ marginTop: 24, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
          Breaklytix only reports official provider notices as <em>possible</em> risks. A notice is never a
          confirmed break until the exact endpoint, field, or SDK usage is matched. No file contents or secret
          values are stored.
        </p>
      </main>

      <LegalFooter />
    </>
  );
}
