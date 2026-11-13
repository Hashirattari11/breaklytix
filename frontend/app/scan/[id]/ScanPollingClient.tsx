"use client";

import { useEffect, useState } from "react";
import { getScanStatus, retryScan, type ScanStatus } from "../../../lib/instant-scan";

const STEPS = [
  { key: "queued", label: "Queued" },
  { key: "downloading_repo", label: "Downloading repo" },
  { key: "extracting_repo", label: "Extracting files" },
  { key: "detecting_integrations", label: "Detecting integrations" },
  { key: "completed", label: "Complete" },
] as const;

function stepIndex(step?: string | null): number {
  const idx = STEPS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : 0;
}

export default function ScanPollingClient({ scanId }: { scanId: string }) {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const s = await getScanStatus(scanId);
        if (cancelled) return;
        setStatus(s);
        if (!s) {
          setError("Scan not found.");
          return;
        }
        if (s.status === "completed") {
          if (timer) clearInterval(timer);
          window.location.reload();
          return;
        }
        if (s.status === "failed") {
          if (timer) clearInterval(timer);
          setError(s.error_message || "The scan failed. Please retry.");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Polling failed.");
      }
    }

    void poll();
    timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [scanId]);

  const currentStep = status?.progress_step || status?.status || "queued";
  const idx = stepIndex(currentStep === "scanning" ? "detecting_integrations" : currentStep);

  async function handleRetry() {
    setRetrying(true);
    setError(null);
    try {
      await retryScan(scanId);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 64px" }}>
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "26px 24px",
          background: "var(--surface)",
          boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
          Instant Repo Scan
        </p>
        <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
          {status?.repo_full_name || "Scanning…"}
        </h1>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 14.5 }}>
          {status?.progress_message || "Queued…"}
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: "rgba(0,0,0,0.72)" }}>
          {STEPS.map((step, index) => (
            <span key={step.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: index < idx ? "#34d399" : index === idx ? "#a78bfa" : "rgba(0,0,0,0.25)",
                  animation: index === idx ? "pulse 1.6s infinite" : undefined,
                }}
              />
              {step.label}
              {index < idx ? " ✓" : ""}
            </span>
          ))}
        </div>

        {error ? (
          <div style={{ marginTop: 18 }}>
            <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>{error}</p>
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={retrying}
              style={{
                marginTop: 10,
                minHeight: 44,
                padding: "0 18px",
                borderRadius: 10,
                fontSize: 14.5,
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                background: "#000",
                color: "#fff",
              }}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
