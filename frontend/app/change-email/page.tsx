"use client";

import { useState } from "react";
import Link from "next/link";
import { changeEmail } from "../../lib/auth-email";
import { isSupabaseAuthEnabled } from "../../lib/supabase";

export default function ChangeEmailPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  if (!isSupabaseAuthEnabled()) {
    return (
      <main className="lp-login-wrap">
        <div className="lp-card" style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Unavailable</h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Email change is not configured.</p>
          <Link href="/dashboard/settings" className="btn btn-primary" style={{ marginTop: 16, display: "inline-block" }}>Back</Link>
        </div>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setMsg(null);
    const r = await changeEmail(email.trim());
    if (r.ok) { setState("done"); setMsg(r.message || "Done."); }
    else { setState("error"); setMsg(r.message || "Failed."); }
  }

  return (
    <main className="lp-login-wrap">
      <div className="lp-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Change email</h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>We'll send a confirmation to your new address.</p>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input type="email" required placeholder="new@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ height: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 15 }} />
          <button type="submit" disabled={state === "saving"} className="btn btn-primary btn-block" style={{ padding: "12px 20px", borderRadius: 10 }}>
            {state === "saving" ? "Sending…" : "Change email"}
          </button>
        </form>
        {msg ? <p style={{ marginTop: 12, fontSize: 13.5, color: state === "error" ? "#b91c1c" : "var(--green,#0a7d3d)" }}>{msg}</p> : null}
        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center", color: "var(--muted)" }}>
          <Link href="/dashboard/settings" className="lp-inline-link">Back to settings</Link>
        </p>
      </div>
    </main>
  );
}
