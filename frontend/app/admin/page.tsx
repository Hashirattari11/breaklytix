"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminOverview, AdminOverview } from "../../lib/admin";
import { Spinner } from "../../components/ui";
import { ErrorCard, PageHeader, SkeletonGrid, StatCard } from "../../components/dashboard-ui";

export default function AdminOverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getAdminOverview()
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load overview"));
  }, []);

  if (error) {
    return (
      <div className="p-page">
        <PageHeader title="Admin Overview" subtitle="Platform health, providers, and alert activity." />
        <ErrorCard title="Could not load overview" body={error} retry={() => location.reload()} />
      </div>
    );
  }

  if (!data || !mounted) {
    return (
      <div className="p-page">
        <PageHeader title="Admin Overview" subtitle="Platform health, providers, and alert activity." />
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
          <Spinner /> Loading overview…
        </div>
      </div>
    );
  }

  return (
    <div className="p-page">
      <PageHeader
        title="Admin Overview"
        subtitle="Platform health, providers, and alert activity."
        actions={
          <span className="p-badge p-badge--outline">
            {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </span>
        }
      />

      <div className="p-stats-grid">
        <StatCard label="Total users" value={data.total_users} tone="accent"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>} />
        <StatCard label="Connected repos" value={data.total_repos} tone="accent"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>} />
        <StatCard label="Providers monitored" value={data.providers_monitored} tone="green"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg>} />
        <StatCard label="Providers planned" value={data.providers_planned} tone="gray"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
      </div>

      <div className="p-stats-grid">
        <StatCard label="Real alerts sent" value={data.alerts_sent} tone="accent"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>} />
        <StatCard
          label="Alerts pending approval"
          value={data.alerts_pending}
          tone={data.alerts_pending > 0 ? "red" : "green"}
          delta={data.alerts_pending > 0 ? "needs review" : "queue clear"}
          // Alert backlog count is a status, not a measured trend — no arrow.
          deltaDir="none"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} />
        <StatCard label="Alerts dismissed" value={data.alerts_dismissed} tone="gray"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>} />
        <StatCard label="Test alerts sent" value={data.test_alerts_sent} tone="gray"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} />
      </div>
    </div>
  );
}