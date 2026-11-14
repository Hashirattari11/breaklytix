"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestPasswordReset } from "../../lib/auth-email";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setMsg(null);
    const r = await requestPasswordReset(email.trim());
    if (r.ok) {
      setState("done");
      setMsg(r.message || "Check your email.");
      try { sessionStorage.setItem("autofix_pending_email", email.trim()); } catch {}
      setTimeout(() => router.push("/reset-password"), 1200);
    } else {
      setState("error");
      setMsg(r.message || "Failed.");
    }
  }

  return (
    <main className="lp-login-wrap">
      <div className="lp-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Reset password</h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>We'll send a code to your email.</p>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ height: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 15 }} />
          <button type="submit" disabled={state === "saving"} className="btn btn-primary btn-block" style={{ padding: "12px 20px", borderRadius: 10 }}>
            {state === "saving" ? "Sending…" : "Send reset code"}
          </button>
        </form>
        {msg ? <p style={{ marginTop: 12, fontSize: 13.5, color: state === "error" ? "#b91c1c" : "var(--green,#0a7d3d)" }}>{msg}</p> : null}
        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center", color: "var(--muted)" }}>
          <Link href="/login" className="lp-inline-link">Back to login</Link>
        </p>
      </div>
    </main>
  );
}
