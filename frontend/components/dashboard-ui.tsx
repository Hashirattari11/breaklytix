"use client";

// ---------------------------------------------------------------------------
// Breaklytix — Premium shared UI primitives (lightweight, zero dependencies).
// Consumed by dashboard, settings, admin, and health pages.
// ---------------------------------------------------------------------------

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

/* ─────────────────────────────── Page header ─────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="p-page-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="p-page-title">{title}</h1>
        {subtitle && <p className="p-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="p-page-actions">{actions}</div>}
    </div>
  );
}

/* ──────────────────────────────── Sparkline ──────────────────────────────── */

export type SparkTone = "accent" | "green" | "amber" | "red";

export function Sparkline({
  data,
  tone = "accent",
  height = 44,
}: {
  data: number[];
  tone?: SparkTone;
  height?: number;
}) {
  // useId is stable across server and client renders; Math.random() here
  // caused hydration mismatches in production dashboards.
  const id = `sp${useId().replace(/:/g, "")}`;
  if (!data || data.length < 2) {
    return <div className={`p-sparkline p-sparkline--${tone}`} style={{ height }} aria-hidden="true" />;
  }
  const w = 120;
  const h = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className={`p-sparkline p-sparkline--${tone}`} style={{ height }} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} opacity="0.22" />
      <path d={line} />
    </svg>
  );
}

/* ─────────────────────────────── Score ring ──────────────────────────────── */

