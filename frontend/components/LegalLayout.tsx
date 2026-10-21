import type { ReactNode } from "react";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { LogoMark } from "./Logo";

// Shared legal-link list (footer on all public marketing pages).
export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/security", label: "Security" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/contact", label: "Contact" },
];

export function LegalFooter() {
  return (
    <footer className="landing-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="brand" style={{ fontSize: 20, color: "white" }}>
              <LogoMark size={30} withWordmark />
            </Link>
            <p className="footer-tagline">Detect. Alert. Fix. Automatically.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h2>Legal</h2>
              <ul>
                {LEGAL_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="footer-column">
              <h2>Product</h2>
              <ul>
                <li><Link href="/">Home</Link></li>
                <li><Link href="/providers">Providers</Link></li>
                <li><Link href="/pricing">Pricing</Link></li>
                <li><Link href="/about">About</Link></li>
                <li><Link href="/dashboard">Dashboard</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

/** Shared header + content width + footer for legal/trust pages. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href="/" className="brand" style={{ color: "var(--text)", fontSize: 17 }}>
            <LogoMark size={26} withWordmark />
          </Link>
          <Link
            href="/"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", textDecoration: "none" }}
          >
            &larr; Back to home
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 96px" }}>{children}</main>
      <LegalFooter />
    </>
  );
}

/** A numbered legal section with an anchor id (used by the on-page TOC). */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={{ marginTop: 40, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ lineHeight: 1.75, fontSize: 15, color: "var(--text)" }}>{children}</div>
    </section>
  );
}

/** Legal page header: title + last-updated + optional on-page section navigation. */
export function LegalTitle({
  title,
  updated,
  intro,
  toc,
}: {
  title: string;
  updated: string;
  intro?: string;
  toc?: { id: string; label: string }[];
}) {
  return (
    <>
      <h1 style={{ fontSize: 34, fontWeight: 800, color: "var(--text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
        {title}
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
        Last updated: {updated}
      </p>
      {intro && <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text)", margin: "0 0 8px" }}>{intro}</p>}
      {toc && toc.length > 0 && (
        <nav
          aria-label="On this page"
          style={{
            margin: "20px 0 0",
            padding: "16px 20px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", display: "block", marginBottom: 8 }}>
            On this page
          </span>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {toc.map((s) => (
              <li key={s.id} style={{ marginBottom: 4 }}>
                <a href={`#${s.id}`} style={{ color: "#635bff", textDecoration: "none" }}>
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  );
}