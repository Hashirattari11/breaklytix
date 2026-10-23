"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BillingStatusOut,
  createCheckoutSession,
  getBillingPortal,
  getBillingStatus,
} from "@/lib/api";

import { formatDate, Nav, Spinner, StatusPill } from "@/components/ui";

export default function BillingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatusOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBillingStatus();
      setStatus(data);
    } catch (e: any) {
      setError(e.message || "Failed to load billing status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const { url } = await getBillingPortal();
      window.location.href = url;
    } catch (e: any) {
      alert(e.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleUpgrade(plan: "starter" | "growth" | "enterprise") {
    try {
      const { url } = await createCheckoutSession({
        plan,
        success_url: `${window.location.origin}/dashboard/billing?success=true`,
        cancel_url: `${window.location.origin}/dashboard/billing?canceled=true`,
      });
      window.location.href = url;
    } catch (e: any) {
      alert(e.message || "Failed to start checkout");
    }
  }

  const isTrial = status?.plan === "trial";
  const isActive = status?.plan_status === "active";
  const limit = status?.monitored_api_limit ?? 10;
  const usage = status?.monitored_api_count ?? 0;
  const isUnlimited = limit === -1;

  if (loading) {
    return (
      <>
        <Nav />
        <main className="container page" style={{ textAlign: "center", paddingTop: 80 }}>
          <Spinner /> Loading billing…
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="container page">
        <div className="row" style={{ marginBottom: 24, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>Billing & Subscription</h1>
            <p className="muted" style={{ margin: 0 }}>
              Manage your plan, view usage, and update payment details.
            </p>
          </div>
        </div>

        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Current Plan */}
        <section className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16 }}>Current Plan</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <div>
              <div className="pill" style={{ background: isActive ? "#dcfce7" : isTrial ? "#fef3c7" : "#fee2e2", color: isActive ? "#166534" : isTrial ? "#92400e" : "#991b1b" }}>
                {isTrial ? "Trial" : isActive ? "Active" : status?.plan_status}
              </div>
<div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
  {(status?.plan || "trial").charAt(0).toUpperCase() + (status?.plan || "trial").slice(1)}
</div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {isTrial ? "10-day free trial" : isActive ? "Subscription active" : "No active subscription"}
              </div>
            </div>
            <div>
              <div className="muted small">APIs Monitored</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>
                {usage} / {isUnlimited ? "∞" : limit}
              </div>
              <div style={{ marginTop: 8, height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    background: isUnlimited ? "#635bff" : usage >= limit ? "#dc3545" : "#635bff",
                    width: isUnlimited ? "100%" : `${Math.min(100, (usage / Math.max(1, limit)) * 100)}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {isUnlimited ? "Unlimited" : `${Math.round((usage / Math.max(1, limit)) * 100)}% used`}
              </div>
            </div>
            <div>
              <div className="muted small">Billing Period</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>
                {status?.current_period_end ? formatDate(status.current_period_end) : isTrial ? "Trial period" : "—"}
              </div>
              {status?.cancel_at_period_end && (
                <div className="pill pill-amber" style={{ marginTop: 8, fontSize: 11 }}>
                  Canceling at period end
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16 }}>Manage Subscription</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {isTrial || !isActive ? (
              <>
                <Link className="btn btn-primary" href="/pricing">
                  {isTrial ? "Select a Plan" : "Subscribe"}
                </Link>
                <button className="btn btn-secondary" onClick={handleManageSubscription} disabled={!isActive}>
                  {portalLoading ? <><Spinner /> Opening…</> : "Manage in Stripe Portal"}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={handleManageSubscription} disabled={portalLoading}>
                  {portalLoading ? <><Spinner /> Opening…</> : "Manage in Stripe Portal"}
                </button>
                <Link className="btn btn-secondary" href="/pricing">
                  Change Plan
                </Link>
              </>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            The Stripe Billing Portal lets you update payment methods, download invoices, and cancel your subscription.
          </p>
        </section>

        {/* Upgrade Options (if not on Enterprise) */}
        {status?.plan !== "enterprise" && (
          <section className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 16 }}>Upgrade Options</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
              <UpgradeCard
                plan="starter"
                name="Starter"
                price={500}
                apiLimit={10}
                current={status?.plan}
                onUpgrade={handleUpgrade}
              />
              <UpgradeCard
                plan="growth"
                name="Growth"
                price={2000}
                apiLimit={50}
                current={status?.plan}
                onUpgrade={handleUpgrade}
              />
              <UpgradeCard
                plan="enterprise"
                name="Enterprise"
                price={10000}
                apiLimit={-1}
                current={status?.plan}
                onUpgrade={handleUpgrade}
              />
            </div>
          </section>
        )}

        {/* Usage Details */}
        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Usage Details</h2>
          <table className="table responsive-cards">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Metric">Connected Repositories</td>
                <td data-label="Value">— {/* Would need to fetch from /repos */}</td>
              </tr>
              <tr>
                <td data-label="Metric">APIs Monitored (this period)</td>
                <td data-label="Value">{usage} / {isUnlimited ? "Unlimited" : limit}</td>
              </tr>
              <tr>
                <td data-label="Metric">Plan Status</td>
                <td data-label="Value">
                  <StatusPill status={status?.plan_status === "active" ? "monitored" : status?.plan_status || "trial"} />
                </td>
              </tr>
              <tr>
                <td data-label="Metric">Current Period End</td>
                <td data-label="Value">{status?.current_period_end ? formatDate(status.current_period_end) : "Trial / N/A"}</td>
              </tr>
              <tr>
                <td data-label="Metric">Auto-renew</td>
                <td data-label="Value">{status?.cancel_at_period_end ? "No (cancels at period end)" : "Yes"}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}

function UpgradeCard({
  plan,
  name,
  price,
  apiLimit,
  current,
  onUpgrade,
}: {
  plan: "starter" | "growth" | "enterprise";
  name: string;
  price: number;
  apiLimit: number;
  current?: string;
  onUpgrade: (plan: "starter" | "growth" | "enterprise") => void;
}) {
  const isCurrent = current === plan;
  const isUpgrade = !isCurrent && (plan === "enterprise" || (current === "starter" && plan === "growth") || current === "trial");

  return (
    <div className="card" style={{ padding: 20, border: isCurrent ? "2px solid #635bff" : "1px solid #eee" }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 4px" }}>{name}</h3>
        {isCurrent && <span className="pill pill-blue" style={{ fontSize: 11 }}>Current Plan</span>}
      </div>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>${price}</span>
        <span className="muted">/mo</span>
      </div>
      <div className="muted small" style={{ marginBottom: 16 }}>
        {apiLimit === -1 ? "Unlimited APIs" : `${apiLimit} monitored APIs`}
      </div>
      <button
        className={`btn btn-block ${isCurrent ? "btn-secondary" : isUpgrade ? "btn-primary" : "btn-secondary"}`}
        onClick={() => !isCurrent && onUpgrade(plan)}
        disabled={isCurrent}
      >
        {isCurrent ? "Current Plan" : isUpgrade ? "Upgrade" : "Downgrade"}
      </button>
    </div>
  );
}