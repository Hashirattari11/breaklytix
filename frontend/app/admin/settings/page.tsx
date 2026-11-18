"use client";

import { useEffect, useState } from "react";
import { getAdminSettings } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader } from "../../../components/dashboard-ui";

export default function AdminSettingsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminSettings().then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="Settings" subtitle="Platform configuration." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="Settings" subtitle="Platform configuration." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="Admin Settings" subtitle="Platform configuration (non-secret)." />
      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18, background: "var(--surface)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px" }}>Platform limits</h3>
        {Object.entries(data.platform || {}).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13.5, borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--muted)" }}>{k}</span>
            <strong>{String(v)}</strong>
          </div>
        ))}
      </section>
      <section style={{ marginTop: 18, border: "1px solid var(--border)", borderRadius: 14, padding: 18, background: "var(--surface)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px" }}>Integrations</h3>
        <div style={{ fontSize: 13.5 }}>Email provider: {data.email_provider || "—"} · Admin users: {Array.from(data.admin_user_ids || []).join(", ") || "—"}</div>
        <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 12.5 }}>{data.note}</p>
      </section>
    </div>
  );
}