export function ScoreRing({
  value,
  label,
  size = 96,
  tone,
}: {
  value: number;
  label?: string;
  size?: number;
  tone?: SparkTone;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const resolved: SparkTone = tone ?? (safe >= 80 ? "green" : safe >= 55 ? "amber" : "red");
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg className={`p-score-ring p-score-ring--${resolved}`} width={size} height={size} viewBox="0 0 100 100">
        <circle className="p-score-bg" cx="50" cy="50" r={r} />
        <circle
          className="p-score-fg"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - safe / 100)}
        />
      </svg>
      <div style={{ position: "absolute", textAlign: "center", lineHeight: 1.1 }}>
        <div style={{ fontSize: size * 0.24, fontWeight: 800, color: "var(--text)" }}>{safe}</div>
        <div style={{ fontSize: size * 0.11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label ?? "Score"}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Stat card ───────────────────────────────── */

export function StatCard({
  label,
  value,
  icon,
  tone = "accent",
  delta,
  deltaDir = "none",
  spark,
  href,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "accent" | "green" | "amber" | "red" | "gray";
  delta?: string;
  /** ONLY set this when delta is a MEASURED trend (vs a prior period).
   * Descriptions like "provider API keys connected" are not trends — the
   * default renders plain text with no arrow. Never fake a positive trend,
   * especially for degraded/error states. */
  deltaDir?: "up" | "down" | "flat" | "none";
  spark?: number[];
  href?: string;
}) {
  const card = (
    <div className={`p-stat-card p-stat-card--${tone === "accent" ? "accent" : tone}`}>
      <div className="p-stat-top">
        {icon && (
          <div
            className="p-stat-icon"
            style={{
              background:
                tone === "green" ? "rgba(10,125,61,0.09)"
                : tone === "amber" ? "rgba(180,83,9,0.1)"
                : tone === "red" ? "rgba(185,28,28,0.08)"
                : tone === "gray" ? "rgba(107,114,128,0.1)"
                : "var(--p-gradient-soft)",
              color: tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : tone === "red" ? "var(--red)" : "var(--accent)",
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="p-stat-label">{label}</p>
          <p className="p-stat-value">{value}</p>
        </div>
      </div>
      {delta && (
        <div className={`p-stat-delta p-stat-delta--${deltaDir}`}>
          {deltaDir === "up" ? "↑ " : deltaDir === "down" ? "↓ " : deltaDir === "flat" ? "→ " : ""}
          {delta}
        </div>
      )}
      {spark && spark.length >= 2 && (
        <div style={{ marginTop: 10 }}>
          <Sparkline data={spark} tone={tone === "accent" ? "green" : tone === "red" ? "red" : tone === "amber" ? "amber" : "green"} height={36} />
        </div>
      )}
    </div>
  );
  if (!href) return card;
  return (
    <Link href={href} className="p-stat-card-link" aria-label={label}>
      {card}
    </Link>
  );
}

/* ──────────────────────────────── Skeleton ───────────────────────────────── */

export function Skeleton({
  variant = "text",
  style,
}: {
  variant?: "text" | "title" | "card" | "avatar" | "line";
  style?: React.CSSProperties;
}) {
  return <div className={`p-skeleton p-skeleton--${variant}`} style={style} aria-hidden="true" />;
}

export function SkeletonGrid({ count = 4, card = false }: { count?: number; card?: boolean }) {
  return (
    <div className="p-stats-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{card ? <Skeleton variant="card" /> : <Skeleton variant="line" />}</div>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Empty state ─────────────────────────────── */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="p-empty">
      {icon && <div className="p-empty-icon">{icon}</div>}
      <h3 className="p-empty-title">{title}</h3>
      {body && <p className="p-empty-body">{body}</p>}
      {action}
    </div>
  );
}

/* ─────────────────────────────── Error card ──────────────────────────────── */

export function ErrorCard({
  title = "Something went wrong",
  body,
  retry,
}: {
  title?: string;
  body?: string;
  retry?: () => void;
}) {
  return (
    <div className="p-error-card">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="p-error-title">{title}</p>
        {body && <p className="p-error-body">{body}</p>}
      </div>
      {retry && (
        <button className="p-btn p-btn--sm p-btn--ghost" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────── Badge ──────────────────────────────────── */

export type BadgeTone = "green" | "amber" | "red" | "accent" | "gray";

export function Badge({ tone = "gray", children, dot }: { tone?: BadgeTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`p-badge p-badge--${tone} ${dot ? "p-badge--dot" : ""}`}>
      {children}
    </span>
  );
}

const SEV_TONE: Record<string, BadgeTone> = { critical: "red", high: "amber", medium: "accent", low: "gray" };
const SEV_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export function severityTone(sev?: string | null): BadgeTone {
  return SEV_TONE[sev ?? ""] ?? "gray";
}
export function severityLabel(sev?: string | null): string {
  return SEV_LABEL[sev ?? ""] ?? (sev ? String(sev) : "Unknown");
}

/* ──────────────────────────────── Switch ─────────────────────────────────── */

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="p-switch" style={{ opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="p-switch-track" aria-hidden="true" />
      <span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</span>
        {hint && (
          <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/* ────────────────────────────── Segmented ────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="p-segmented" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Progress ────────────────────────────────── */

export function Progress({
  value,
  max = 100,
  tone,
  label,
  right,
}: {
  value: number;
  max?: number;
  tone?: SparkTone;
  label?: string;
  right?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {(label || right) && (
        <div className="p-progress-label">
          <span>{label}</span>
          {right && <span>{right}</span>}
        </div>
      )}
      <div className="p-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`p-progress-bar ${tone ? `p-progress-bar--${tone}` : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Toasts ─────────────────────────────────── */

type ToastMsg = { id: number; type: "success" | "error" | "info"; message: string };

let toastListeners: ((t: ToastMsg) => void)[] = [];
let toastSeq = 0;
function emitToast(type: ToastMsg["type"], message: string) {
  const t: ToastMsg = { id: ++toastSeq, type, message };
  toastListeners.forEach((l) => l(t));
}

export const toast = {
  success: (m: string) => emitToast("success", m),
  error: (m: string) => emitToast("error", m),
  info: (m: string) => emitToast("info", m),
};

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const l = (t: ToastMsg) => {
      setItems((s) => [...s, t]);
      window.setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4500);
    };
    toastListeners.push(l);
    return () => {
      toastListeners = toastListeners.filter((x) => x !== l);
    };
  }, []);
  return (
    <div className="p-toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`p-toast p-toast--${t.type}`}>
          <span aria-hidden="true">{t.type === "success" ? "✓" : t.type === "error" ? "!" : "ℹ"}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Utilities ───────────────────────────────── */

export function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function initials(name?: string | null, fallback = "?"): string {
  const s = name?.trim() || "";
  return s ? s.charAt(0).toUpperCase() : fallback;
}
