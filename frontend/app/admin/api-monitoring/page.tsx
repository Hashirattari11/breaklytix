"use client";

import { useEffect, useState } from "react";
import { getAdminApiMonitoring } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader, StatCard } from "../../../components/dashboard-ui";

export default function AdminApiMonitoringPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminApiMonitoring().then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="API Monitoring" subtitle="Provider and change analytics." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="API Monitoring" subtitle="Provider and change analytics." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="API Monitoring" subtitle="Provider coverage and detected changes." />
      <div className="p-stats-grid">
        <StatCard label="Providers monitored" value={data.providers_monitored} tone="green" />
        <StatCard label="Providers planned" value={data.providers_planned} tone="gray" />
        <StatCard label="Total changes detected" value={data.total_changes_detected} tone="accent" />
        <StatCard label="Breaking changes" value={data.total_breaking_changes} tone="red" />
        <StatCard label="Deprecations" value={data.total_deprecations} tone="accent" />
        <StatCard label="Alerts pending" value={data.alerts_pending} tone="red" />
        <StatCard label="Alerts sent" value={data.alerts_sent} tone="green" />
        <StatCard label="Failed jobs" value={data.failed_monitoring_jobs} tone="gray" />
      </div>
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 12px" }}>Provider list</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface)", maxHeight: 400, overflowY: "auto" }}>
          {(data.provider_list || []).map((p: any, i: number, arr: any[]) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)", fontSize: 13.5 }}>
              <span>{p.name}</span>
              <span style={{ color: p.status === "monitored" ? "var(--green,#0a7d3d)" : "var(--muted)" }}>{p.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
