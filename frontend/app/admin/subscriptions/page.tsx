"use client";

import { useEffect, useState } from "react";
import { getAdminSubscriptions } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader, StatCard } from "../../../components/dashboard-ui";

export default function AdminSubscriptionsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminSubscriptions().then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="Subscriptions" subtitle="Billing and plan distribution." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="Subscriptions" subtitle="Billing and plan distribution." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="Subscriptions & Billing" subtitle="Plan distribution and revenue (real data only)." />
      <div className="p-stats-grid">
        <StatCard label="Total users" value={data.total_users} tone="accent" />
        <StatCard label="Free users" value={data.free_users} tone="gray" />
        <StatCard label="Paid users" value={data.paid_users} tone="green" />
        <StatCard label="Active subscriptions" value={data.active_subscriptions} tone="green" />
        <StatCard label="Cancelled" value={data.cancelled_subscriptions} tone="gray" />
        <StatCard label="Expired" value={data.expired_subscriptions} tone="gray" />
      </div>
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 12px" }}>Plan distribution</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface)" }}>
          {Object.entries(data.by_plan || {}).map(([plan, count]: any, i, arr) => (
            <div key={plan} style={{ display: "flex", justifyContent: "space-between", padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <span style={{ fontSize: 14.5 }}>{plan}</span>
              <strong>{count}</strong>
            </div>
          ))}
          {Object.keys(data.by_plan || {}).length === 0 ? <div style={{ padding: 18, color: "var(--muted)" }}>No users yet.</div> : null}
        </div>
        <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>{data.mrr_note}</p>
      </section>
    </div>
  );
}
