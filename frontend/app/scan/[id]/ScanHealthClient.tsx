"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScanHealth, ScanHealthFinding } from "../../../lib/instant-scan";
import { recordScanEvent } from "../../../lib/instant-scan";
import { track } from "../../../lib/analytics";

const CATEGORIES = ["dependencies", "security", "integrations", "config", "seo"] as const;
const SEVERITY_COLOR: Record<string, string> = {
  high: "#b91c1c",
  medium: "#b45309",
  low: "#1d4ed8",
  info: "#6b7280",
};

function toMarkdown(health: ScanHealth, repo: string): string {
  const lines: string[] = [];
  lines.push(`# Code Health Report — ${repo}`);
  lines.push("");
  lines.push(`Health score: ${health.score}/100 (${health.summary.total} possible issues)`);
  lines.push("");
  for (const cat of CATEGORIES) {
    const items = health.findings.filter((f) => f.category === cat);
    if (!items.length) continue;
    lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    for (const f of items) {
      lines.push(`- [${f.severity}] ${f.title}${f.file_path ? ` — ${f.file_path}${f.line_number ? `:${f.line_number}` : ""}` : ""}`);
      if (f.explanation) lines.push(`  ${f.explanation}`);
      if (f.suggested_action) lines.push(`  Suggested: ${f.suggested_action}`);
      if (f.evidence) lines.push(`  Evidence: ${f.evidence}`);
    }
    lines.push("");
  }
  lines.push(health.disclaimer);
  return lines.join("\n");
}

export default function ScanHealthClient({
  scanId,
  repo,
  health,
}: {
  scanId: string;
  repo: string;
  health: ScanHealth | null | undefined;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    try { setAuthed(Boolean(window.localStorage.getItem("autofix_token"))); } catch { setAuthed(false); }
  }, []);

  const findings = health?.findings || [];
  const visible = useMemo(() => {
    const filtered = filter === "all" ? findings : findings.filter((f) => f.severity === filter);
    return authed ? filtered : filtered.slice(0, 5);
  }, [findings, filter, authed]);

  if (!health) return null;

  const md = toMarkdown(health, repo);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
      track("report_copied");
      recordScanEvent("report_copied" as any, scanId, repo);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="health-title" style={{ marginTop: 30 }}>
      <h2 id="health-title" style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 800 }}>
        Code Health Report
      </h2>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 20,
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{health.score}</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>/100 · {health.summary.total} possible issues</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(["all", "high", "medium", "low", "info"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: filter === s ? "var(--accent)" : "var(--bg)",
                color: filter === s ? "#fff" : "var(--text)",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {s === "all" ? "All" : s}
              {s !== "all" ? ` (${health.summary.by_severity[s] ?? 0})` : ""}
            </button>
          ))}
        </div>

        {!authed && findings.length > 5 ? (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
            Showing the top 5 of {findings.length} findings. Sign in with GitHub to see all.
          </p>
        ) : null}

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {visible.map((f, i) => (
            <article
              key={`${f.id}-${i}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                background: "var(--bg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: SEVERITY_COLOR[f.severity] || "#6b7280" }}>
                  {f.severity}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{f.category}</span>
                <strong style={{ fontSize: 13.5 }}>{f.title}</strong>
              </div>
              {f.file_path ? (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>
                  {f.file_path}
                  {f.line_number ? `:${f.line_number}` : ""}
                  {f.service ? ` (${f.service})` : ""}
                </div>
              ) : null}
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{f.explanation}</p>
              {f.suggested_action ? (
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                  Suggested: {f.suggested_action}
                </p>
              ) : null}
              {f.evidence ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [`${f.id}-${i}`]: !e[`${f.id}-${i}`] }))}
                  style={{ marginTop: 6, background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
                >
                  {expanded[`${f.id}-${i}`] ? "Hide evidence" : "Show evidence"}
                </button>
              ) : null}
              {expanded[`${f.id}-${i}`] && f.evidence ? (
                <pre style={{ marginTop: 6, padding: 8, background: "var(--surface)", borderRadius: 6, fontSize: 11.5, overflowX: "auto", whiteSpace: "pre-wrap" }}>
                  {f.evidence}
                </pre>
              ) : null}
            </article>
          ))}
          {visible.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5 }}>No findings in this category/severity.</p>
          ) : null}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void copyReport()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {copied ? "Copied ✓" : "Copy report as Markdown"}
          </button>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{health.disclaimer}</p>
      </div>
    </section>
  );
}
