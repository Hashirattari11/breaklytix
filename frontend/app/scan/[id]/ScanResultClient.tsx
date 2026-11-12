"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { recordScanEvent, type ScanResult } from "../../../lib/instant-scan";
import ScanSignupClient from "./ScanSignupClient";
import { track } from "../../../lib/analytics";

const AGENCY_EMAIL = "hashirattari73@gmail.com";

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
}: {
  scanId: string;
  result: ScanResult;
  badgeSnippet: string;
}) {
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);

  async function copyText(value: string, kind: "link" | "badge") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
    }
    if (kind === "badge") {
      track("badge_copied");
      recordScanEvent("badge_copied", scanId, result.repo);
    }
  }

  return (
    <>
      {/* Post-scan sign-up / daily-monitoring CTA — replaces the old email-only prompt. */}
      <ScanSignupClient scanId={scanId} result={result} />

      {/* README badge */}
      <section
        aria-labelledby="badge-title"
        style={{
          marginTop: 20,
          padding: 24,
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <h2 id="badge-title" style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800 }}>
          README badge
        </h2>

        <h3 style={{ margin: "22px 0 8px", fontSize: 15, fontWeight: 700 }}>Add the badge to your README</h3>
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
