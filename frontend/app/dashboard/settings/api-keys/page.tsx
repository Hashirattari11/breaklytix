"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Nav, Spinner } from "../../../../components/ui";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type ApiKey = {
  id: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
};

export default function ApiKeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("autofix_token");
      if (!token) {
        setError("Your session has expired. Please sign in again.");
        return;
      }
      const res = await fetch(`${API_BASE}/api/public/v1/api-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Could not load API keys (HTTP ${res.status}).`);
        return;
      }
      setKeys(await res.json());
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function generateKey() {
    setBusy(true);
    setError(null);
    try {
      const token = localStorage.getItem("autofix_token");
      if (!token) {
        setError("Your session has expired. Please sign in again.");
        return;
      }
      const res = await fetch(`${API_BASE}/api/public/v1/api-keys`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        await loadKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to generate key.");
      }
    } catch {
      setError("Failed to generate key.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    setError(null);
    try {
      const token = localStorage.getItem("autofix_token");
      if (!token) {
        setError("Your session has expired. Please sign in again.");
        return;
      }
      const res = await fetch(`${API_BASE}/api/public/v1/api-keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Could not revoke the key (HTTP ${res.status}).`);
        return;
      }
      await loadKeys();
    } catch {
      setError("Could not reach the server. The key was not revoked.");
    }
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
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
          <h1 style={{ marginBottom: 4 }}>API Keys</h1>
          <p className="muted" style={{ margin: 0 }}>
            Manage API keys for programmatic access to your Breaklytix data.
          </p>
        </div>

        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

        {newKey && (
          <div className="card" style={{ marginBottom: 16, borderColor: "var(--green)" }}>
            <h3 style={{ marginTop: 0 }}>Your new API key</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Copy this key now — it will not be shown again.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <code style={{ flex: 1, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, wordBreak: "break-all" }}>
                {newKey}
              </code>
              <button className="btn btn-primary btn-sm" onClick={copyKey}>Copy</button>
            </div>
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setNewKey(null)}>
              Dismiss
            </button>
          </div>
        )}

        <section className="card" style={{ maxWidth: 700 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Keys</h2>
            <button className="btn btn-primary btn-sm" onClick={generateKey} disabled={busy}>
              {busy ? <><Spinner /> Generating…</> : "+ Generate Key"}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 20 }}><Spinner /> Loading…</div>
          ) : !keys || keys.length === 0 ? (
            <p className="muted" style={{ padding: 20 }}>No API keys yet. Generate one to get started.</p>
          ) : (
            <table className="table responsive-cards" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td data-label="Key"><code>{k.key_prefix}</code></td>
                    <td data-label="Created" className="muted small">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td data-label="Last Used" className="muted small">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                    <td data-label="Status">
                      <span className={`pill ${k.revoked ? "pill-red" : "pill-green"}`}>
                        {k.revoked ? "Revoked" : "Active"}
                      </span>
                    </td>
                    <td>
                      {!k.revoked && (
                        <button className="btn btn-sm btn-danger" onClick={() => revokeKey(k.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
