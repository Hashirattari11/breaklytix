"use client";

import { useEffect, useState } from "react";
import { getAdminRepositories } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader, StatCard } from "../../../components/dashboard-ui";

export default function AdminRepositoriesPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminRepositories(200).then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="Repositories" subtitle="Connected repositories." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="Repositories" subtitle="Connected repositories." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="Repository Management" subtitle="Connected repositories and scan status." />
      <div className="p-stats-grid">
        <StatCard label="Total repos" value={data.total} tone="accent" />
        <StatCard label="Active" value={data.active} tone="green" />
        <StatCard label="Disconnected" value={data.disconnected} tone="gray" />
      </div>
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 12px" }}>Repositories</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface)", maxHeight: 500, overflowY: "auto" }}>
          {(data.repositories || []).map((r: any, i: number) => (
            <div key={r.id} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)", fontSize: 13.5 }}>
              <div style={{ fontWeight: 700 }}>{r.full_name}</div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
                Owner: {r.owner_email || r.user_id || "—"} · branch: {r.default_branch || "—"} · last scan: {r.last_scanned_at ? new Date(r.last_scanned_at).toLocaleDateString() : "never"}
              </div>
            </div>
          ))}
          {(data.repositories || []).length === 0 ? <div style={{ padding: 18, color: "var(--muted)" }}>No repositories connected.</div> : null}
        </div>
      </section>
    </div>
  );
}
