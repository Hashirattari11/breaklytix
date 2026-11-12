"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startInstantScan } from "../lib/instant-scan";
import { track } from "../lib/analytics";

const SAMPLE_REPO = "https://github.com/openai/openai-quickstart-node";

const STEPS = [
  "Fetching files",
  "Detecting integrations",
  "Checking provider notices",
] as const;

const GITHUB_URL_RE = /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/i;

export default function InstantScanBox() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function stopProgress() {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }

  async function runScan(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Paste a public GitHub repository URL to scan.");
      return;
    }
    if (!GITHUB_URL_RE.test(trimmed)) {
      setError("Use a public repository URL like https://github.com/owner/repo");
      return;
    }

    setError(null);
    setBusy(true);
    setStep(0);
    track("scan_started");
    stopProgress();
    timer.current = setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, 3500);

    try {
      const payload = await startInstantScan(trimmed);
      track("scan_completed", { cached: payload.cached });
      router.push(`/scan/${payload.scan_id}`);
    } catch (err) {
      stopProgress();
      setBusy(false);
      setStep(0);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while scanning. Please try again.",
      );
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    void runScan(url);
  }

  return (
    <div
      id="instant-scan"
      style={{
        marginTop: 26,
        padding: 18,
        borderRadius: 16,
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
        maxWidth: 620,
      }}
    >
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="instant-scan-url" style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "white", marginBottom: 10 }}>
          Is your code using an API that&apos;s about to change?
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="instant-scan-url"
            name="repo_url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a public GitHub repo URL"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError(null);
            }}
            disabled={busy}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "instant-scan-error" : "instant-scan-help"}
            style={{
              flex: "1 1 280px",
              minWidth: 0,
              height: 52,
              padding: "0 16px",
              borderRadius: 12,
              border: error ? "1px solid #fca5a5" : "1px solid rgba(255,255,255,0.22)",
              background: "rgba(10,10,20,0.55)",
              color: "white",
              fontSize: 15.5,
              outline: "none",
            }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={{
              flex: "0 0 auto",
              height: 52,
              padding: "0 26px",
              borderRadius: 12,
              fontSize: 15.5,
              fontWeight: 700,
              background: "linear-gradient(135deg, var(--accent), #7c3aed)",
              border: "none",
              opacity: busy ? 0.75 : 1,
              cursor: busy ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "Scanning…" : "Scan free"}
          </button>
        </div>

        <div style={{ minHeight: 26, marginTop: 10 }} aria-live="polite">
          {error ? (
            <p id="instant-scan-error" style={{ margin: 0, fontSize: 13.5, color: "#fca5a5", lineHeight: 1.5 }}>
              {error}
            </p>
          ) : busy ? (
            <div id="instant-scan-help" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
              {STEPS.map((label, index) => (
                <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: index < step ? "#34d399" : index === step ? "#a78bfa" : "rgba(255,255,255,0.25)",
                      animation: index === step ? "pulse 1.6s infinite" : undefined,
                    }}
                  />
                  {label}
                  {index < step ? " ✓" : ""}
                </span>
              ))}
            </div>
          ) : (
            <p id="instant-scan-help" style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              No login. Public repos only. Usually under 30 seconds.
            </p>
          )}
        </div>
      </form>

      <button
        type="button"
        onClick={() => {
          setUrl(SAMPLE_REPO);
          void runScan(SAMPLE_REPO);
        }}
        disabled={busy}
        style={{
          marginTop: 4,
          padding: 0,
          background: "none",
          border: "none",
          color: "#a78bfa",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        Try with a sample repo
      </button>
    </div>
  );
}
