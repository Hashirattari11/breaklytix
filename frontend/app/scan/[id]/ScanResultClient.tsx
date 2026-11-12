"use client";

import { FormEvent, useState } from "react";
import type { CSSProperties } from "react";
import { captureScanEmail, recordScanEvent, type ScanResult } from "../../../lib/instant-scan";
import { track } from "../../../lib/analytics";

const AGENCY_EMAIL = "hashirattari73@gmail.com";

function confidenceStyle(confidence: string): CSSProperties {
  if (confidence === "high") {
    return { background: "rgba(239,68,68,0.12)", color: "#b91c1c", border: "1px solid rgba(239,68,68,0.3)" };
  }
  if (confidence === "medium") {
    return { background: "rgba(245,158,11,0.12)", color: "#b45309", border: "1px solid rgba(245,158,11,0.3)" };
  }
  return { background: "rgba(107,114,128,0.12)", color: "#4b5563", border: "1px solid rgba(107,114,128,0.25)" };
}

const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "capitalize",
  lineHeight: 1.6,
};

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

export default function ScanResultClient({
  scanId,
  result,
  badgeSnippet,
  shareCopy,
}: {
  scanId: string;
  result: ScanResult;
  badgeSnippet: string;
  shareCopy: string;
}) {
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);

  async function copyText(value: string, kind: "link" | "badge") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
      setEmailMessage("Copy failed. Select the text and copy it manually.");
    }
    if (kind === "badge") {
      track("badge_copied");
      recordScanEvent("badge_copied", scanId, result.repo);
    }
  }

  function shareOnX() {
    track("share_clicked", { channel: "x" });
    recordScanEvent("share_clicked", scanId, result.repo);
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareCopy)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function onSubmitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emailState === "saving" || emailState === "done") return;
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(value)) {
      setEmailState("error");
      setEmailMessage("Enter a valid email address.");
      return;
    }
    setEmailState("saving");
    setEmailMessage(null);
    try {
      const res = await captureScanEmail(scanId, value);
      setEmailState("done");
      track("email_captured");
      setEmailMessage(
        res.email_sent
          ? "You're on the list. Check your inbox for a confirmation."
          : "Saved. We couldn't send the confirmation email right now, but your address is on the list.",
      );
    } catch (err) {
      setEmailState("error");
      setEmailMessage(err instanceof Error ? err.message : "Could not save your email. Try again.");
    }
  }

  return (
    <>
      {/* Email capture — AFTER the result, never before */}
      <section
        aria-labelledby="monitor-title"
        style={{
          marginTop: 28,
          padding: 24,
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "linear-gradient(135deg, rgba(99,91,255,0.08), rgba(6,182,212,0.06))",
        }}
      >
        <h2 id="monitor-title" style={{ margin: "0 0 8px", fontSize: 21, fontWeight: 800 }}>
          Want daily monitoring + email alerts when a provider changes something that affects this repo?
        </h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 14.5, lineHeight: 1.6 }}>
          We&apos;ll re-scan this repository daily and email you when an official provider notice may affect it.
        </p>
        {emailState === "done" ? (
          <p role="status" style={{ margin: 0, color: "var(--green, #0a7d3d)", fontWeight: 600, fontSize: 14.5 }}>
            {emailMessage}
          </p>
        ) : (
          <form onSubmit={onSubmitEmail} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor="scan-email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Email address
            </label>
            <input
              id="scan-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailState === "error") setEmailState("idle");
              }}
              disabled={emailState === "saving"}
              style={{
                flex: "1 1 260px",
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
            <button type="submit" disabled={emailState === "saving"} style={{ ...buttonBase, background: "var(--accent)", color: "white", border: "none", minWidth: 150 }}>
              {emailState === "saving" ? "Saving…" : "Get daily alerts"}
            </button>
          </form>
        )}
        {emailMessage && emailState !== "done" ? (
          <p role="alert" style={{ margin: "10px 0 0", color: "#b91c1c", fontSize: 13.5 }}>
            {emailMessage}
          </p>
        ) : null}
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Free beta. No credit card.
        </p>
      </section>

      {/* Share + README badge */}
      <section
        aria-labelledby="share-title"
        style={{
          marginTop: 20,
          padding: 24,
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <h2 id="share-title" style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800 }}>
          Share this result
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={shareOnX} style={{ ...buttonBase, background: "#111827", color: "white", border: "none" }}>
            Share on X
          </button>
          <button type="button" onClick={() => void copyText(`https://breaklytix.site/scan/${scanId}`, "link")} style={buttonBase}>
            {copied === "link" ? "Copied ✓" : "Copy link"}
          </button>
        </div>

        <h3 style={{ margin: "22px 0 8px", fontSize: 15, fontWeight: 700 }}>README badge</h3>
        <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>
          Add a live &ldquo;API watch&rdquo; badge to your repository README. It always reflects the latest cached scan.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
          <code
            style={{
              flex: "1 1 320px",
              minWidth: 0,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              fontSize: 12.5,
              overflowX: "auto",
              whiteSpace: "nowrap",
              lineHeight: 2.1,
            }}
          >
            {badgeSnippet}
          </code>
          <button type="button" onClick={() => void copyText(badgeSnippet, "badge")} style={{ ...buttonBase, minWidth: 140 }}>
            {copied === "badge" ? "Copied ✓" : "Copy badge"}
          </button>
        </div>
      </section>

      {/* Secondary agency CTA */}
      <section
        aria-labelledby="agency-title"
        style={{
          marginTop: 20,
          padding: 22,
          borderRadius: 16,
          border: "1px dashed var(--border)",
          background: "var(--bg)",
        }}
      >
        <h2 id="agency-title" style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>
          Need help fixing these?
        </h2>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
          Talk to Hashir.ai Agency about reviewing and updating the affected code.
        </p>
        <a
          href={`mailto:${AGENCY_EMAIL}?subject=${encodeURIComponent(`Breaklytix scan follow-up: ${result.repo}`)}`}
          style={{ ...buttonBase, textDecoration: "none", display: "inline-flex" }}
        >
          Talk to Hashir.ai Agency
        </a>
      </section>
    </>
  );
}

export { confidenceStyle, pill };
