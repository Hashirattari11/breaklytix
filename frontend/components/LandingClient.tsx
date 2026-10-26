"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthed } from "../lib/auth";
import { track, type AnalyticsEvent } from "../lib/analytics";
import { PROVIDER_REGISTRY } from "../lib/providers/registry";
import type { ProviderCategory } from "../lib/providers/types";
import { LEGAL_LINKS } from "./LegalLayout";
import { LogoMark } from "./Logo";
import { SUPPORT_EMAIL } from "../lib/site";
import { LANDING_FAQ } from "../lib/landing-faq";

/* ─── Intersection Observer hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── prefers-reduced-motion hook ─── */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ─── Animated counter ─── */
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const { ref, visible } = useReveal(0.3);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const duration = 1200;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [visible, target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ─── Provider category → color helpers ─── */
const CATEGORY_COLORS: Record<ProviderCategory, string> = {
  payment: "#635bff",
  communication: "#f22f46",
  cloud: "#06b6d4",
  ai: "#a78bfa",
  analytics: "#f59e0b",
  database: "#22c55e",
  devtools: "#1f2328",
  media: "#ec4899",
  other: "#64748b",
};
function categoryColor(cat: ProviderCategory): string {
  return CATEGORY_COLORS[cat] || "#64748b";
}
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ─── GitHub CTA (existing real OAuth flow — no fake signup) ─── */
function GithubCta({
  className = "",
  style,
  children,
  event = "github_connect_click" as AnalyticsEvent,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  event?: AnalyticsEvent;
}) {
  return (
    <Link
      href="/auth/github"
      className={className}
      style={style}
      onClick={() => track(event)}
    >
      {children}
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AHA-MOMENT HERO DEMO
   An animated simulation of the real Breaklytix flow:
   API CHANGE → Breaklytix Detection → Repository → File → Risk → Action
   Data is illustrative and labeled as a product demonstration.
   ═══════════════════════════════════════════════════════════════ */

const DEMO_STEPS = 6; // 0 alert, 1 repo link, 2 files, 3 risk, 4 action, 5 hold

function AhaDemo() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(reduced ? 4 : 0);
  const [confidence, setConfidence] = useState(reduced ? 94 : 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inViewRef = useRef(true);

  // Pause the loop while off-screen (performance).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { inViewRef.current = e.isIntersecting; }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Step machine.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (!inViewRef.current) return;
      setStep((s) => (s + 1) % DEMO_STEPS);
    }, 2200);
    return () => clearInterval(id);
  }, [reduced]);

  // Confidence counter (0 → 94 when the risk step shows).
  useEffect(() => {
    if (reduced) { setConfidence(94); return; }
    if (step < 3 && step !== 0) { setConfidence(0); return; }
    if (step < 3) return;
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setConfidence(Math.floor(p * 94));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, reduced]);

  const show = (min: number) => (reduced ? true : step >= min);
  const dim = (min: number) => ({
    // Resting opacity was 0.25, which left not-yet-revealed demo rows at a
    // measured ~1.3:1 contrast — effectively unreadable, and an axe
    // colour-contrast failure. 0.85 keeps a visible "not revealed yet" cue
    // while every resting row still clears 4.5:1; revealed rows are 1.
    opacity: show(min) ? 1 : 0.85,
    transform: show(min) ? "translateY(0)" : "translateY(6px)",
    transition: "all 0.5s ease",
  });

  return (
    <div className="aha-wrap" ref={wrapRef} aria-label="Product demonstration: an API change mapped to affected code">
      {/* window chrome */}
      <div className="aha-chrome">
        <span className="lp-code-dot" style={{ background: "#ff5f57" }} />
        <span className="lp-code-dot" style={{ background: "#ffbd2e" }} />
        <span className="lp-code-dot" style={{ background: "#28ca42" }} />
        <span className="aha-chrome-title">Breaklytix — Impact Analysis</span>
        <span className="aha-demo-tag">demo</span>
      </div>

      <div className="aha-body">
        {/* STEP 1 — API change detected */}
        <div className="aha-row" style={dim(0)}>
          <div className="aha-provider-badge" style={{ background: "#635bff" }}>S</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="aha-row-title">
              API CHANGE DETECTED
              <span className="aha-badge aha-badge-danger" style={{ marginLeft: 8 }}>BREAKING RISK</span>
            </div>
            <div className="aha-row-sub">
              <strong>Stripe</strong> · charges API deprecation published
            </div>
            <div className="aha-row-meta">
              source: stripe.com/docs/upgrades · {reduced ? "14:32" : "today"} · changelog monitor
            </div>
          </div>
          <span className={`aha-pulse-dot ${reduced ? "" : "live"}`} />
        </div>

        {/* connector line */}
        <div className={`aha-connector ${show(1) ? "on" : ""}`} aria-hidden="true"><span /></div>

        {/* STEP 2 — repository matched */}
        <div className="aha-row" style={dim(1)}>
          <div className="aha-file-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="aha-row-title">REPOSITORY MATCHED</div>
            <div className="aha-row-sub"><span className="aha-mono">payments-service</span> · your GitHub repository</div>
          </div>
          <span className={`aha-badge ${show(1) ? "aha-badge-success" : "aha-badge-neutral"}`}>{show(1) ? "MATCHED" : "SCANNING"}</span>
        </div>

        {/* connector line */}
        <div className={`aha-connector ${show(2) ? "on" : ""}`} aria-hidden="true"><span /></div>

        {/* STEP 3 — affected files/functions */}
        <div className="aha-row" style={dim(2)}>
          <div className="aha-file-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="aha-row-title">IMPACT ANALYSIS — 2 FILES AFFECTED</div>
            <div className="aha-code-lines">
              <div><span className="aha-mono aha-file">src/payment/checkout.ts</span> <span className="aha-arrow">→</span> <span className="aha-fn">createCheckoutSession()</span></div>
              <div><span className="aha-mono aha-file">src/webhooks/stripe.ts</span> <span className="aha-arrow">→</span> <span className="aha-fn">handleStripeWebhook()</span></div>
            </div>
          </div>
        </div>

        {/* STEP 4 — risk + confidence */}
        <div className="aha-risk-row" style={dim(3)}>
          <div className="aha-risk-cell">
            <span className="aha-label">RISK</span>
            <span className="aha-badge aha-badge-danger">HIGH</span>
          </div>
          <div className="aha-risk-cell">
            <span className="aha-label">CONFIDENCE</span>
            <span className="aha-confidence">{confidence}%</span>
          </div>
          <div className="aha-risk-cell aha-why">
            <span className="aha-label">WHY</span>
            <span className="aha-why-text">Your repo uses the API pattern removed by this change.</span>
          </div>
        </div>

        {/* STEP 5 — recommended action */}
        <div className="aha-action" style={dim(4)}>
          <div className="aha-row-title" style={{ marginBottom: 6 }}>RECOMMENDED ACTION</div>
          <p className="aha-action-text">
            Review affected Stripe API usage and update the integration before the provider change reaches production.
          </p>
          <div className="aha-action-cta">
            <span className="aha-view-btn">VIEW IMPACT</span>
            <span className="aha-action-meta">fix window: before next deploy</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BEFORE / AFTER flow
   ═══════════════════════════════════════════════════════════════ */
function BeforeAfter() {
  const { ref, visible } = useReveal(0.2);
  const before = ["API provider changes", "No one notices", "Code keeps running", "Provider removes / changes API", "Production incident", "Engineers investigate"];
  const after = ["API change published", "Breaklytix detects it", "Mapped to your repositories", "Affected files identified", "Risk + confidence shown", "Fix before production breaks"];
  return (
    <div ref={ref} className="ba-grid" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.7s ease" }}>
      <div className="ba-col ba-col-before">
        <h3 className="ba-title">Most teams find out too late.</h3>
        <ol className="ba-flow">
          {before.map((s, i) => (
            <li key={s} className="ba-step" style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-12px)", transition: `all 0.5s ease ${i * 0.12}s` }}>
              <span className="ba-idx ba-idx-bad">{i + 1}</span>{s}
              {i < before.length - 1 && <span className="ba-arrow-bad" aria-hidden="true">↓</span>}
            </li>
          ))}
        </ol>
      </div>
      <div className="ba-col ba-col-after">
        <h3 className="ba-title">With Breaklytix</h3>
        <ol className="ba-flow">
          {after.map((s, i) => (
            <li key={s} className="ba-step" style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(12px)", transition: `all 0.5s ease ${0.3 + i * 0.12}s` }}>
              <span className="ba-idx ba-idx-good">{i + 1}</span>{s}
              {i < after.length - 1 && <span className="ba-arrow-good" aria-hidden="true">↓</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WHAT BREAKLYTIX ACTUALLY TELLS YOU — 4 cards, sequential reveal
   ═══════════════════════════════════════════════════════════════ */
function WhatYouGet() {
  const r1 = useReveal(0.2); const r2 = useReveal(0.2); const r3 = useReveal(0.2); const r4 = useReveal(0.2);
  const cards = [
    { r: r1, tag: "01 · WHAT CHANGED", body: <>Provider <strong>changed / deprecated an API</strong> — detected from the official changelog.</>, tone: "#a78bfa" },
    { r: r2, tag: "02 · WHAT IS AFFECTED", body: <><span className="aha-mono">payments-service</span><br /><span className="aha-mono">src/payment/checkout.ts</span><br /><span className="aha-mono">createCheckoutSession()</span></>, tone: "#06b6d4" },
    { r: r3, tag: "03 · HOW SERIOUS IS IT", body: <><span className="aha-badge aha-badge-danger">HIGH RISK</span><br /><strong>94% confidence</strong> — scored against your detected usage.</>, tone: "#f59e0b" },
    { r: r4, tag: "04 · WHAT SHOULD I DO", body: <>Review the affected API usage and <strong>update the integration</strong> — with a link to the provider&apos;s official source.</>, tone: "#22c55e" },
  ];
  return (
    <div className="wyg-grid">
      {cards.map((c, i) => (
        <div key={c.tag} className="wyg-card" ref={c.r.ref} style={{ opacity: c.r.visible ? 1 : 0, transform: c.r.visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.55s ease ${i * 0.18}s`, borderTopColor: c.tone }}>
          <div className="wyg-tag" style={{ color: c.tone }}>{c.tag}</div>
          <div className="wyg-body">{c.body}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CODE IMPACT VISUAL — API change ↔ repository code
   ═══════════════════════════════════════════════════════════════ */
function CodeImpact() {
  const { ref, visible } = useReveal(0.25);
  return (
    <div ref={ref} className="ci-wrap" style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: "all 0.7s ease" }}>
      <div className="ci-col">
        <div className="ci-card ci-card-provider">
          <div className="ci-card-head"><span className="aha-provider-badge" style={{ background: "#635bff" }}>S</span> Provider change</div>
          <div className="ci-field"><span className="aha-label">Provider</span> Stripe</div>
          <div className="ci-field"><span className="aha-label">Change</span> Deprecated API endpoint — <span className="aha-mono">source</span> parameter removed</div>
          <div className="ci-field"><span className="aha-label">Source</span> <span className="aha-mono">stripe.com/docs/upgrades</span></div>
        </div>
        <div className={`ci-link ${visible ? "on" : ""}`} aria-hidden="true"><span className="ci-link-line" /><span className="ci-link-arrow">⇢</span></div>
        <div className="ci-card ci-card-code">
          <div className="lp-code-header" style={{ borderRadius: "12px 12px 0 0" }}>
            <span className="lp-code-dot" style={{ background: "#ff5f57" }} /><span className="lp-code-dot" style={{ background: "#ffbd2e" }} /><span className="lp-code-dot" style={{ background: "#28ca42" }} />
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#b3b3cf", fontFamily: "var(--font-mono)" }}>src/payment/checkout.ts</span>
          </div>
          <pre className="ci-code"><code>{`const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function createCheckoutSession() {
  return await stripe.charges.create({
    amount: 2000,
    currency: "usd",
    source: token, // ⚠ parameter removed upstream
  });
}`}</code></pre>
          <div className="ci-code-foot">
            <span className="aha-badge aha-badge-danger">HIGH</span>
            <span className="aha-mono ci-fn-chip">createCheckoutSession()</span>
            <span className="ci-foot-note">usage detected by Breaklytix scan</span>
          </div>
        </div>
      </div>
      <div className="ci-chain" aria-label="Impact chain">
        {["payments-service", "src/payment/checkout.ts", "createCheckoutSession()"].map((c, i) => (
          <span key={c} className="ci-chain-item" style={{ opacity: visible ? 1 : 0, transition: `opacity 0.5s ease ${0.3 + i * 0.2}s` }}>
            <span className="aha-mono">{c}</span>
            {i < 2 && <span className="ci-chain-arrow" aria-hidden="true">→</span>}
          </span>
        ))}
        <span className="aha-badge aha-badge-danger" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease 0.9s" }}>RISK: HIGH</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (isAuthed()) router.replace("/dashboard");
    track("landing_page_view");
  }, [router]);

  const hero = useReveal(0.1);
  const midCta = useReveal(0.25);
  const pains = [useReveal(), useReveal(), useReveal()];
  const diff = useReveal(0.2);
  const steps = [useReveal(), useReveal(), useReveal(), useReveal()];
  const apisRef = useReveal(0.1);
  const preview = useReveal(0.2);
  const pricing = [useReveal(), useReveal(), useReveal()];
  const faq = useReveal(0.1);
  const cta = useReveal();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .lp-hero-bg {
          position: absolute; inset: 0; z-index: 0; overflow: hidden;
          background: linear-gradient(135deg, #0f0a2e 0%, #1a1145 30%, #0d1b3e 60%, #0a0f2c 100%);
        }
        .lp-hero-bg::before {
          content: ""; position: absolute; inset: -50%;
          width: 200%; height: 200%;
          background: radial-gradient(ellipse at 30% 20%, rgba(99,91,255,0.25) 0%, transparent 50%),
                      radial-gradient(ellipse at 70% 60%, rgba(139,92,246,0.2) 0%, transparent 50%),
                      radial-gradient(ellipse at 50% 90%, rgba(6,182,212,0.15) 0%, transparent 50%);
          animation: meshGradient 12s ease infinite;
        }
        .lp-hero-bg::after {
          content: ""; position: absolute; inset: 0;
          background-image: radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 32px 32px;
        }
        .lp-glow-btn { position: relative; overflow: hidden; transition: transform 0.2s, box-shadow 0.3s; }
        .lp-glow-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(99,91,255,0.4); }
        .lp-glow-btn::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
          transform: translateX(-100%); transition: transform 0.5s;
        }
        .lp-glow-btn:hover::after { transform: translateX(100%); }
        .lp-stat-card {
          background: rgba(255,255,255,0.06); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
          padding: 28px 24px; text-align: center; transition: transform 0.3s, border-color 0.3s;
        }
        .lp-stat-card:hover { transform: translateY(-4px); border-color: rgba(99,91,255,0.4); }
        .lp-stat-number { font-size: 36px; font-weight: 800; color: white; line-height: 1; }
        .lp-stat-label { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 8px; }
        .lp-api-card {
          background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
          padding: 28px; transition: transform 0.3s, box-shadow 0.3s;
        }
        .lp-api-card:hover { transform: translateY(-4px) scale(1.01); box-shadow: 0 12px 36px rgba(16,24,40,0.1); }
        .lp-api-logo {
          width: 52px; height: 52px; border-radius: 14px; display: flex;
          align-items: center; justify-content: center; color: white;
          font-weight: 800; font-size: 20px; margin-bottom: 16px;
        }
        .lp-pricing-card {
          position: relative; background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 36px; display: flex; flex-direction: column;
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .lp-pricing-card:hover { transform: translateY(-6px); box-shadow: 0 16px 48px rgba(16,24,40,0.1); }
        .lp-pricing-card.popular { border-color: var(--accent); box-shadow: 0 8px 32px rgba(99,91,255,0.15); }
        .lp-check { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; font-size: 14px; }
        .lp-check svg { width: 20px; height: 20px; color: var(--green); flex-shrink: 0; margin-top: 2px; }
        .lp-faq-list { max-width: 760px; margin: 0 auto; display: grid; gap: 12px; }
        .lp-faq-item {
          background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
          overflow: hidden; transition: border-color 0.25s ease;
        }
        .lp-faq-item[open] { border-color: var(--accent); }
        .lp-faq-item summary {
          list-style: none; cursor: pointer; padding: 18px 48px 18px 20px; position: relative;
          font-size: 16px; font-weight: 700; color: var(--text, inherit); line-height: 1.4;
        }
        .lp-faq-item summary::-webkit-details-marker { display: none; }
        .lp-faq-item summary::after {
          content: ""; position: absolute; right: 20px; top: 50%; width: 10px; height: 10px;
          border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted);
          transform: translateY(-70%) rotate(45deg); transition: transform 0.25s ease;
        }
        .lp-faq-item[open] summary::after { transform: translateY(-30%) rotate(225deg); }
        .lp-faq-item summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .lp-faq-a {
          margin: 0; padding: 0 20px 18px; font-size: 15px; line-height: 1.65; color: var(--muted);
        }
        .lp-cta-section {
          position: relative; overflow: hidden; padding: 80px 24px; text-align: center;
          background: linear-gradient(135deg, #0f0a2e, #1a1145, #0d1b3e);
          border-radius: 24px; margin: 0 24px;
        }
        .lp-cta-section::before {
          content: ""; position: absolute; inset: 0;
          background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .lp-cta-glow {
          position: absolute; width: 400px; height: 400px; border-radius: 50%;
          background: radial-gradient(circle, rgba(99,91,255,0.2) 0%, transparent 70%);
          top: 50%; left: 50%; transform: translate(-50%, -50%);
          animation: pulseScale 4s ease-in-out infinite;
        }
        .lp-scroll-top {
          position: fixed; bottom: 24px; right: 24px; width: 44px; height: 44px;
          border-radius: 50%; background: var(--accent); color: white; border: none;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(99,91,255,0.3); z-index: 90;
          opacity: 0; transform: translateY(16px); transition: opacity 0.3s, transform 0.3s;
          pointer-events: none;
        }
        .lp-scroll-top.show { opacity: 1; transform: translateY(0); pointer-events: auto; }

        /* ─── AHA demo ─── */
        .aha-wrap {
          background: #131327; border: 1px solid #2d2d44; border-radius: 16px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,91,255,0.08);
          overflow: hidden; max-width: 560px; width: 100%;
        }
        .aha-chrome {
          display: flex; align-items: center; gap: 8px; padding: 12px 16px;
          background: #1c1c33; border-bottom: 1px solid #2d2d44;
        }
        .aha-chrome-title { margin-left: 6px; font-size: 12px; color: #b3b3cf; font-family: var(--font-mono); }
        .aha-demo-tag {
          margin-left: auto; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
          color: #b3b3cf; border: 1px solid #2d2d44; border-radius: 999px; padding: 2px 8px;
        }
        .aha-body { padding: 18px 18px 20px; display: flex; flex-direction: column; }
        .aha-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); }
        .aha-provider-badge {
          width: 30px; height: 30px; border-radius: 8px; color: white; font-weight: 800; font-size: 14px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .aha-file-icon {
          width: 30px; height: 30px; border-radius: 8px; color: #06b6d4; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; background: rgba(6,182,212,0.12);
        }
        .aha-row-title { font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: #e4e4f4; }
        .aha-row-sub { font-size: 13px; color: #b6b6d6; margin-top: 3px; }
        .aha-row-meta { font-family: var(--font-mono); font-size: 11px; color: #9a9ac4; margin-top: 3px; }
        .aha-mono { font-family: var(--font-mono); font-size: 12.5px; color: #7dd3fc; word-break: break-all; }
        .aha-arrow { color: #9a9ac4; margin: 0 4px; }
        .aha-fn { color: #c4b5fd; }
        .aha-code-lines { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .aha-badge {
          display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 700;
          letter-spacing: 0.06em; border-radius: 999px; padding: 3px 9px; white-space: nowrap;
        }
        .aha-badge-danger { background: rgba(239,68,68,0.15); color: #ff8a8a; border: 1px solid rgba(239,68,68,0.35); }
        .aha-badge-success { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.35); }
        .aha-badge-neutral { background: rgba(255,255,255,0.06); color: #b3b3cf; border: 1px solid rgba(255,255,255,0.12); }
        .aha-pulse-dot { width: 9px; height: 9px; border-radius: 50%; background: #34d399; margin-top: 6px; }
        .aha-pulse-dot.live { animation: pulse 2s infinite; }
        .aha-connector { display: flex; align-items: center; height: 18px; padding-left: 26px; }
        .aha-connector span {
          display: block; width: 2px; height: 100%; transform-origin: top; transform: scaleY(0);
          background: linear-gradient(180deg, #06b6d4, rgba(6,182,212,0.15)); transition: transform 0.45s ease;
        }
        .aha-connector.on span { transform: scaleY(1); }
        .aha-risk-row { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 2px 0; }
        .aha-risk-cell {
          display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
        }
        .aha-risk-cell.aha-why { flex: 1; min-width: 160px; }
        .aha-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: #9a9ac4; }
        .aha-confidence { font-size: 17px; font-weight: 800; color: #ff8a8a; font-variant-numeric: tabular-nums; }
        .aha-why-text { font-size: 12px; color: #b6b6d6; line-height: 1.45; }
        .aha-action { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: rgba(99,91,255,0.08); border: 1px solid rgba(99,91,255,0.25); }
        .aha-action-text { font-size: 13px; color: #d6d6ea; line-height: 1.5; margin: 0; }
        .aha-action-cta { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
        .aha-view-btn {
          font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          color: #0b1020; background: linear-gradient(135deg, #22d3ee, #818cf8);
          border-radius: 8px; padding: 6px 12px;
        }
        .aha-action-meta { font-family: var(--font-mono); font-size: 11px; color: #9a9ac4; }

        /* ─── Before / After ─── */
        .ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; max-width: 1050px; margin: 0 auto; }
        .ba-col { border-radius: 16px; padding: 28px; border: 1px solid var(--border); }
        .ba-col-before { background: rgba(239,68,68,0.04); border-color: rgba(239,68,68,0.18); }
        .ba-col-after { background: rgba(99,91,255,0.05); border-color: rgba(99,91,255,0.25); }
        .ba-title { font-size: 19px; font-weight: 800; margin: 0 0 18px; }
        .ba-col-before .ba-title { color: #ff8a8a; }
        .ba-col-after .ba-title { color: #a78bfa; }
        .ba-flow { list-style: none; margin: 0; padding: 0; }
        .ba-step { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 14px; color: var(--text, inherit); flex-wrap: wrap; }
        .ba-idx {
          width: 22px; height: 22px; border-radius: 50%; font-size: 11px; font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ba-idx-bad { background: rgba(239,68,68,0.14); color: #ff8a8a; }
        .ba-idx-good { background: rgba(99,91,255,0.16); color: #a78bfa; }
        .ba-arrow-bad { width: 100%; color: rgba(239,68,68,0.35); font-size: 11px; padding-left: 6px; line-height: 0.6; }
        .ba-arrow-good { width: 100%; color: rgba(99,91,255,0.4); font-size: 11px; padding-left: 6px; line-height: 0.6; }

        /* ─── What you get ─── */
        .wyg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; max-width: 1200px; margin: 0 auto; }
        .wyg-card {
          background: var(--surface); border: 1px solid var(--border); border-top: 3px solid;
          border-radius: 14px; padding: 24px 22px;
        }
        .wyg-tag { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 14px; }
        .wyg-body { font-size: 14.5px; line-height: 1.65; color: var(--text, inherit); }
        .wyg-body .aha-mono { display: inline-block; padding: 1px 0; }

        /* ─── Code impact ─── */
        .ci-wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
        .ci-col { display: grid; grid-template-columns: 1fr 1.4fr; gap: 24px; align-items: stretch; }
        .ci-card { border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
        .ci-card-provider { padding: 22px; }
        .ci-card-head { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; margin-bottom: 16px; }
        .ci-field { font-size: 13.5px; line-height: 1.6; padding: 7px 0; border-bottom: 1px dashed var(--border); }
        .ci-field:last-child { border-bottom: none; }
        .ci-link { display: flex; align-items: center; gap: 8px; padding: 0 24px; height: 26px; }
        .ci-link-line { flex: 1; height: 2px; background: linear-gradient(90deg, #635bff, #06b6d4); transform: scaleX(0); transform-origin: left; transition: transform 0.6s ease 0.2s; border-radius: 2px; }
        .ci-link.on .ci-link-line { transform: scaleX(1); }
        .ci-link-arrow { color: #06b6d4; opacity: 0; transition: opacity 0.4s ease 0.6s; }
        .ci-link.on .ci-link-arrow { opacity: 1; }
        .ci-card-code { overflow: hidden; }
        .ci-code {
          margin: 0; padding: 18px 20px; overflow-x: auto; background: #1a1a2e;
          font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; color: #e4e4e7; white-space: pre;
        }
        .ci-code-foot { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(255,255,255,0.02); flex-wrap: wrap; }
        .ci-fn-chip { color: #c4b5fd; }
        .ci-foot-note { font-size: 11px; color: var(--muted); }
        .ci-chain { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; padding: 8px 0; }
        .ci-chain-item { display: inline-flex; align-items: center; gap: 10px; }
        .ci-chain-item .aha-mono { background: rgba(6,182,212,0.08); border: 1px solid rgba(6,182,212,0.25); border-radius: 8px; padding: 5px 10px; }
        .ci-chain-arrow { color: #9a9ac4; }

        /* ─── Pain points / steps / diff ─── */
        .pain-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 30px;
          transition: transform 0.3s, border-color 0.3s;
        }
        .pain-card:hover { transform: translateY(-4px); border-color: var(--accent); }
        .pain-title { font-size: 18px; font-weight: 800; margin: 0 0 10px; }
        .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 1000px; margin: 0 auto; }
        .diff-col { border-radius: 16px; padding: 28px; border: 1px solid var(--border); background: var(--surface); }
        .diff-col.breaklytix { border-color: rgba(99,91,255,0.4); box-shadow: 0 8px 32px rgba(99,91,255,0.12); }
        .diff-item { display: flex; gap: 10px; padding: 8px 0; font-size: 14.5px; align-items: flex-start; }
        .diff-yes { color: var(--green); flex-shrink: 0; }
        .diff-no { color: #ff8a8a; flex-shrink: 0; }
        .step-card {
          position: relative; background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 30px; text-align: left;
        }
        .step-card::before {
          content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--accent), #8b5cf6); border-radius: 16px 16px 0 0;
        }
        .step-num { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: 0.1em; margin-bottom: 12px; }
        .preview-panel {
          background: #131327; border: 1px solid #2d2d44; border-radius: 18px; overflow: hidden;
          box-shadow: 0 30px 90px rgba(0,0,0,0.4); max-width: 1080px; margin: 0 auto;
        }
        .preview-head { display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: #1c1c33; border-bottom: 1px solid #2d2d44; flex-wrap: wrap; }
        .preview-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 0; }
        .preview-left { padding: 22px; border-right: 1px solid #2d2d44; display: flex; flex-direction: column; gap: 4px; }
        .preview-right { padding: 22px; }
        .pv-field { padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.07); font-size: 13.5px; color: #d6d6ea; }
        .pv-field:last-child { border-bottom: none; }
        .preview-note { text-align: center; font-size: 12px; color: var(--muted); margin-top: 14px; }

        /* ─── Responsive ─── */
        @media (max-width: 1024px) {
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-apis-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .wyg-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 880px) {
          .ba-grid { grid-template-columns: 1fr !important; }
          .diff-grid { grid-template-columns: 1fr !important; }
          .ci-col { grid-template-columns: 1fr !important; }
          .preview-grid { grid-template-columns: 1fr !important; }
          .preview-left { border-right: none; border-bottom: 1px solid #2d2d44; }
        }
        @media (max-width: 768px) {
          .lp-hero { padding: 100px 16px 60px !important; }
          .lp-hero .container { grid-template-columns: 1fr !important; text-align: left; gap: 44px; }
          .lp-hero .container > * { min-width: 0 !important; max-width: 100%; }
          .lp-hero h1 { overflow-wrap: break-word; }
          .lp-hero-cta { align-items: flex-start; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-steps-grid { grid-template-columns: 1fr !important; }
          .lp-pricing-grid { grid-template-columns: minmax(0, 1fr) !important; max-width: 400px; margin: 0 auto; }
          .lp-cta-section { margin: 0 !important; border-radius: 16px !important; padding: 56px 20px !important; }
          .aha-wrap { max-width: 100%; }
          .aha-connector { display: none; }
          .wyg-grid { grid-template-columns: 1fr !important; }
          /* minmax(0, 1fr) instead of 1fr: the auto minimum sized these tracks
             to the cards' min-content (measured 165.8px + 147.5px + 20px gap =
             333px) which is wider than the 256px content box at 320px, so the
             right column ran out to x=365 — 45px past the viewport, clipped by
             the page's overflow-x:hidden. minmax(0,...) lets tracks shrink. */
          .lp-apis-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        /* The pair only truly fits down to ~397px at the default 28px card
           padding (333px + 64px of section/container padding). Trim padding and
           gap so 2 columns stay correct at 360px/375px, then drop to a single
           column below 350px where even the trimmed pair cannot fit. */
        @media (max-width: 400px) {
          .lp-api-card { padding: 14px; }
          .lp-apis-grid { gap: 10px; }
          .lp-faq-item summary { padding: 16px 44px 16px 16px; font-size: 15px; }
          .lp-faq-a { padding: 0 16px 16px; font-size: 14px; }
        }
        @media (max-width: 350px) {
          .lp-apis-grid { grid-template-columns: 1fr !important; }
        }
        /* 3 pricing columns need ~876px of box (828px of card min-content +
           48px of gaps). Between 769px and 1023px the box is only 681-911px,
           so repeat(3, 1fr) grew the grid to x=920 — a 151px page overflow at
           769px and 20px at 900px. Two columns fit: at 769px the track is
           328px, and the widest card content (233px row + 74px padding =
           307px) still fits inside it, so the 48px price survives unchanged. */
        @media (min-width: 769px) and (max-width: 1023px) {
          .lp-pricing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        /* ─── Reduced motion ─── */
        @media (prefers-reduced-motion: reduce) {
          .lp-hero-bg::before, .lp-cta-glow, .aha-pulse-dot.live { animation: none !important; }
          .lp-glow-btn::after { display: none; }
          * { scroll-behavior: auto !important; }
        }
      `}} />

      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="brand"><LogoMark size={26} withWordmark /></Link>
          <nav className="landing-nav-links">
            <Link href="#product">Product</Link>
            <Link href="#how-it-works" onClick={() => track("see_how_click")}>How It Works</Link>
            <Link href="/security">Security</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/providers">Providers</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="/login" className="landing-nav-link">Sign In</Link>
            <GithubCta className="btn btn-primary lp-glow-btn" event="nav_get_started_click">Get Started Free</GithubCta>
          </nav>
          <GithubCta className="btn btn-primary lp-glow-btn landing-nav-cta-mobile" event="nav_get_started_click">Start free trial</GithubCta>
        </div>
      </header>

      <main>
        {/* ═══════ HERO ═══════ */}
        <section className="lp-hero" style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", padding: "120px 24px 80px" }} aria-labelledby="hero-title">
          <div className="lp-hero-bg" />
          <div className="container" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 56, alignItems: "center" }} ref={hero.ref}>
            <div style={{ opacity: hero.visible ? 1 : 0, transform: hero.visible ? "translateY(0)" : "translateY(32px)", transition: "all 0.7s ease" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: "rgba(99,91,255,0.15)", border: "1px solid rgba(99,91,255,0.3)", color: "#a78bfa", fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", animation: "pulse 2s infinite" }} />
                Early access is open
              </div>
              <h1 id="hero-title" style={{ fontSize: "clamp(34px, 4.6vw, 52px)", fontWeight: 800, lineHeight: 1.12, margin: "0 0 22px", letterSpacing: "-0.02em", color: "white" }}>
                Know what API changes will <span style={{ background: "linear-gradient(135deg, #a78bfa, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>break your code</span> before they break production.
              </h1>
              <p style={{ fontSize: 18, lineHeight: 1.7, color: "rgba(255,255,255,0.68)", margin: "0 0 30px", maxWidth: 540 }}>
                Breaklytix monitors your third-party API dependencies and maps provider changes directly to the <strong style={{ color: "white" }}>repositories, files, and code usage</strong> they could affect — with risk, confidence, and what to fix.
              </p>
              <div className="lp-hero-cta" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <GithubCta
                    className="btn btn-primary btn-lg lp-glow-btn"
                    style={{ fontSize: 16, padding: "16px 30px", background: "linear-gradient(135deg, var(--accent), #7c3aed)", border: "none", borderRadius: 12 }}
                    event="hero_cta_click"
                  >
                    Scan My Repository — Free
                  </GithubCta>
                  <Link href="#how-it-works" className="btn btn-lg" style={{ fontSize: 15, padding: "16px 26px", background: "rgba(255,255,255,0.07)", color: "white", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12 }} onClick={() => track("see_how_click")}>
                    See How It Works
                  </Link>
                </div>
                <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
                  No credit card required&nbsp;•&nbsp;Connect GitHub&nbsp;•&nbsp;Scan your first repository free
                </p>
              </div>
            </div>
            <div style={{ opacity: hero.visible ? 1 : 0, transform: hero.visible ? "translateX(0)" : "translateX(40px)", transition: "all 0.7s ease 0.2s" }}>
              <AhaDemo />
            </div>
          </div>
        </section>

        {/* ═══════ BEFORE / AFTER ═══════ */}
        <section id="before-after" className="section" style={{ background: "var(--bg)" }} aria-labelledby="ba-title-h">
          <div className="container">
            <div className="section-header">
              <h2 id="ba-title-h" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>From &ldquo;nobody noticed&rdquo; to &ldquo;nobody surprised&rdquo;</h2>
              <p className="section-subheadline">The same API change. Two very different days for your team.</p>
            </div>
            <BeforeAfter />
          </div>
        </section>

        {/* ═══════ WHAT YOU GET ═══════ */}
        <section id="product" className="section" style={{ background: "var(--surface)" }} aria-labelledby="wyg-title">
          <div className="container">
            <div className="section-header">
              <h2 id="wyg-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>Don&apos;t just know that an API changed. Know what it means for your code.</h2>
              <p className="section-subheadline">Every alert answers four questions — in order.</p>
            </div>
            <WhatYouGet />
          </div>
        </section>

        {/* ═══════ MID CTA ═══════ */}
        <section style={{ padding: "72px 24px" }} ref={midCta.ref}>
          <div className="lp-cta-section" style={{ opacity: midCta.visible ? 1 : 0, transform: midCta.visible ? "translateY(0)" : "translateY(24px)", transition: "all 0.6s ease" }}>
            <div className="lp-cta-glow" />
            <div style={{ position: "relative", zIndex: 1, maxWidth: 640, margin: "0 auto" }}>
              <h2 style={{ fontSize: "clamp(26px, 3.6vw, 34px)", fontWeight: 800, color: "white", margin: "0 0 14px", lineHeight: 1.25 }}>Your APIs are dependencies. Start monitoring them.</h2>
              <p style={{ fontSize: 16.5, color: "rgba(255,255,255,0.65)", margin: "0 0 28px", lineHeight: 1.6 }}>See your API dependencies and potential impact before they become production problems.</p>
              <GithubCta className="btn btn-primary btn-lg lp-glow-btn" style={{ fontSize: 16, padding: "16px 34px", background: "linear-gradient(135deg, var(--accent), #7c3aed)", border: "none", borderRadius: 12 }} event="github_connect_click">
                Scan My Repository — Free
              </GithubCta>
            </div>
          </div>
        </section>

        {/* ═══════ CODE IMPACT VISUAL ═══════ */}
        <section className="section" style={{ background: "var(--bg)" }} aria-labelledby="ci-title">
          <div className="container">
            <div className="section-header">
              <h2 id="ci-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>Where exactly will this change hit you?</h2>
              <p className="section-subheadline">From the provider&apos;s changelog to the exact function in your repository.</p>
            </div>
            <CodeImpact />
          </div>
        </section>

        {/* ═══════ PAIN POINTS ═══════ */}
        <section className="section" style={{ background: "var(--surface)" }} aria-labelledby="pain-title">
          <div className="container">
            <div className="section-header">
              <h2 id="pain-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>Why this keeps happening</h2>
              <p className="section-subheadline">Third-party APIs are dependencies — most teams just can&apos;t see them.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, maxWidth: 1000, margin: "0 auto" }} className="lp-steps-grid">
              {[
                { t: "APIs change.", d: "Provider APIs evolve, deprecate, and ship new SDK versions — constantly, and on their schedule." },
                { t: "Your code depends on them.", d: "Your application may have API usage scattered across repositories, files, and call sites." },
                { t: "Production shouldn't be your warning system.", d: "Know about potential impact before your customers discover it for you." },
              ].map((p, i) => (
                <div key={p.t} className="pain-card" ref={pains[i].ref} style={{ opacity: pains[i].visible ? 1 : 0, transform: pains[i].visible ? "translateY(0)" : "translateY(24px)", transition: `all 0.6s ease ${i * 0.15}s` }}>
                  <h3 className="pain-title">{p.t}</h3>
                  <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>{p.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ DIFFERENTIATION ═══════ */}
        <section className="section" style={{ background: "var(--bg)" }} aria-labelledby="diff-title">
          <div className="container">
            <div className="section-header">
              <h2 id="diff-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>From API monitoring to code-level impact</h2>
              <p className="section-subheadline">Changelogs tell you what a provider did. Breaklytix tells you what it does to you.</p>
            </div>
            <div className="diff-grid" ref={diff.ref} style={{ opacity: diff.visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
              <div className="diff-col">
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 14px", color: "var(--muted)" }}>Traditional API monitoring</h3>
                <div className="diff-item"><span className="diff-yes">✓</span> Detect provider changes</div>
                <div className="diff-item"><span className="diff-yes">✓</span> Show the changelog</div>
                <div className="diff-item"><span className="diff-no">✗</span> Doesn&apos;t know your code</div>
                <div className="diff-item"><span className="diff-no">✗</span> Doesn&apos;t identify affected files</div>
                <div className="diff-item"><span className="diff-no">✗</span> Doesn&apos;t explain repository-level impact</div>
              </div>
              <div className="diff-col breaklytix">
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 14px" }}>Breaklytix</h3>
                <div className="diff-item"><span className="diff-yes">✓</span> Detect provider changes</div>
                <div className="diff-item"><span className="diff-yes">✓</span> Understand API dependencies in your code</div>
                <div className="diff-item"><span className="diff-yes">✓</span> Map changes to your repositories</div>
                <div className="diff-item"><span className="diff-yes">✓</span> Identify affected files and functions</div>
                <div className="diff-item"><span className="diff-yes">✓</span> Show severity and confidence</div>
                <div className="diff-item"><span className="diff-yes">✓</span> Recommend the next step — with the official source</div>
              </div>
            </div>
            <p style={{ textAlign: "center", fontSize: 15, color: "var(--muted)", marginTop: 32 }}>Built for modern engineering teams. Early access is open.</p>
          </div>
        </section>

        {/* ═══════ HOW IT WORKS ═══════ */}
        <section id="how-it-works" className="section" style={{ background: "var(--surface)" }} aria-labelledby="how-title">
          <div className="container">
            <div className="section-header">
              <h2 id="how-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>How it works</h2>
              <p className="section-subheadline">Four steps from &ldquo;which APIs do we even use?&rdquo; to knowing your exposure.</p>
            </div>
            <div className="lp-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, maxWidth: 1200, margin: "0 auto" }}>
              {[
                { num: "01", title: "Connect", desc: "Connect your GitHub account and pick a repository." },
                { num: "02", title: "Discover", desc: "Breaklytix scans your code and discovers every third-party API dependency." },
                { num: "03", title: "Monitor", desc: "We monitor provider changes, deprecations, incidents, and SDK releases daily." },
                { num: "04", title: "Understand impact", desc: "See which repositories, files, and code usage may be affected — with risk and confidence." },
              ].map((s, i) => (
                <div key={s.num} className="step-card" ref={steps[i].ref} style={{ opacity: steps[i].visible ? 1 : 0, transform: steps[i].visible ? "translateY(0)" : "translateY(24px)", transition: `all 0.6s ease ${i * 0.15}s` }}>
                  <div className="step-num">{s.num}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px" }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: 17, fontWeight: 600, color: "var(--accent)", marginTop: 36, marginBottom: 0 }}>Know before production finds out.</p>
          </div>
        </section>

        {/* ═══════ PRODUCT PREVIEW (illustrative) ═══════ */}
        <section className="section" style={{ background: "var(--bg)" }} aria-labelledby="preview-title">
          <div className="container">
            <div className="section-header">
              <h2 id="preview-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>The alert you actually want to receive</h2>
              <p className="section-subheadline">Every field a developer needs — nothing they have to chase down.</p>
            </div>
            <div ref={preview.ref} style={{ opacity: preview.visible ? 1 : 0, transform: preview.visible ? "translateY(0)" : "translateY(24px)", transition: "all 0.7s ease" }}>
              <div className="preview-panel">
                <div className="preview-head">
                  <span className="lp-code-dot" style={{ background: "#ff5f57" }} /><span className="lp-code-dot" style={{ background: "#ffbd2e" }} /><span className="lp-code-dot" style={{ background: "#28ca42" }} />
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#b3b3cf", fontFamily: "var(--font-mono)" }}>Breaklytix — Breaking change alert</span>
                  <span className="aha-demo-tag" style={{ marginLeft: "auto" }}>illustrative demo</span>
                </div>
                <div className="preview-grid">
                  <div className="preview-left">
                    <div className="pv-field"><span className="aha-label">PROVIDER</span><br /><strong style={{ color: "white" }}>Stripe</strong></div>
                    <div className="pv-field"><span className="aha-label">REPOSITORY</span><br /><span className="aha-mono">payments-service</span></div>
                    <div className="pv-field"><span className="aha-label">CHANGE</span><br />Deprecated API endpoint — <span className="aha-mono">source</span> parameter removed</div>
                    <div className="pv-field"><span className="aha-label">SEVERITY</span> <span className="aha-badge aha-badge-danger" style={{ marginLeft: 8 }}>HIGH</span></div>
                    <div className="pv-field"><span className="aha-label">CONFIDENCE</span> <strong style={{ color: "#ff8a8a" }}>94%</strong></div>
                    <div className="pv-field"><span className="aha-label">OFFICIAL SOURCE</span><br /><span className="aha-mono">stripe.com/docs/upgrades</span></div>
                  </div>
                  <div className="preview-right">
                    <div className="aha-row-title" style={{ marginBottom: 10 }}>AFFECTED FILES</div>
                    <div className="aha-code-lines" style={{ marginBottom: 18 }}>
                      <div><span className="aha-mono aha-file">src/payment/checkout.ts</span> <span className="aha-arrow">→</span> <span className="aha-fn">createCheckoutSession()</span></div>
                      <div><span className="aha-mono aha-file">src/webhooks/stripe.ts</span> <span className="aha-arrow">→</span> <span className="aha-fn">handleStripeWebhook()</span></div>
                    </div>
                    <div className="aha-row-title" style={{ marginBottom: 6 }}>RECOMMENDED ACTION</div>
                    <p style={{ fontSize: 13.5, color: "#d6d6ea", lineHeight: 1.6, margin: "0 0 14px" }}>
                      Review affected Stripe API usage and update the integration before the provider change reaches production.
                    </p>
                    <span className="aha-view-btn">VIEW IMPACT</span>
                  </div>
                </div>
              </div>
              <p className="preview-note">Illustrative demonstration using sample data — your alerts use your repositories and real provider changes.</p>
            </div>
          </div>
        </section>

        {/* ═══════ GITHUB CTA ═══════ */}
        <section id="get-started" className="section" style={{ background: "linear-gradient(135deg, #0f0a2e, #1a1145 60%, #0d1b3e)" }} aria-labelledby="gh-title">
          <div className="container" style={{ textAlign: "center" }}>
            <h2 id="gh-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "white", margin: "0 0 14px" }}>Find your API risks in minutes.</h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", margin: "0 0 28px" }}>Connect GitHub, choose a repository, and let Breaklytix map your API dependencies.</p>
            <GithubCta className="btn btn-primary btn-lg lp-glow-btn" style={{ fontSize: 16, padding: "16px 34px", background: "linear-gradient(135deg, var(--accent), #7c3aed)", border: "none", borderRadius: 12 }} event="github_connect_click">
              Connect GitHub — Free
            </GithubCta>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.5)", marginTop: 16 }}>Start with one repository. No credit card required.</p>
          </div>
        </section>

        {/* ═══════ SUPPORTED APIs ═══════ */}
        <section id="apis" className="section" style={{ background: "var(--surface)" }} aria-labelledby="apis-title">
          <div className="container">
            <div className="section-header">
              <h2 id="apis-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>Supported APIs</h2>
              <p className="section-subheadline">
                We detect and monitor <strong style={{ color: "var(--accent)" }}>{PROVIDER_REGISTRY.length} third-party APIs</strong> — payments, communication, cloud, AI, analytics, databases and more.
              </p>
            </div>
            <div ref={apisRef.ref} className="lp-apis-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 20, maxWidth: 1200, margin: "0 auto", opacity: apisRef.visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
              {PROVIDER_REGISTRY.map((api) => {
                const color = categoryColor(api.category);
                return (
                  <div key={api.id} className="lp-api-card">
                    <div className="lp-api-logo" style={{ background: color }}>{api.displayName.charAt(0)}</div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{api.displayName}</h3>
                    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "var(--green-bg)", color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>{api.monitoringStatus === "supported" ? "Monitored" : "Detected"}</span>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>{capitalize(api.category)} · {api.detectionEnabled ? "Detection active" : "Detection ready"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ PRICING ═══════ */}
        <section id="pricing" className="section" style={{ background: "var(--bg)" }} aria-labelledby="pricing-title">
          <div className="container">
            <div className="section-header">
              <h2 id="pricing-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>Simple, transparent pricing</h2>
              <p className="section-subheadline">All plans include a 10-day free trial. No credit card required.</p>
            </div>
            <div className="lp-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, maxWidth: 1000, margin: "0 auto", alignItems: "stretch" }}>
              {[
                { name: "Starter", price: "$500", period: "/mo", desc: "For small teams monitoring a few APIs", features: ["10 monitored APIs", "Detects all 44 API providers", "Breaking change email alerts", "Auto-fix PRs for supported rules", "Dashboard review and approval", "Weekly digest emails", "GitHub PR integration", "Email support"], cta: "Start free trial", popular: false },
                { name: "Growth", price: "$2,000", period: "/mo", desc: "For growing teams with multiple services", features: ["50 monitored APIs", "All Starter features", "Larger account-level limit", "Priority email support"], cta: "Start free trial", popular: true },
                { name: "Enterprise", price: "$10,000", period: "/mo", desc: "For large organizations with unlimited needs", features: ["Unlimited monitored APIs", "All Growth features", "Dedicated support engineer", "Custom fix-rule development"], cta: "Contact sales", popular: false },
              ].map((plan, i) => (
                <div key={plan.name} className={`lp-pricing-card ${plan.popular ? "popular" : ""}`} ref={pricing[i].ref} style={{ opacity: pricing[i].visible ? 1 : 0, transform: pricing[i].visible ? "translateY(0)" : "translateY(24px)", transition: `all 0.6s ease ${i * 0.15}s` }}>
                  {plan.popular && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", padding: "4px 14px", background: "var(--accent)", color: "white", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Most Popular</div>}
                  <div style={{ textAlign: "center", marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{plan.name}</h3>
                    <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px" }}>{plan.desc}</p>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
                      <span style={{ fontSize: "clamp(34px, calc(23vw - 40px), 48px)", fontWeight: 800, lineHeight: 1 }}>{plan.price}</span>
                      <span style={{ fontSize: 16, color: "var(--muted)" }}>{plan.period}</span>
                    </div>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1 }}>
                    {plan.features.map((f) => (
                      <li key={f} className="lp-check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <GithubCta className={`btn ${plan.popular ? "btn-primary" : "btn-outline"} btn-block`} style={{ padding: "14px 24px", fontSize: 15, fontWeight: 600, borderRadius: 12 }}>
                    {plan.cta}
                  </GithubCta>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───── FAQ ───── */}
        <section id="faq" className="section" style={{ background: "var(--surface)" }} aria-labelledby="faq-title">
          <div className="container">
            <div className="section-header">
              <h2 id="faq-title" style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px" }}>Frequently asked questions</h2>
              <p className="section-subheadline">Everything you need to know about how Breaklytix keeps your integrations from breaking.</p>
            </div>
            <div
              className="lp-faq-list"
              ref={faq.ref}
              style={{ opacity: faq.visible ? 1 : 0, transform: faq.visible ? "translateY(0)" : "translateY(24px)", transition: "all 0.6s ease" }}
            >
              {LANDING_FAQ.map((item) => (
                <details key={item.q} className="lp-faq-item">
                  <summary className="lp-faq-q">{item.q}</summary>
                  <p className="lp-faq-a">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───── FINAL CTA ───── */}
        <section style={{ padding: "80px 24px" }} ref={cta.ref}>
          <div className="lp-cta-section" style={{ opacity: cta.visible ? 1 : 0, transform: cta.visible ? "translateY(0)" : "translateY(24px)", transition: "all 0.6s ease" }}>
            <div className="lp-cta-glow" />
            <div style={{ position: "relative", zIndex: 1, maxWidth: 640, margin: "0 auto" }}>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 36px)", fontWeight: 800, color: "white", margin: "0 0 14px", lineHeight: 1.2 }}>Stop finding API problems in production.</h2>
              <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", margin: "0 0 30px", lineHeight: 1.6 }}>Know what changed. Know what is affected. Know what to fix.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <GithubCta className="btn btn-primary btn-lg lp-glow-btn" style={{ fontSize: 16, padding: "16px 36px", background: "linear-gradient(135deg, var(--accent), #7c3aed)", border: "none", borderRadius: 12 }} event="github_connect_click">
                  Scan My Repository — Free
                </GithubCta>
                <Link href="#product" className="btn btn-lg" style={{ fontSize: 15, padding: "16px 26px", background: "rgba(255,255,255,0.07)", color: "white", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12 }}>
                  Explore Breaklytix
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link href="/" className="brand" style={{ fontSize: 20, color: "white" }}><LogoMark size={30} withWordmark /></Link>
              <p className="footer-tagline">Know what API changes will break your code — before they break production.</p>
            </div>
            <div className="footer-links">
              <div className="footer-column">
                <h2>Product</h2>
                <ul>
                  <li><Link href="#product">What you get</Link></li>
                  <li><Link href="#how-it-works">How it works</Link></li>
                  <li><Link href="#apis">Supported APIs</Link></li>
                  <li><Link href="/providers">All monitored providers</Link></li>
                  <li><Link href="#pricing">Pricing</Link></li>
                  <li><Link href="/security">Security</Link></li>
                  <li><Link href="/about">About</Link></li>
                </ul>
              </div>
              <div className="footer-column">
                <h2>Legal</h2>
                <ul>
                  {LEGAL_LINKS.map((l) => (
                    <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
                  ))}
                </ul>
              </div>
              <div className="footer-column">
                <h2>Contact</h2>
                <ul>
                  <li><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} Breaklytix. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <ScrollToTop />
    </>
  );
}

function ScrollToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button className={`lp-scroll-top ${show ? "show" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Scroll to top">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
    </button>
  );
}
