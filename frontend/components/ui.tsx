"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getUser } from "../lib/auth";
import { LogoMark } from "./Logo";

// ---- Provider display metadata --------------------------------------------
const API_META: Record<string, { label: string; color: string; abbr: string }> = {
  stripe: { label: "Stripe", color: "#635bff", abbr: "St" },
  shopify: { label: "Shopify", color: "#95bf47", abbr: "Sh" },
  twilio: { label: "Twilio", color: "#f22f46", abbr: "Tw" },
  sendgrid: { label: "SendGrid", color: "#1a82e2", abbr: "Sg" },
  github: { label: "GitHub", color: "#1f2328", abbr: "Gh" },
};

export function apiLabel(name: string): string {
  return API_META[name]?.label ?? name;
}

export function ApiBadge({ name }: { name: string }) {
  const meta = API_META[name] ?? { color: "#9aa0aa", abbr: name.slice(0, 2) };
  return (
    <span className="badge" style={{ background: meta.color }} title={apiLabel(name)}>
      {meta.abbr}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  if (status === "monitored") {
    return <span className="pill pill-green">● Monitored</span>;
  }
  return <span className="pill pill-gray">Coming soon</span>;
}

const SEVERITY_COLOR: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: "#fde8e8", fg: "#991b1b", label: "Critical" },
  high: { bg: "#ffedd5", fg: "#c2410c", label: "High" },
  medium: { bg: "#fef9c3", fg: "#a16207", label: "Medium" },
  low: { bg: "#f3f4f6", fg: "#4b5563", label: "Low" },
};

export function SeverityBadge({ severity, reason }: { severity: string; reason?: string | null }) {
  const meta = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.medium;
  return (
    <span
      className="pill severity-badge"
      title={reason || undefined}
      style={{
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.bg}`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="loading" />;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Nav() {
  const router = useRouter();
  // Hydration-safe: read localStorage session only after mount. Reading it
  // during render makes SSR markup (no email) differ from the client tree
  // (email span) for any signed-in visitor — React errors #418/#423.
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);

  function logout() {
    clearSession();
    window.location.href = "/dashboard";
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/dashboard" className="brand">
          <LogoMark size={26} withWordmark />
        </Link>
        <nav className="nav-links">
          <Link href="/dashboard">Repos</Link>
          <Link href="/dashboard/onboarding">Onboarding</Link>
          <Link href="/dashboard/billing">Billing</Link>
          <Link href="/dashboard/settings">Settings</Link>
          {user?.email && <span className="muted">{user.email}</span>}
          <button className="btn btn-sm" onClick={logout}>
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
