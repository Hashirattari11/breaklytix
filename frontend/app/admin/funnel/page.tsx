"use client";

import { useEffect, useState } from "react";
import { getAdminFunnel, AdminFunnel } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader, StatCard } from "../../../components/dashboard-ui";

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function AdminFunnelPage() {
  const [data, setData] = useState<AdminFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminFunnel()
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load funnel"));
  }, []);

  if (error) {
    return (
      <div className="p-page">
        <PageHeader title="Instant Scan Funnel" subtitle="Anonymous scan conversion, all-time." />
        <ErrorCard title="Could not load funnel" body={error} retry={() => location.reload()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-page">
        <PageHeader title="Instant Scan Funnel" subtitle="Anonymous scan conversion, all-time." />
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
          <Spinner /> Loading funnel…
        </div>
      </div>
    );
  }

  const { counts, conversion_rates: rates } = data;

  return (
    <div className="p-page">
      <PageHeader
        title="Instant Scan Funnel"
        subtitle="Anonymous public-repo scans from the homepage. Counts are all-time."
        actions={<span className="p-badge p-badge--outline">{data.total_scans} stored scans</span>}
      />

      <div className="p-stats-grid">
        <StatCard label="Scans started" value={counts.scan_started} tone="accent" />
        <StatCard label="Scans completed" value={counts.scan_completed} tone="green" />
        <StatCard label="Emails captured" value={counts.email_captured} tone="green" />
        <StatCard label="Share clicks" value={counts.share_clicked} tone="accent" />
        <StatCard label="Badge copies" value={counts.badge_copied} tone="accent" />
        <StatCard label="Email submit CTA" value={counts.email_submitted ?? 0} tone="accent" />
        <StatCard label="GitHub sign-up clicks" value={counts.github_signup_clicked ?? 0} tone="accent" />
        <StatCard label="GitHub sign-ups completed" value={counts.github_signup_completed ?? 0} tone="green" />
        <StatCard label="Leads" value={data.total_leads} tone="green" />
      </div>

      {data.share_breakdown ? (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 12px" }}>Share clicks</h2>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            {[
              ["X (web intent)", data.share_breakdown.by_platform.x],
              ["LinkedIn", data.share_breakdown.by_platform.linkedin],
              ["Copy post", data.share_breakdown.by_platform.copy],
            ].map(([label, value], index) => (
              <div
                key={String(label)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  borderTop: index === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 14.5 }}>{label}</span>
                <strong style={{ fontSize: 15 }}>{value}</strong>
              </div>
            ))}
          </div>
          <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Shares with a detected possible risk: <strong>{data.share_breakdown.with_risks}</strong> · shares
            without (informational): <strong>{data.share_breakdown.without_risks}</strong>
          </p>
        </section>
      ) : null}

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 12px" }}>Conversion rates</h2>        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          {[
            ["Started → completed", rates.started_to_completed],
            ["Completed → email captured", rates.completed_to_email],
            ["Completed → share clicked", rates.completed_to_share],
            ["Completed → badge copied", rates.completed_to_badge],
          ].map(([label, value], index) => (
            <div
              key={String(label)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderTop: index === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 14.5 }}>{label}</span>
              <strong style={{ fontSize: 15 }}>{pct(Number(value))}</strong>
            </div>
          ))}
        </div>
        <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: 13 }}>
          {data.cached_results_served} request(s) served from the 24-hour repository cache.
        </p>
      </section>
    </div>
  );
}
