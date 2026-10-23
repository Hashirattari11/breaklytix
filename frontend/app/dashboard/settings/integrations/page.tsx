"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Nav, Spinner } from "../../../../components/ui";

type SlackConn = {
  connected: boolean;
  team_id?: string;
  team_name?: string;
  channel_id?: string;
  channel_name?: string;
  connected_at?: string | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const [conn, setConn] = useState<SlackConn | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedFlag = searchParams.get("connected");
  const oauthError = searchParams.get("error");

  const authToken = useCallback((): string | null => {
    const token = localStorage.getItem("autofix_token");
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      return null;
    }
    return token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = authToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/slack/connection`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Could not load Slack status (HTTP ${res.status}).`);
        return;
      }
      setConn(await res.json());
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      const token = authToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/slack/install`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.install_url) {
        window.location.href = data.install_url;
        return;
      }
      setError(data.detail || "Failed to start Slack connection.");
    } catch {
      setError("Failed to start Slack connection.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    try {
      const token = authToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/slack/connection`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConn({ connected: false });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to disconnect Slack.");
      }
    } catch {
      setError("Failed to disconnect Slack.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Nav />
      <main className="container page">
        <p style={{ marginTop: 0 }}>
          <Link href="/dashboard/settings">← Back to settings</Link>
        </p>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ marginBottom: 4 }}>Integrations</h1>
          <p className="muted" style={{ margin: 0 }}>
            Connect external tools to mirror alerts and approve fixes from Slack.
          </p>
        </div>

        {connectedFlag === "true" && (
          <div className="pill pill-green" style={{ marginBottom: 16 }}>
            Slack connected successfully.
          </div>
        )}
        {oauthError && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            Slack connection failed: {oauthError}
          </div>
        )}
        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

        <section className="card" style={{ maxWidth: 640 }}>
          <div className="card-header">
            <h2>Slack</h2>
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Mirror breaking-change alerts to a Slack channel and approve fixes
            directly from Slack. Emails are still sent — Slack is additive.
          </p>

          {loading ? (
            <div style={{ padding: 20 }}><Spinner /> Loading…</div>
          ) : conn?.connected ? (
            <div style={{ marginTop: 16 }}>
              <div className="user-avatar-large" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                #
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="preference-title">{conn.team_name || "Connected workspace"}</div>
                <div className="preference-desc">
                  Channel: <code>#{conn.channel_name || conn.channel_id}</code>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="btn btn-danger" onClick={disconnect} disabled={busy === "disconnect"}>
                  {busy === "disconnect" ? <><Spinner /> Disconnecting…</> : "Disconnect Slack"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div className="preference-desc" style={{ marginBottom: 16 }}>
                Not connected. Set up the Breaklytix Slack app to start receiving
                alerts in your workspace.
              </div>
              <button className="btn btn-primary" onClick={connect} disabled={busy === "connect"}>
                {busy === "connect" ? <><Spinner /> Connecting…</> : "Connect Slack"}
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function SlackIntegrationsPage() {
  return (
    <Suspense fallback={
      <main className="container page" style={{ paddingTop: 60, textAlign: "center" }}>
        <Spinner /> Loading…
      </main>
    }>
      <IntegrationsContent />
    </Suspense>
  );
}

export default function Page() {
  return <Suspense fallback={<div />}><SlackIntegrationsPage /></Suspense>;
}
