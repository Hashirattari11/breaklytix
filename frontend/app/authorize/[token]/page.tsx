"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface AuthorizeInfo {
  valid: boolean;
  agency_name: string;
  client_email: string;
  message: string;
  client_id?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function AuthorizePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<AuthorizeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // GitHub redirects here after installation with ?installed=1; the invite
    // token has already been consumed, so validating it would show "invalid".
    if (new URLSearchParams(window.location.search).get("installed") === "1") {
      setInstalled(true);
      setLoading(false);
      return;
    }
    async function validate() {
      try {
        const res = await fetch(`${API_BASE}/agency/authorize/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.detail || "This authorization link is invalid or has expired.");
          return;
        }
        setInfo(data);
      } catch {
        setError("Failed to connect to server. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    validate();
  }, [token]);

  async function handleInstall() {
    setInstalling(true);
    setError(null);
    try {
      // The raw invite token (not a guessable client_id) authorizes the public
      // install-url endpoint; the backend returns a signed OAuth state.
      const res = await fetch(
        `${API_BASE}/agency/public-install-url?token=${encodeURIComponent(token)}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.detail || "Failed to generate the installation link. Please try again.");
      }
    } catch {
      setError("Failed to connect to server. Please try again.");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .auth-page { min-height: 100vh; background: #f7f7fb; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .auth-card { max-width: 480px; width: 100%; background: white; border-radius: 16px; border: 1px solid #e6e6ef; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .auth-header { background: linear-gradient(135deg, #635bff, #8b5cf6); padding: 32px; text-align: center; color: white; }
        .auth-header h1 { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
        .auth-header p { font-size: 14px; margin: 0; opacity: 0.85; }
        .auth-body { padding: 32px; }
        .auth-loading { text-align: center; padding: 60px 32px; color: #6b7280; }
        .auth-error { text-align: center; padding: 40px 32px; }
        .auth-error h2 { font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 0 0 12px; }
        .auth-error p { font-size: 15px; color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
        .auth-success { text-align: center; }
        .auth-success .icon { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, rgba(99,91,255,0.1), rgba(139,92,246,0.1)); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .auth-success h2 { font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 0 0 12px; }
        .auth-success p { font-size: 15px; color: #6b7280; line-height: 1.6; margin: 0 0 8px; }
        .auth-success .email { font-weight: 600; color: #1a1a2e; }
        .auth-info-box { background: #f7f7fb; border-radius: 10px; padding: 16px; margin: 20px 0; text-align: left; }
        .auth-info-box h3 { font-size: 13px; font-weight: 600; color: #1a1a2e; margin: 0 0 10px; }
        .auth-info-box ul { font-size: 13px; color: #6b7280; margin: 0; padding-left: 20px; }
        .auth-info-box li { margin-bottom: 6px; line-height: 1.5; }
        .auth-cta { text-align: center; margin: 24px 0; }
        .auth-cta button { padding: 14px 32px; background: #1f2328; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; transition: background 0.15s, transform 0.15s; }
        .auth-cta button:hover { background: #000; transform: translateY(-1px); }
        .auth-cta button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .auth-footer { padding: 16px 32px; border-top: 1px solid #e6e6ef; text-align: center; }
        .auth-footer p { font-size: 12px; color: #9ca3af; margin: 0; }
        .auth-footer a { color: #635bff; text-decoration: none; }
        .auth-footer a:hover { text-decoration: underline; }
        .spinner-sm { display: inline-block; width: 18px; height: 18px; border: 2px solid #e6e6ef; border-top-color: #635bff; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}} />

      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Breaklytix</h1>
            <p>Repository Access Authorization</p>
          </div>

          <div className="auth-body">
            {installed && (
              <div className="auth-success">
                <div className="icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#635bff" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <h2>GitHub App installed</h2>
                <p>
                  Your selected repositories were shared with your agency. They can
                  now scan those repositories for breaking API changes.
                </p>
                <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 16 }}>
                  You can review or revoke this access at any time from your GitHub
                  settings under Installed GitHub Apps.
                </p>
                <Link href="/" style={{ color: "#635bff", textDecoration: "none", fontWeight: 600 }}>
                  ← Back to Breaklytix
                </Link>
              </div>
            )}

            {!installed && loading && (
              <div className="auth-loading">
                <div className="spinner-sm" style={{ width: 24, height: 24, borderWidth: 3, marginBottom: 16 }} />
                <p>Validating authorization link...</p>
              </div>
            )}

            {error && (
              <div className="auth-error">
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2>Something went wrong</h2>
                <p>{error}</p>
                <Link href="/" style={{ color: "#635bff", textDecoration: "none", fontWeight: 600 }}>← Back to home</Link>
              </div>
            )}

            {info && !info.valid && (
              <div className="auth-error">
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                <h2>Link Invalid</h2>
                <p>{info.message}</p>
                {info.client_email && (
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>Email: {info.client_email}</p>
                )}
                <Link href="/" style={{ color: "#635bff", textDecoration: "none", fontWeight: 600 }}>← Back to home</Link>
              </div>
            )}

            {info && info.valid && (
              <div className="auth-success">
                <div className="icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#635bff" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h2>Authorization Request</h2>
                <p>{info.message}</p>
                <p style={{ fontSize: 14 }}>Invitation sent to: <span className="email">{info.client_email}</span></p>

                <div className="auth-info-box">
                  <h3>What happens next?</h3>
                  <ul>
                    <li>Click the button below to install Breaklytix on GitHub</li>
                    <li>Pick which repository(s) to share with {info.agency_name}</li>
                    <li>{info.agency_name} will monitor for API breaking changes</li>
                    <li>You can revoke access anytime from your GitHub settings</li>
                  </ul>
                </div>

                <div className="auth-cta">
                  <button onClick={handleInstall} disabled={installing}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    {installing ? "Redirecting to GitHub..." : "Install Breaklytix on GitHub"}
                  </button>
                </div>

                <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 16 }}>
                  This link expires in 7 days. If you didn&apos;t expect this email, you can safely ignore it.
                </p>
              </div>
            )}
          </div>

          <div className="auth-footer">
            <p>Breaklytix — <a href="/">Detect. Alert. Fix. Automatically.</a></p>
          </div>
        </div>
      </div>
    </>
  );
}
