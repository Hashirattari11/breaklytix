"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getToken, isAuthed } from "../lib/auth";
import { LogoMark } from "./Logo";

const ALLOWED_NEXT = ["/admin", "/dashboard"];

/**
 * Read `?next=` and keep it for the OAuth callback. Only same-origin app paths
 * we issue ourselves are accepted (no open redirects).
 */
function captureNextParam(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
    const allowed = ALLOWED_NEXT.some(
      (path) => raw === path || raw.startsWith(`${path}/`) || raw.startsWith(`${path}?`),
    );
    if (!allowed) return null;
    sessionStorage.setItem("autofix_post_login", raw);
    return raw;
  } catch {
    return null;
  }
}

/**
 * /login — Public sign-in page.
 * Real GitHub OAuth only (backed by the backend POST /auth/github/callback).
 * Demo/anonymous sessions were removed: every account is a real GitHub login.
 */
export default function LoginClient() {
  const router = useRouter();

  // Already signed in? Re-validate the stored token with the backend, refresh
  // the httpOnly gate cookie, then continue to the requested page. This is what
  // makes existing sessions work after the server-side /admin gate ships.
  useEffect(() => {
    const next = captureNextParam();
    if (!isAuthed()) return;

    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) {
        router.replace(next || "/dashboard");
        return;
      }
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          router.replace(next || "/dashboard");
          return;
        }
        if (res.status === 401) {
          // Expired or revoked token: require a fresh GitHub sign-in.
          clearSession();
        }
      } catch {
        /* backend unreachable — stay on login instead of redirect looping */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function startGithubAuth() {
    try {
      const state =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      sessionStorage.setItem("autofix_oauth_state", state);
    } catch {
      /* sessionStorage unavailable — proceed without state pin */
    }
    window.location.href = "/auth/github";
  }

  return (
    <main className="lp-login-wrap">
      <div className="lp-card">
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Link href="/" style={{ display: "inline-flex" }}>
            <LogoMark size={34} withWordmark />
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "20px 0 6px" }}>Welcome back</h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", margin: 0 }}>
            Sign in with GitHub to monitor the APIs your repos depend on.
          </p>
        </div>

        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={startGithubAuth} style={{ fontSize: 15, padding: "14px 20px", borderRadius: 12, gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.35.95.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.66.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
          </svg>
          Continue with GitHub
        </button>

        <p style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", margin: "22px 0 0", lineHeight: 1.6 }}>
          By continuing you agree to the{" "}
          <Link href="/terms" className="lp-inline-link">Terms</Link> and{" "}
          <Link href="/privacy" className="lp-inline-link">Privacy Policy</Link>.{" "}
          Breaklytix requests read access to the repos you connect so it can detect which
          third-party APIs your code uses.
        </p>
      </div>
    </main>
  );
}