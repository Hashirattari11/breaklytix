"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { buildGithubAuthUrl, GITHUB_SIGNUP_SCOPES } from "../../../lib/api";
import { SITE_URL } from "../../../lib/site";

/**
 * /auth/github — Starts the GitHub OAuth dance.
 * Pins a one-time CSRF `state` (kept in session storage, read back on /auth/callback)
 * then redirects to GitHub's authorize endpoint. Keeps the callback on the same origin.
 *
 * Optional query params (used by the post-scan "Continue with GitHub" CTA):
 *   ?scan=<scanId>   — the instant scan being continued; the callback stores it
 *                      in session storage and links the scan to the new user.
 *   ?scopes=<scopes> — OAuth scopes to request (default: the post-scan minimal
 *                      set "read:user user:email"; the full set adds `repo`).
 */
export default function AuthGithubClient() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function start() {
      const params = new URLSearchParams(window.location.search);
      const scan = params.get("scan");
      const scopes = params.get("scopes");
      try {
        if (scan) sessionStorage.setItem("autofix_oauth_scan_id", scan);
        else sessionStorage.removeItem("autofix_oauth_scan_id");
      } catch {
        /* sessionStorage unavailable — OAuth still proceeds (state is advisory) */
      }
      const state =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      try {
        sessionStorage.setItem("autofix_oauth_state", state);
      } catch {
        /* sessionStorage unavailable — OAuth still proceeds (state is advisory) */
      }
      const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      const redirectUri = (isLocal ? window.location.origin : SITE_URL) + "/auth/callback";
      window.location.replace(buildGithubAuthUrl(redirectUri, state, scopes || GITHUB_SIGNUP_SCOPES));
    }
    try {
      start();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach GitHub.");
    }
  }, []);

  if (error) {
    return (
      <AuthShell>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Could not start GitHub sign-in</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "10px 0 20px" }}>{error}</p>
        <Link href="/login" className="btn btn-primary" style={{ borderRadius: 10, padding: "12px 22px" }}>Back to login</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-spinner" aria-hidden="true" />
      <p style={{ color: "var(--muted)", fontSize: 14 }}>Redirecting to GitHub…</p>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp-login-wrap">
      <div className="lp-card" style={{ textAlign: "center", padding: "44px 28px" }}>{children}</div>
    </div>
  );
}
