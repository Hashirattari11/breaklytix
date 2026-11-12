"use client";

// Share block for the instant scan result: post preview + character counter,
// X intent, LinkedIn intent and copy fallback.
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { buildLinkedInShareUrl, buildShareIntentUrl, buildShareText, SHARE_TEXT_LIMIT, scanUrl, type ShareTextInput } from "../../../lib/share-text";
import { recordScanEvent } from "../../../lib/instant-scan";
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

const previewStyle: CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 12,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--text)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const counterStyle: CSSProperties = { marginTop: 8, fontSize: 12, color: "var(--muted)", fontWeight: 700 };

export default function ShareBlock({ scanId, result, variant }: { scanId: string; result: ShareTextInput; variant?: "top" | "bottom" }) {
  const [copied, setCopied] = useState<"post" | "link" | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  const text = useMemo(() => buildShareText(result), [result]);
  const hasRisks = Number(result?.summary?.possible_risk_count ?? 0) > 0;

  const intentUrl = buildShareIntentUrl(scanId, text);
  const linkedinUrl = buildLinkedInShareUrl(scanId);
  const shareLink = scanUrl(scanId);
  const overBudget = text.length > SHARE_TEXT_LIMIT;

  function fireShare(platform: string) {
    track("share_clicked", { platform, has_risks: hasRisks });
    recordScanEvent("share_clicked", scanId, String(result?.repo || ""), { platform, has_risks: hasRisks });
  }

  async function copyText(value: string, kind: "post" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setCopiedMsg(kind === "post" ? "Post text copied." : "Scan link copied.");
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopiedMsg("Copy failed. Select the text and copy it manually.");
    }
  }

  function shareOnX() {
    fireShare("x");
    const win = window.open(intentUrl, "_blank", "noopener,noreferrer");
    if (!win) setCopiedMsg("Popup blocked. Use “Copy post” and paste it on X.");
  }

  function shareOnLinkedIn() {
    fireShare("linkedin");
    window.open(linkedinUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section
      aria-labelledby={variant === "top" ? "share-top" : "share-bottom"}
      style={
        variant === "top"
          ? {
              marginTop: 22,
              padding: 22,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
            }
          : {
              marginTop: 20,
              padding: 24,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }
      }
    >
      <h2 id={variant === "top" ? "share-top" : "share-bottom"} style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800 }}>
        Share this scan
      </h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={shareOnX} style={{ ...buttonPrimary, minHeight: 48, fontSize: 15 }}>
          Share on X
        </button>
        <button type="button" onClick={() => void copyText(text, "post")} style={{ ...buttonBase, minWidth: 150 }}>
          {copied === "post" ? "Copied ✓" : "Copy post"}
        </button>
        <a
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...buttonBase, textDecoration: "none", display: "inline-flex", minHeight: 44, alignItems: "center" }}
        >
          Share on LinkedIn
        </a>
        <button type="button" onClick={() => void copyText(shareLink, "link")} style={buttonBase}>
          {copied === "link" ? "Copied ✓" : "Copy link"}
        </button>
      </div>

      <div style={previewStyle} data-testid="share-preview">
        {text}
      </div>
      <p style={counterStyle}>
        Post text: {text.length}/{SHARE_TEXT_LIMIT} characters
        {overBudget ? " (over budget!)" : ` — ${SHARE_TEXT_LIMIT - text.length} characters to spare`}
      </p>

      {copiedMsg ? (
        <p role="status" style={{ margin: "10px 0 0", color: "var(--green, #0a7d3d)", fontSize: 13.5, fontWeight: 600 }}>
          {copiedMsg}
        </p>
      ) : null}

      <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
        The post opens the X composer with your scan summary prefilled and attaches the result link. No file contents,
        paths or secret values are ever included.
      </p>
    </section>
  );
}
