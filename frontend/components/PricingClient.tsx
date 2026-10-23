"use client";

import { useState } from "react";
import Link from "next/link";
import { ensureSession, getToken } from "../lib/auth";
import { Nav } from "./ui";
import { LegalFooter } from "./LegalLayout";
import { PRICING_FAQ } from "../lib/pricing-faq";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 500,
    period: "/mo",
    apiLimit: 10,
    description: "Perfect for small teams monitoring a few APIs",
    features: [
      "10 monitored APIs",
      "Stripe, Shopify, Twilio, SendGrid, GitHub monitoring",
      "Breaking change alerts via email",
      "Auto-fix PRs for Stripe (high confidence)",
      "Review UI for medium/low confidence fixes",
      "Weekly digest emails",
      "GitHub PR integration",
      "Email support",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 2000,
    period: "/mo",
    apiLimit: 50,
    description: "For growing teams with multiple services",
    features: [
      "50 monitored APIs",
      "All Starter features",
      "Priority alert processing",
      "Custom webhook notifications",
      "Team collaboration (up to 5 seats)",
      "Usage analytics dashboard",
      "Priority email support",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 10000,
    period: "/mo",
    apiLimit: -1,
    description: "For large organizations with unlimited needs",
    features: [
      "Unlimited monitored APIs",
      "All Growth features",
      "Dedicated support engineer",
      "Custom fix rule development",
      "Custom alert routing",
      "OAuth 2.0 sign-in",
      "Unlimited team seats",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleCheckout(planId: string) {
    if (planId === "enterprise") {
      // Enterprise inquiries route to the contact page (support email is env-configurable)
      window.location.href = "/contact";
      return;
    }

    setLoadingPlan(planId);
    try {
      await ensureSession();
      const token = getToken();
      if (!token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/billing/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            plan: planId,
            success_url: `${window.location.origin}/dashboard/billing?success=true`,
            cancel_url: `${window.location.origin}/pricing?canceled=true`,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create checkout session");
      }

      const data = await res.json();
      window.location.href = data.url;
    } catch (e: any) {
      alert(e.message || "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <>
      <Nav />
      <main className="container page">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ marginBottom: 12, fontSize: 40 }}>Simple, transparent pricing</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 600, margin: "0 auto" }}>
            Choose the plan that fits your team. All plans include a 10-day free trial.
            No credit card required to start.
          </p>
        </div>

        <h2 className="sr-only">Plans and pricing</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} loading={loadingPlan === plan.id} onCheckout={handleCheckout} />
          ))}
        </div>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #eee", textAlign: "center" }}>
          <h2 style={{ marginBottom: 16, fontSize: 24 }}>Frequently asked questions</h2>
          <div style={{ display: "grid", gap: 12, maxWidth: 700, margin: "0 auto", textAlign: "left" }}>
            {PRICING_FAQ.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </main>
      <LegalFooter />
    </>
  );
}

function PlanCard({
  plan,
  loading,
  onCheckout,
}: {
  plan: (typeof PLANS)[0];
  loading: boolean;
  onCheckout: (planId: string) => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        border: plan.popular ? "2px solid #635bff" : "1px solid #eee",
        position: "relative",
      }}
    >
      {plan.popular && (
        <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)" }}>
          <span className="pill" style={{ background: "#635bff", color: "white", fontSize: 11, fontWeight: 600 }}>
            Most Popular
          </span>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>{plan.name}</h3>
        <p className="muted small" style={{ margin: 0 }}>{plan.description}</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 40, fontWeight: 700 }}>${plan.price}</span>
        <span className="muted" style={{ fontSize: 16 }}>{plan.period}</span>
      </div>

      <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="badge" style={{ background: "#635bff", fontSize: 12 }}>
            {plan.apiLimit === -1 ? "∞" : plan.apiLimit} APIs
          </span>
        </div>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1 }}>
        {plan.features.map((feature, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#28a745" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="small">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        className={`btn btn-block ${plan.popular ? "btn-primary" : "btn-secondary"}`}
        onClick={() => onCheckout(plan.id)}
        disabled={loading}
        style={{ width: "100%" }}
      >
        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Starting…</> : plan.cta}
      </button>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="card" style={{ padding: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>{q}</summary>
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>{a}</p>
    </details>
  );
}