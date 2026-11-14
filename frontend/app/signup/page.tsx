"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpWithEmail } from "../../lib/auth-email";
import { getSupabase, isSupabaseAuthEnabled } from "../../lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  if (!isSupabaseAuthEnabled()) {
    return (
      <main className="lp-login-wrap">
        <div className="lp-card" style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Email sign-up unavailable</h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Email authentication is not configured. Please use GitHub sign-in.</p>
          <Link href="/login" className="btn btn-primary" style={{ marginTop: 16, display: "inline-block" }}>Back to login</Link>
        </div>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setMsg(null);
    const r = await signUpWithEmail(email.trim(), password);
    if (r.ok) {
      setState("done");
      setMsg(r.message || "Check your email.");
      try { sessionStorage.setItem("autofix_pending_email", email.trim()); } catch {}
      setTimeout(() => router.push("/verify-email?mode=signup"), 1200);
    } else {
      setState("error");
      setMsg(r.message || "Sign-up failed.");
    }
  }

  return (
    <main className="lp-login-wrap">
      <div className="lp-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Create your account</h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>Sign up with email. We'll send a verification code.</p>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ height: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 15 }} />
          <input type="password" required minLength={6} placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ height: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 15 }} />
          <button type="submit" disabled={state === "saving"} className="btn btn-primary btn-block" style={{ padding: "12px 20px", borderRadius: 10 }}>
            {state === "saving" ? "Sending…" : "Sign up"}
          </button>
        </form>
        {msg ? <p style={{ marginTop: 12, fontSize: 13.5, color: state === "error" ? "#b91c1c" : "var(--green,#0a7d3d)" }}>{msg}</p> : null}
        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center", color: "var(--muted)" }}>
          Already have an account? <Link href="/login" className="lp-inline-link">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
