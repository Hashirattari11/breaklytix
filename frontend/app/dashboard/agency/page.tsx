"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { Spinner } from "@/components/ui";
import RepositorySelector from "../../../components/RepositorySelector";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type AgencyClient = {
  id: string;
  client_display_name: string;
  client_email: string;
  status: "pending" | "authorized" | "revoked";
  logo_url: string | null;
  created_at: string;
  authorized_at: string | null;
  email_status?: string | null;
};

type AgencyStatus = {
  is_agency: boolean;
  client_count: number;
  pending_count: number;
};

function AgencyPage() {
  return (
    <Suspense fallback={<div style={{ padding: "0 24px 64px", maxWidth: 1200, margin: "0 auto" }}><div style={{ textAlign: "center", padding: 80 }}><Spinner /> <span style={{ marginLeft: 8, color: "var(--muted)" }}>Loading...</span></div></div>}>
      <AgencyPageContent />
    </Suspense>
  );
}

function AgencyPageContent() {
  const searchParams = useSearchParams();
  const repositoryId = searchParams.get("repository_id") ?? "";
  const installedFlag = searchParams.get("installed");
  const [status, setStatus] = useState<AgencyStatus | null>(null);
  const [clients, setClients] = useState<AgencyClient[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: string; detail?: string; sender_warning?: string; sandbox?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("autofix_token");
      if (!token) {
        setError("Your session has expired. Please sign in again.");
        return;
      }
      const repoQuery = repositoryId ? `?repository_id=${encodeURIComponent(repositoryId)}` : "";
      const auth = { Authorization: `Bearer ${token}` };
      const [statusRes, clientsRes] = await Promise.all([
        fetch(`${API_BASE}/agency/status${repoQuery}`, { headers: auth }),
        fetch(`${API_BASE}/agency/clients${repoQuery}`, { headers: auth }),
      ]);
      if (statusRes.status === 401 || clientsRes.status === 401) {
        setError("Your session has expired. Please sign in again.");
        return;
      }
      if (!statusRes.ok || !clientsRes.ok) {
        const failed = !statusRes.ok ? statusRes : clientsRes;
        const data = await failed.json().catch(() => ({}));
        setError(
          data.detail ||
            (failed.status === 403
              ? "Agency access is required for this account."
              : `Could not load agency data (HTTP ${failed.status}).`)
        );
        return;
      }
      setStatus(await statusRes.json());
      setClients(await clientsRes.json());
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    // Show success message if redirected from GitHub App installation.
    if (installedFlag === "1") {
      setSuccess("GitHub App installed successfully! Repos are being synced.");
    }
    void load();
  }, [installedFlag, load]);

  async function inviteClient() {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const token = localStorage.getItem("autofix_token");
      const res = await fetch(`${API_BASE}/agency/clients`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client_display_name: inviteName.trim(), client_email: inviteEmail.trim() }),
      });
      if (res.ok) {
        setShowInvite(false); setInviteName(""); setInviteEmail("");
        const data = await res.json().catch(() => ({}));
        const s = data.email_status ? String(data.email_status) : "";
        const wording = s.startsWith("failed") || s.startsWith("error")
          ? `Invitation created but the email failed: ${s}`
          : `Invitation sent — ${s || "accepted by provider"} (delivery depends on the provider)`;
        setSuccess(wording);
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to send invitation.");
      }
    } catch { setError("Failed to send invitation."); }
    finally { setBusy(false); }
  }

  async function testEmail() {
    setTestBusy(true); setTestResult(null); setError(null);
    try {
      const token = localStorage.getItem("autofix_token");
      const res = await fetch(`${API_BASE}/agency/test-email`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setTestResult({
        ok: !!data.ok,
        status: data.status || (res.ok ? "accepted by provider" : "failed"),
        detail: data.detail,
        sender_warning: data.sender_warning,
        sandbox: !!data.sandbox,
      });
      if (!res.ok && !data.ok) setError(data.detail || "Test email failed to send.");
    } catch { setError("Failed to send test email."); }
    finally { setTestBusy(false); }
  }

  async function resendInvite(clientId: string) {
    try {
      const token = localStorage.getItem("autofix_token");
      const res = await fetch(`${API_BASE}/agency/clients/${clientId}/resend`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      // Reflect the honest provider status returned by the backend.
      const s = data.email_status || (res.ok ? "accepted by provider" : "failed");
      if (res.ok && String(s).startsWith("failed")) {
        setError(`Resend failed: ${s}`);
      } else {
        setSuccess(`Invitation resent — ${s}`);
      }
      await load();
    } catch { setError("Failed to resend invitation."); }
  }

  async function revokeClient(clientId: string) {
    if (!confirm("Revoke this client? Their repo access will stop immediately.")) return;
    try {
      const token = localStorage.getItem("autofix_token");
      const res = await fetch(`${API_BASE}/agency/clients/${clientId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setSuccess("Client revoked."); await load(); }
    } catch { setError("Failed to revoke client."); }
  }

  if (loading) return (
    <div style={{ padding: "0 24px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", padding: 80 }}><Spinner /> <span style={{ marginLeft: 8, color: "var(--muted)" }}>Loading agency dashboard...</span></div>
    </div>
  );

  if (error && !status) return (
    <div style={{ padding: "0 24px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "40px", textAlign: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Could not load Agency Mode</h2>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>{error}</p>
        <button className="btn btn-primary" style={{ borderRadius: 10 }} onClick={() => load()}>Try again</button>
      </div>
    </div>
  );

  if (!status?.is_agency) return (
    <div style={{ padding: "0 24px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "60px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Agency Access Required</h2>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>This feature is available for agency accounts only. Contact support to enable it.</p>
        <Link href="/dashboard" className="btn btn-primary" style={{ borderRadius: 10 }}>Back to Dashboard</Link>
      </div>
    </div>
  );

  const authorized = clients?.filter(c => c.status === "authorized") || [];
  const pending = clients?.filter(c => c.status === "pending") || [];
  const revoked = clients?.filter(c => c.status === "revoked") || [];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .agency-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 24px; margin-bottom: 20px; }
        .agency-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .agency-status-authorized { background: var(--green-bg); color: var(--green); }
        .agency-status-pending { background: var(--amber-bg); color: var(--amber); }
        .agency-status-revoked { background: var(--red-bg); color: var(--red); }
        .agency-client-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--border); }
        .agency-client-row:last-child { border-bottom: none; }
        .agency-client-info { display: flex; align-items: center; gap: 12px; }
        .agency-client-avatar { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: white; }
        .agency-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); font-size: 14px; outline: none; transition: border-color 0.15s; }
        .agency-input:focus { border-color: var(--accent); }
        .agency-label { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 6px; display: block; }
        .agency-invite-box { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-top: 16px; }
        .agency-empty { text-align: center; padding: 40px; color: var(--muted); }
        .agency-empty .icon { font-size: 48; margin-bottom: 12px; }
        .agency-tab { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--muted); transition: all 0.15s; }
        .agency-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
      `}} />

      <div style={{ padding: "0 24px 64px", maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px" }}>Agency Dashboard</h1>
            <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
              {status.client_count} client{status.client_count !== 1 ? "s" : ""} · {status.pending_count} pending invitation{status.pending_count !== 1 ? "s" : ""} ·{" "}
              <Link href="/docs/agency-mode" style={{ textDecoration: "none" }}>Learn more</Link>
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn"
              onClick={testEmail}
              disabled={testBusy}
              style={{ borderRadius: 10, padding: "10px 18px" }}
              title="Send a test email to your own address via the production email pipeline"
            >
              {testBusy ? <><Spinner /> Sending…</> : "✉️ Test Email"}
            </button>
            <button className="btn btn-primary" onClick={() => setShowInvite(!showInvite)} style={{ borderRadius: 10, padding: "10px 18px" }}>
              {showInvite ? "Cancel" : "+ Invite Client"}
            </button>
          </div>
        </div>

        <div style={{ margin: "16px 0" }}>
          <RepositorySelector />
        </div>

        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: "var(--green-bg)", color: "var(--green)", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 14, fontWeight: 500 }}>{success}</div>}
        {testResult && (
          <div style={{ background: testResult.ok ? "var(--green-bg)" : "var(--red-bg)", color: testResult.ok ? "var(--green)" : "var(--red)", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500 }}>
            <div>
              Test email: <strong>{testResult.status}</strong>
              {testResult.detail ? ` — ${testResult.detail}` : ""}
            </div>
            {testResult.sender_warning && (
              <div style={{ marginTop: 6, opacity: 0.9 }}>⚠ {testResult.sender_warning}</div>
            )}
            {testResult.sandbox && (
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Sandbox sender detected — emails only deliver to the account owner until a verified RESEND_FROM_EMAIL is configured.
              </div>
            )}
          </div>
        )}

        {/* Invite Form */}
        {showInvite && (
          <div className="agency-invite-box" style={{ animation: "fadeInUp 0.3s ease" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Invite a Client</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>Enter the client&apos;s name and email. They&apos;ll receive an authorization link — no account needed.</p>
            <div className="agency-invite-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="agency-label">Client Name</label>
                <input className="agency-input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="e.g. Acme Corp" />
              </div>
              <div>
                <label className="agency-label">Client Email</label>
                <input className="agency-input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="client@example.com" />
              </div>
            </div>
            <button className="btn btn-primary" onClick={inviteClient} disabled={busy || !inviteName.trim() || !inviteEmail.trim()} style={{ borderRadius: 10 }}>
              {busy ? <><Spinner /> Sending...</> : "Send Invitation"}
            </button>
          </div>
        )}

        {/* Authorized Clients */}
        <div className="agency-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--green)" }}>●</span> Authorized Clients ({authorized.length})
          </h2>
          {authorized.length === 0 ? (
            <div className="agency-empty">
              <div className="icon">👥</div>
              <p>No authorized clients yet. Invite someone to get started.</p>
            </div>
          ) : (
            authorized.map(c => (
              <div key={c.id} className="agency-client-row">
                <div className="agency-client-info">
                  <div className="agency-client-avatar" style={{ background: "linear-gradient(135deg, var(--green), #059669)" }}>
                    {c.client_display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.client_display_name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.client_email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="agency-status-badge agency-status-authorized">✓ Authorized</span>
                  <button className="btn btn-sm" onClick={() => revokeClient(c.id)} style={{ color: "var(--red)", borderColor: "var(--red)" }}>Revoke</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pending Invitations */}
        <div className="agency-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--amber)" }}>⏳</span> Pending Invitations ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <div className="agency-empty">
              <div className="icon">📨</div>
              <p>No pending invitations.</p>
            </div>
          ) : (
            pending.map(c => (
              <div key={c.id} className="agency-client-row">
                <div className="agency-client-info">
                  <div className="agency-client-avatar" style={{ background: "linear-gradient(135deg, var(--amber), #d97706)" }}>
                    {c.client_display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.client_display_name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.client_email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    className="agency-status-badge agency-status-pending"
                    title={c.email_status || undefined}
                  >
                    ⏳ Pending
                  </span>
                  {c.email_status && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: String(c.email_status).startsWith("failed") || String(c.email_status).startsWith("error")
                          ? "var(--red)"
                          : "var(--muted)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={c.email_status}
                    >
                      {String(c.email_status).startsWith("failed") || String(c.email_status).startsWith("error")
                        ? "⚠ " + c.email_status
                        : c.email_status + (c.email_status.includes("sandbox") ? "" : "")}
                    </span>
                  )}
                  <button className="btn btn-sm" onClick={() => resendInvite(c.id)}>Resend</button>
                  <button className="btn btn-sm" onClick={() => revokeClient(c.id)} style={{ color: "var(--red)" }}>Cancel</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Revoked Clients */}
        {revoked.length > 0 && (
          <div className="agency-card" style={{ opacity: 0.7 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--red)" }}>✕</span> Revoked ({revoked.length})
            </h2>
            {revoked.map(c => (
              <div key={c.id} className="agency-client-row">
                <div className="agency-client-info">
                  <div className="agency-client-avatar" style={{ background: "#6b7280" }}>
                    {c.client_display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.client_display_name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.client_email}</div>
                  </div>
                </div>
                <span className="agency-status-badge agency-status-revoked">✕ Revoked</span>
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="agency-card" style={{ background: "var(--bg)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>How Agency Mode Works</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { step: 1, text: "Invite a client by entering their name and email" },
              { step: 2, text: "Client receives an email with a one-time authorization link" },
              { step: 3, text: "Client clicks the link and authorizes GitHub access (no account needed)" },
              { step: 4, text: "Client selects which repository(s) to share" },
              { step: 5, text: "Repos appear in your dashboard — you manage scanning, alerts, and fixes" },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{s.step}</div>
                <span style={{ fontSize: 14, color: "var(--text)" }}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<div />}><AgencyPage /></Suspense>;
}
