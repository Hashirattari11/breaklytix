"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { verifySignupOtp, verifySignInOtp, resendOtp } from "../../lib/auth-email";

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") || "signup";
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("autofix_pending_email");
      if (stored) setEmail(stored);
    } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setMsg(null);
    const r = mode === "signup"
      ? await verifySignupOtp(email.trim(), token.trim())
      : await verifySignInOtp(email.trim(), token.trim());
    if (r.ok) {
      setState("done");
      setMsg("Verified. Redirecting…");
      setTimeout(() => router.replace("/dashboard"), 800);
    } else {
      setState("error");
      setMsg(r.message || "Verification failed.");
    }
  }

  async function resend() {
    const r = await resendOtp(email.trim());
    setMsg(r.message || (r.ok ? "Resent." : "Failed."));
  }

  return (
    <main className="lp-login-wrap">
      <div className="lp-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Verify your email</h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>Enter the code we sent to your email.</p>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ height: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 15 }} />
          <input type="text" required placeholder="6-digit code" value={token} onChange={(e) => setToken(e.target.value)}
            style={{ height: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 15, letterSpacing: 4, textAlign: "center" }} />
          <button type="submit" disabled={state === "saving"} className="btn btn-primary btn-block" style={{ padding: "12px 20px", borderRadius: 10 }}>
            {state === "saving" ? "Verifying…" : "Verify"}
          </button>
        </form>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <button type="button" onClick={() => void resend()} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", padding: 0 }}>Resend code</button>
          <Link href="/login" className="lp-inline-link">Back to login</Link>
        </div>
        {msg ? <p style={{ marginTop: 12, fontSize: 13.5, color: state === "error" ? "#b91c1c" : "var(--green,#0a7d3d)" }}>{msg}</p> : null}
      </div>
    </main>
  );
}
