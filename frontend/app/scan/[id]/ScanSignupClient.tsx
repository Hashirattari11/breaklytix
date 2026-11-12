"use client";

// Post-scan sign-up / daily-monitoring CTA.
//
// Replaces the old email-only prompt after a result:
//  - Signed-out visitors: primary "Continue with GitHub" (minimal scopes) →
//    OAuth → backend links the scan to the new user and arms monitoring.
//  - Or the secondary email option (lead capture — honest copy, no magic links).
//  - Signed-in visitors: single "Add to my dashboard" action.
import { useEffect, useState, type FormEvent } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { captureScanEmail, recordScanEvent, type ScanResult } from "../../../lib/instant-scan";
import { connectInstantScanRepo, GITHUB_SIGNUP_SCOPES } from "../../../lib/api";
import { track } from "../../../lib/analytics";

const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 10,
  fontSize: 14.5,
  fontWeight: 700,
  cursor: "pointer",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
};

const buttonPrimary: CSSProperties = { ...buttonBase, background: "#000000", color: "#fff", border: "none" };

const bigButton: CSSProperties = { ...buttonPrimary, minHeight: 52, fontSize: 16, width: "100%", maxWidth: 420 };

function useAuthedFlag(): boolean {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    try {
      setAuthed(Boolean(window.localStorage.getItem("autofix_token")));
    } catch {
      setAuthed(false);
    }
  }, []);
  return authed;
}

export default function ScanSignupClient({ scanId, result }: { scanId: string; result: ScanResult }) {
  const router = useRouter();
  const authed = useAuthedFlag();
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  const headline = `Get daily monitoring for ${result.repo}`;
  const subtext = "Free beta. We email you only when a provider change may affect your code.";

  async function startGithubSignIn() {
    track("github_signup_clicked");
    recordScanEvent("github_signup_clicked", scanId, result.repo);
    try {
      sessionStorage.setItem("autofix_oauth_scan_id", scanId);
    } catch {
      /* advisory only */
    }
    window.location.href = `/auth/github?scan=${encodeURIComponent(scanId)}&scopes=${encodeURIComponent(GITHUB_SIGNUP_SCOPES)}`;
  }

  async function addToDashboard() {
    setConnecting(true);
    setConnectMessage(null);
    try {
      const res = await connectInstantScanRepo(scanId);
      if (res?.ok) {
        track("github_signup_completed");
        recordScanEvent("github_signup_completed", scanId, result.repo, { repo: res.repo_full_name });
        router.push(res.repo_id ? `/dashboard/repos/${res.repo_id}` : "/dashboard");
        return;
      }
      setConnectMessage("Could not add this repo to your dashboard. Please try again.");
    } catch (err) {
      setConnectMessage(err instanceof Error ? err.message : "Could not add this repo to your dashboard.");
    } finally {
      setConnecting(false);
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emailState === "saving" || emailState === "done") return;
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(value)) {
      setEmailState("error");
      return;
    }
    setEmailState("saving");
    try {
      const res = await captureScanEmail(scanId, value);
      setEmailState("done");
      setEmailMessage(
        res?.email_sent
          ? "Confirmation sent. Check your inbox — we will email you when a provider change may affect this repo."
          : "Saved. We could not send the confirmation right now, but your email is on the list.",
      );
      track("email_submitted");
      recordScanEvent("email_submitted", scanId, result.repo, { source: "instant_scan_cta" });
    } catch {
      setEmailState("error");
    }
  }

  const panelStyle: CSSProperties = {
    marginTop: 28,
    padding: 24,
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "var(--surface)",
  };
  const headlineStyle: CSSProperties = { margin: "0 0 8px", fontSize: 21, fontWeight: 800 };
  const subStyle: CSSProperties = { margin: 0, color: "var(--muted)", fontSize: 14.5, lineHeight: 1.6 };

  return (
    <section aria-labelledby="monitor-title" style={panelStyle}>
      <h2 id="monitor-title" style={headlineStyle}>{headline}</h2>
      <p style={subStyle}>{subtext}</p>

      {authed ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <button
            type="button"
            disabled={connecting}
            onClick={() => void addToDashboard()}
            style={{ ...bigButton, background: "linear-gradient(135deg, var(--accent), #7c3aed)" }}
          >
            {connecting ? "Adding…" : "Add to my dashboard"}
          </button>
          {connectMessage ? (
            <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 13.5 }}>{connectMessage}</p>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
              One click adds <strong>{result.repo}</strong> to your monitored repos. Daily monitoring turns on automatically.
            </p>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <button type="button" onClick={() => void startGithubSignIn()} style={{ ...bigButton, background: "#000000" }}>
            Continue with GitHub
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: "var(--muted)",
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            or
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <form onSubmit={(e) => void submitEmail(e)} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor="scan-signup-email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Email address
            </label>
            <input
              id="scan-signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailState === "saving"}
              style={{
                flex: "1 1 240px",
                minWidth: 0,
                height: 46,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 15,
              }}
            />
            <button type="submit" disabled={emailState === "saving"} style={{ ...buttonBase, background: "var(--accent)", color: "#fff", border: "none", minWidth: 150 }}>
              {emailState === "saving" ? "Sending…" : "Get alerts by email"}
            </button>
          </form>
          {emailState === "done" ? (
            <p role="status" style={{ margin: 0, color: "var(--green, #0a7d3d)", fontSize: 13.5, fontWeight: 600 }}>{emailMessage}</p>
          ) : null}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
            No credit card. Free beta. No secret values or file contents are ever shared.
          </p>
        </div>
      )}
    </section>
  );
}
