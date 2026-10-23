"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { githubCallback } from "../lib/api";
import { storeSession } from "../lib/auth";
import { SITE_URL } from "../lib/site";

const ALLOWED_NEXT = ["/admin", "/dashboard"];

/** Read and clear the post-login destination captured on /login?next=... */
function takePostLoginPath(): string {
  try {
    const raw = sessionStorage.getItem("autofix_post_login");
    sessionStorage.removeItem("autofix_post_login");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
      const allowed = ALLOWED_NEXT.some(
        (path) => raw === path || raw.startsWith(`${path}/`) || raw.startsWith(`${path}?`),
      );
      if (allowed) return raw;
    }
  } catch {
    /* sessionStorage unavailable */
  }
  return "/dashboard";
}

/**
 * /auth/callback — Final leg of GitHub OAuth.
 * Validates the one-time CSRF `state` pinned on /auth/github, exchanges the code
 * with the backend (POST /auth/github/callback), stores the session, then sends
 * the user to the consent gate (if required) or straight into the dashboard.
 */
export default function AuthCallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      setError("GitHub did not return an authorization code. Please try again.");
      return;
    }

    // One-time CSRF check against the state pinned in session storage.
    const expected =
      typeof window !== "undefined" ? sessionStorage.getItem("autofix_oauth_state") : null;
    try {
      sessionStorage.removeItem("autofix_oauth_state");
    } catch {
      /* ignore */
    }
    if (expected && state !== expected) {
      setError("Sign-in state mismatch — the request may have been tampered with. Please try again.");
      return;
    }

    (async () => {
      try {
        // Must match the redirect_uri sent to GitHub's authorize endpoint
        // exactly (pinned to the production domain there) or the token
        // exchange fails. Localhost flows keep their own origin.
        const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
        const redirectUri = (isLocal ? window.location.origin : SITE_URL) + "/auth/callback";
        const { token, user } = await githubCallback(code, redirectUri);
        storeSession(token, user);
        // Establish the httpOnly cookie used by the server-side /admin gate.
        // The backend just validated this token; the route re-checks it before
        // setting the cookie. Non-fatal: the dashboard uses the Bearer token.
        try {
          await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
        } catch {
          /* gate will re-validate on the next /login visit */
        }
        if (user.consent_required) {
          router.replace("/legal-acceptance");
        } else {
          router.replace(takePostLoginPath());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      }
    })();
  }, [params, router]);

  return (
    <main className="lp-login-wrap">
      <div className="lp-card" style={{ textAlign: "center", padding: "44px 28px" }}>
        {!error ? (
          <>
            <div className="auth-spinner" aria-hidden="true" />
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Securing your session…</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Sign-in failed</h1>
            <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "10px 0 20px" }}>{error}</p>
            <Link href="/login" className="btn btn-primary" style={{ borderRadius: 10, padding: "12px 22px" }}>Back to login</Link>
          </>
        )}
      </div>
    </main>
  );
}