"use client";

import { useEffect, useState } from "react";
import { getAdminAuditLogs } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader } from "../../../components/dashboard-ui";

export default function AdminSecurityPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminAuditLogs(100).then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="Security & Audit" subtitle="Admin activity and audit logs." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="Security & Audit" subtitle="Admin activity and audit logs." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="Security & Audit Logs" subtitle="Admin actions and system audit trail." />
      {data.note ? <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>{data.note}</p> : null}
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface)", maxHeight: 500, overflowY: "auto" }}>
        {(data.items || []).map((row: any, i: number) => (
          <div key={row.id || i} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)", fontSize: 13.5 }}>
            <div style={{ fontWeight: 700 }}>{row.action || row.event || "Audit entry"}</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
              {row.actor || row.user_id || "system"} · {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
            </div>
          </div>
        ))}
        {(data.items || []).length === 0 ? <div style={{ padding: 18, color: "var(--muted)" }}>No audit entries yet.</div> : null}
      </div>
    </div>
  );
}
