"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BillingStatusOut,
  getAlerts,
  getBillingStatus,
  listRepos,
} from "@/lib/api";

import { formatDate, Nav, Spinner, StatusPill } from "@/components/ui";

const STEPS = [
  {
    id: "connect_repo",
    title: "Connect a Repository",
    description: "Link a GitHub repository so we can scan for API usage",
    href: "/dashboard",
    check: (data: OnboardingData) => data.reposConnected > 0,
  },
  {
    id: "first_scan",
    title: "Complete First Scan",
    description: "Run a scan to detect third-party APIs in your code",
    href: "/dashboard",
    check: (data: OnboardingData) => data.firstScanComplete,
  },
  {
    id: "select_plan",
    title: "Select a Plan",
    description: "Choose a subscription plan that fits your needs",
    href: "/pricing",
    check: (data: OnboardingData) => data.planSelected,
  },
  {
    id: "first_alert",
    title: "Receive First Alert",
    description: "Get notified when a breaking change affects your code",
    href: "/dashboard",
    check: (data: OnboardingData) => data.firstAlertReceived,
  },
];

type OnboardingData = {
  reposConnected: number;
  firstScanComplete: boolean;
  planSelected: boolean;
  firstAlertReceived: boolean;
  billing?: BillingStatusOut;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Get repos count
      const repos = await listRepos();

      // Get billing status
      const billing = await getBillingStatus();

      // Get alerts count
      let alertsCount = 0;
      if (repos.length > 0) {
        const alerts = await getAlerts(repos[0].id);
        alertsCount = alerts.length;
      }

      // Get scan status (check if any repo has been scanned)
      let firstScanComplete = false;
      if (repos.length > 0) {
        firstScanComplete = repos.some((r: any) => r.last_scanned_at);
      }

      setData({
        reposConnected: repos.length,
        firstScanComplete,
        planSelected: billing?.plan_status === "active" || billing?.plan !== "trial",
        firstAlertReceived: alertsCount > 0,
        billing,
      });
    } catch (e: any) {
      setError(e.message || "Failed to load onboarding data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <>
        <Nav />
        <main className="container page" style={{ textAlign: "center", paddingTop: 80 }}>
          <Spinner /> Loading onboarding…
        </main>
      </>
    );
  }

  const completedSteps = STEPS.filter((s) => s.check(data!)).length;
  const totalSteps = STEPS.length;

  return (
    <>
      <Nav />
      <main className="container page">
        <div className="row" style={{ marginBottom: 24, alignItems: "center" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>Getting Started</h1>
            <p className="muted" style={{ margin: 0 }}>
              Complete these steps to get the most out of Breaklytix
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="pill pill-blue" style={{ fontSize: 18, padding: "8px 16px" }}>
              {completedSteps} / {totalSteps} complete
            </div>
          </div>
        </div>

        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Progress bar */}
        <div className="card" style={{ marginBottom: 24, padding: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {STEPS.map((step, i) => (
              <div key={step.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  className={`pill ${data && step.check(data) ? "pill-green" : "pill-gray"}`}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {data && step.check(data) ? "✓" : i + 1}
                </div>
                <span className="small muted" style={{ marginTop: 8, textAlign: "center", maxWidth: 100 }}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>
          <div style={{ height: 4, background: "#eee", borderRadius: 2, marginTop: 16, position: "relative" }}>
            <div
              style={{
                height: "100%",
                background: "var(--accent)",
                borderRadius: 2,
                width: `${(completedSteps / totalSteps) * 100}%`,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: "grid", gap: 12 }}>
          {STEPS.map((step) => {
            const isComplete = Boolean(data && step.check(data));
            return (
              <StepCard key={step.id} step={step} isComplete={isComplete} data={data!} />
            );
          })}
        </div>

        {completedSteps === totalSteps && (
          <div className="card" style={{ marginTop: 24, padding: 24, textAlign: "center", background: "#f0fdf4", borderColor: "#86efac" }}>
            <h2 style={{ marginBottom: 8, color: "#166534" }}>🎉 All set!</h2>
            <p className="muted" style={{ margin: 0 }}>
              You&apos;re fully onboarded. Breaklytix is now monitoring your repositories for breaking API changes.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function StepCard({
  step,
  isComplete,
  data,
}: {
  step: (typeof STEPS)[0];
  isComplete: boolean;
  data: OnboardingData;
}) {
  return (
    <Link href={step.href} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          className={`pill ${isComplete ? "pill-green" : "pill-gray"}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {isComplete ? "✓" : step.id.split("_").length} {/* Just show icon/number */}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 4px", color: isComplete ? "#166534" : "inherit" }}>
            {step.title}
          </h3>
          <p className="muted small" style={{ margin: 0 }}>
            {step.description}
          </p>
          {step.id === "select_plan" && data.billing && (
            <p className="small" style={{ marginTop: 4 }}>
              Current plan: <strong>{data.billing.plan}</strong> ({data.billing.plan_status})
            </p>
          )}
        </div>
        <span className={`pill ${isComplete ? "pill-green" : "pill-blue"}`} style={{ fontSize: 12 }}>
          {isComplete ? "Done" : "Continue"}
        </span>
      </div>
    </Link>
  );
}