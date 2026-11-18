"use client";

import { useEffect, useState } from "react";
import { getAdminNotifications } from "../../../lib/admin";
import { Spinner } from "../../../components/ui";
import { ErrorCard, PageHeader } from "../../../components/dashboard-ui";

export default function AdminNotificationsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getAdminNotifications(50).then(setData).catch((e) => setError(e?.message || "Failed")); }, []);
  if (error) return <div className="p-page"><PageHeader title="Notifications" subtitle="System and alert activity." /><ErrorCard title="Could not load" body={error} retry={() => location.reload()} /></div>;
  if (!data) return <div className="p-page"><PageHeader title="Notifications" subtitle="System and alert activity." /><div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}><Spinner /> Loading…</div></div>;
  return (
    <div className="p-page">
      <PageHeader title="Notifications & Alerts" subtitle="Recent system and alert activity." />
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface)" }}>
        {(data.items || []).map((n: any, i: number) => (
          <div key={n.id || i} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)", fontSize: 13.5 }}>
            <div style={{ fontWeight: 700 }}>{n.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
              {n.type} · {n.severity || "info"} · {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
            </div>
          </div>
        ))}
        {(data.items || []).length === 0 ? <div style={{ padding: 18, color: "var(--muted)" }}>No notifications.</div> : null}
      </div>
    </div>
  );
}
