"use client";

import { useEffect, useState } from "react";
import { getAdminAnalytics } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader, StatCard } from "../../../components/dashboard-ui";

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminAnalytics().then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="Analytics" subtitle="Growth and engagement." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="Analytics" subtitle="Growth and engagement." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="Analytics & Reports" subtitle="User growth, engagement, feature usage." />
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px" }}>User growth</h3>
      <div className="p-stats-grid">
        <StatCard label="Total users" value={data.user_growth?.total_users} tone="accent" />
        <StatCard label="New today" value={data.user_growth?.new_today} tone="green" />
        <StatCard label="New this week" value={data.user_growth?.new_this_week} tone="green" />
        <StatCard label="New this month" value={data.user_growth?.new_this_month} tone="green" />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 10px" }}>Engagement</h3>
      <div className="p-stats-grid">
        <StatCard label="Connected repos" value={data.engagement?.total_repos} tone="accent" />
        <StatCard label="Total scans" value={data.engagement?.total_scans} tone="accent" />
        <StatCard label="Total alerts" value={data.engagement?.total_alerts} tone="accent" />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 10px" }}>Feature usage</h3>
      <div className="p-stats-grid">
        <StatCard label="Instant scans" value={data.feature_usage?.instant_scans} tone="accent" />
        <StatCard label="Scan events" value={data.feature_usage?.scan_events} tone="accent" />
        <StatCard label="Leads" value={data.feature_usage?.leads} tone="green" />
      </div>
      <p style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>{data.note}</p>
    </div>
  );
}
