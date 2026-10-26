"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestEmail,
  TestEmailResponse,
} from "../../../lib/api";
import { clearSession, getUser, User } from "../../../lib/auth";
import { formatDate, Spinner } from "../../../components/ui";
import { Badge, PageHeader, Progress, Switch, toast } from "../../../components/dashboard-ui";
import { applyTheme, getStoredTheme, initTheme, resolveTheme, setTheme, watchSystemTheme, ThemePref } from "../../../lib/theme";

const PREF_LABELS: Record<string, { title: string; desc: string }> = {
  breaking_changes: { title: "Breaking change alerts", desc: "Email when a monitored API ships a breaking change affecting your code" },
  code_breaks: { title: "Code breaks", desc: "Saved preference — no separate email is sent for this category yet" },
  api_errors: { title: "API errors", desc: "Saved preference — no separate email is sent for this category yet" },
  rate_limits: { title: "Rate limit warnings", desc: "Saved preference — no separate email is sent for this category yet" },
  quota: { title: "Quota usage", desc: "Saved preference — no separate email is sent for this category yet" },
  provider_incidents: { title: "Provider incidents", desc: "Saved preference — no separate email is sent for this category yet" },
  anomalies: { title: "Anomalies", desc: "Saved preference — no separate email is sent for this category yet" },
  auto_fix: { title: "Auto-fix results", desc: "Saved preference — fix results appear in Code Break Detection" },
  scan_results: { title: "Scan results", desc: "The first-scan confirmation is transactional and is not controlled by this switch" },
  digest: { title: "Weekly digest", desc: "Weekly summary email, sent Mondays at 09:00 UTC" },
};

type SettingsTab = "general" | "notifications" | "email" | "billing" | "danger";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    ),
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
    ),
  },
  {
    id: "email",
    label: "Email",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
    ),
  },
  {
    id: "billing",
    label: "Billing",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
    ),
  },
  {
    id: "danger",
    label: "Session",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
    ),
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [testState, setTestState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [testResult, setTestResult] = useState<TestEmailResponse | null>(null);
  const [themePref, setThemePref] = useState<ThemePref>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const handleThemeChange = (pref: ThemePref) => {
    setThemePref(pref);
    setResolvedTheme(setTheme(pref));
  };

  type BillingStatus = {
    plan: string;
    plan_status: string;
    monitored_api_limit: number;
    monitored_api_count: number;
    current_period_end?: string | null;
    cancel_at_period_end: boolean;
  };

  useEffect(() => {
    setUser(getUser());
    loadBilling();
    loadPrefs();
  }, []);

  // Theme: initialise from localStorage and watch OS preference.
  useEffect(() => {
    const pref = initTheme();
    setThemePref(pref);
    setResolvedTheme(resolveTheme(pref));
    const unsub = watchSystemTheme(pref);
    return unsub;
  }, []);

  async function loadPrefs() {
    try {
      const res = await getNotificationPreferences();
      setPrefs(res.categories);
    } catch {
      // Left null; the section shows a "could not load" state.
    }
  }

  async function handleSavePrefs() {
    if (!prefs) return;
    setSavingPrefs(true);
    setPrefsSaved(false);
    setPrefsError(null);
    try {
      const res = await updateNotificationPreferences(prefs);
      setPrefs(res.categories);
      setPrefsSaved(true);
      toast.success("Notification preferences saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save preferences";
      setPrefsError(msg);
      toast.error(msg);
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleSendTestEmail() {
    setTestState("sending");
    setTestResult(null);
    try {
      const res = await sendTestEmail();
      setTestResult(res);
      setTestState(res.ok ? "done" : "error");
      if (res.ok) toast.success("Test email sent to your inbox");
      else toast.error(res.detail || "Test email failed");
    } catch (e) {
      setTestResult({
        ok: false,
        status: "failed",
        detail: e instanceof Error ? e.message : "Test email request failed",
      });
      setTestState("error");
      toast.error(e instanceof Error ? e.message : "Test email request failed");
    }
  }

  function togglePref(category: string) {
    setPrefs((p) => (p ? { ...p, [category]: !p[category] } : p));
    setPrefsSaved(false);
  }

  async function loadBilling() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/billing/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("autofix_token")}` },
      });
      if (res.ok) {
        setBilling(await res.json());
      }
    } catch {
      // Ignore billing errors
    }
  }

  function reconnect() {
    window.location.href = "/auth/github";
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      clearSession();
      window.location.href = "/login";
    } catch (e) {
      console.error("Disconnect failed:", e);
      alert("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
      setShowDisconnectConfirm(false);
    }
  }

  if (!user) {
    return (
      <main className="container page" style={{ textAlign: "center", paddingTop: 80 }}>
        <Spinner /> Loading…
      </main>
    );
  }

  const planTone =
    billing?.plan_status === "active" ? "green" : billing?.plan === "trial" ? "amber" : "red";

  const planPct =
    billing && billing.monitored_api_limit !== -1 && billing.monitored_api_limit > 0
      ? Math.min(100, Math.round(((billing.monitored_api_count || 0) / billing.monitored_api_limit) * 100))
      : null;

  return (
    <main className="p-page">
      <PageHeader
        title="Settings"
        subtitle="Manage your account, GitHub connection, notification preferences, and plan."
      />

      <div className="p-settings">
        <nav className="p-settings-nav" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`p-settings-nav-item ${tab === t.id ? "p-settings-nav-item--active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-settings-content">
          {/* ─── GENERAL: GitHub connection ─── */}
          {tab === "general" && (
            <>
            <section className="p-settings-card p-anim-fade-up" key="general">
              <h3>GitHub connection</h3>
              <p>
                Access uses the <code>repo</code>, <code>read:user</code> and <code>user:email</code> scopes.
                Reconnect if you&apos;ve changed permissions or revoked access.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", margin: "4px 0 18px" }}>
                <div className="p-avatar" style={{ width: 48, height: 48, borderRadius: 14, fontSize: 20 }}>
                  {user?.github_login?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {user?.github_login ? `@${user.github_login}` : "GitHub user"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user?.email}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                    <Badge tone={planTone} dot>
                      {(billing?.plan || "trial").charAt(0).toUpperCase() + (billing?.plan || "trial").slice(1)} plan
                    </Badge>
                    {billing?.plan_status === "active" && billing.current_period_end && (
                      <span className="p-hint" style={{ margin: 0 }}>Renews {formatDate(billing.current_period_end)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-row-cols">
                <button className="p-btn p-btn--ghost" onClick={reconnect}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                  Reconnect GitHub
                </button>
                <button className="p-btn p-btn--ghost" onClick={() => setShowDisconnectConfirm(true)} disabled={disconnecting}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  Sign out of this browser
                </button>
              </div>
            </section>

            {/* ─── THEME PREFERENCE ─── */}
            <section className="p-settings-card p-anim-fade-up" key="theme" style={{ marginTop: 20 }}>
              <h3 style={{ margin: "0 0 4px" }}>Theme</h3>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--muted)" }}>
                Choose between light, dark, or let Breaklytix follow your operating system preference.
              </p>
              <div className="p-segmented" style={{ width: "fit-content" }}>
                {(["light", "dark", "system"] as ThemePref[]).map((p) => (
                  <button
                    key={p}
                    aria-pressed={themePref === p}
                    onClick={() => handleThemeChange(p)}
                  >
                    {p === "light" ? "☀️ Light" : p === "dark" ? "🌙 Dark" : "💻 System"}
                  </button>
                ))}
              </div>
              {themePref === "system" && (
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted)" }}>
                  Currently following your OS: <strong style={{ color: "var(--text)", textTransform: "capitalize" }}>{resolvedTheme}</strong>
                </p>
              )}
            </section>
            </>
          )}

          {/* ─── NOTIFICATIONS: email preferences ─── */}
          {tab === "notifications" && (
            <section className="p-settings-card p-anim-fade-up" key="notifications">
              <h3>Notification preferences</h3>
              <p>
                Notifications are sent to your account email ({user?.email || "your account"}). Only
                Breaking change alerts and the Weekly digest currently control email; the other switches are
                saved preferences, and every alert remains visible in the dashboard.
              </p>

              {!prefs ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", padding: "12px 0" }}>
                  <Spinner /> Loading preferences…
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
                    {Object.entries(PREF_LABELS).map(([cat, label]) => (
                      <Switch
                        key={cat}
                        checked={!!prefs[cat]}
                        onChange={() => togglePref(cat)}
                        label={label.title}
                        hint={label.desc}
                      />
                    ))}
                  </div>

                  <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                    <h4 style={{ margin: "0 0 8px" }}>Daily status email</h4>
                    <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--muted)" }}>
                      A daily status email is not currently sent. The recurring summary is the Weekly digest
                      above, delivered on Mondays at 09:00 UTC.
                    </p>
                  </div>

                  <div className="p-save-bar" style={{ marginTop: 24 }}>
                    <button className="p-btn" onClick={handleSavePrefs} disabled={savingPrefs}>
                      {savingPrefs ? "Saving…" : "Save preferences"}
                    </button>
                    {prefsSaved && <span className="p-save-state">✓ Saved</span>}
                    {prefsError && <span className="p-save-state p-save-state--error">✗ {prefsError}</span>}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ─── EMAIL: test delivery ─── */}
          {tab === "email" && (
            <section className="p-settings-card p-anim-fade-up" key="email">
              <h3>Email delivery</h3>
              <p>
                Verify the alert pipeline by sending a real test email to your inbox. This uses the same
                provider as automated alert emails.
              </p>

              <div className="p-field" style={{ marginTop: 12 }}>
                <span className="p-label">Delivery address</span>
                <span className="p-input" style={{ color: "var(--text)", background: "var(--p-surface-2)", display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 13px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                  {user?.email || "your account email"}
                </span>
                <span className="p-hint">The email is sent to your verified account address.</span>
              </div>

              <div className="p-save-bar">
                <button className="p-btn p-btn--ghost" onClick={handleSendTestEmail} disabled={testState === "sending"}>
                  {testState === "sending" ? "Sending…" : "Send test email"}
                </button>
                {testState === "done" && testResult && (
                  <span className="p-save-state">
                    ✓ Sent{testResult.provider_message_id ? ` (${testResult.provider_message_id.slice(0, 8)}…)` : ""}
                  </span>
                )}
                {testState === "error" && testResult && (
                  <span className="p-save-state p-save-state--error" title={testResult.detail || ""}>
                    ✗ Failed{testResult.error_category ? ` · ${testResult.error_category}` : ""}:{" "}
                    {testResult.detail || "Email not sent"}
                  </span>
                )}
              </div>
              {testResult?.sender_warning && (
                <p className="p-hint" style={{ marginTop: 12, color: "var(--amber)", fontWeight: 600 }}>
                  ⚠ {testResult.sender_warning}
                </p>
              )}
            </section>
          )}

          {/* ─── BILLING ─── */}
          {tab === "billing" && (
            <section className="p-settings-card p-anim-fade-up" key="billing">
              <h3>Plan & Billing</h3>
              <p>Your current plan, API monitoring limit, and billing status.</p>

              {!billing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", padding: "12px 0" }}>
                  <Spinner /> Loading billing…
                </div>
              ) : (
                <>
                  <div className="p-grid-4" style={{ marginTop: 8 }}>
                    <div className="p-stat-card p-stat-card--accent" style={{ padding: 16 }}>
                      <p className="p-stat-label">Current plan</p>
                      <p className="p-stat-value" style={{ fontSize: 20 }}>
                        <Badge tone={planTone} dot>
                          {(billing.plan || "Trial").charAt(0).toUpperCase() + (billing.plan || "Trial").slice(1)}
                        </Badge>
                      </p>
                    </div>
                    <div className="p-stat-card p-stat-card--green" style={{ padding: 16 }}>
                      <p className="p-stat-label">API monitoring limit</p>
                      <p className="p-stat-value" style={{ fontSize: 20 }}>
                        {billing.monitored_api_limit === -1 ? "Unlimited" : `${billing.monitored_api_count || 0} / ${billing.monitored_api_limit}`}
                      </p>
                      {planPct !== null && (
                        <div style={{ marginTop: 8 }}>
                          <Progress value={billing.monitored_api_count || 0} max={billing.monitored_api_limit} tone={planPct >= 80 ? "amber" : "green"} />
                        </div>
                      )}
                    </div>
                    <div className="p-stat-card p-stat-card--gray" style={{ padding: 16 }}>
                      <p className="p-stat-label">Status</p>
                      <p className="p-stat-value" style={{ fontSize: 20 }}>
                        {billing.plan_status === "active" ? "Active" : billing.plan_status === "past_due" ? "Past due" : billing.plan_status === "canceled" ? "Canceled" : "Trial"}
                      </p>
                    </div>
                    {billing.current_period_end && (
                      <div className="p-stat-card p-stat-card--gray" style={{ padding: 16 }}>
                        <p className="p-stat-label">Period ends</p>
                        <p className="p-stat-value" style={{ fontSize: 20 }}>{formatDate(billing.current_period_end)}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-row-cols" style={{ marginTop: 22 }}>
                    <button className="p-btn" onClick={() => router.push("/dashboard/billing")}>
                      Manage in Billing Portal
                    </button>
                    <Link href="/pricing" className="p-btn p-btn--ghost">
                      View plans
                    </Link>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ─── DANGER ZONE ─── */}
          {tab === "danger" && (
            <section className="p-settings-card p-anim-fade-up" key="danger" style={{ borderColor: "var(--red-bg, #fee2e2)" }}>
              <h3 style={{ color: "var(--red, #b91c1c)" }}>Session</h3>
              <p>
                Signing out clears the session token in this browser. It does not delete your account,
                repositories, alerts or billing record, and it does not revoke Breaklytix&apos;s GitHub
                authorization. To revoke that authorization, use GitHub → Settings → Applications.
              </p>

              <div className="p-row-cols">
                <button
                  className="p-btn p-btn--ghost"
                  style={{ borderColor: "var(--red)", color: "var(--red)" }}
                  onClick={() => setShowDisconnectConfirm(true)}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Signing out…" : "Sign out of this browser"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Sign-out confirm dialog (preserved behavior) */}
      {showDisconnectConfirm && (
        <div className="confirm-dialog" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
          <div className="confirm-content">
            <h3 id="confirm-title">Sign out of this browser?</h3>
            <p id="confirm-desc" className="muted" style={{ marginTop: 8 }}>This will:</p>
            <ul style={{ marginTop: 12, paddingLeft: 20, color: "var(--text)" }}>
              <li>Clear the session token stored in this browser</li>
              <li>Stop showing your dashboard until you sign in again</li>
              <li>Leave your account, repositories, alerts and billing record intact</li>
            </ul>
            <p className="muted small" style={{ marginTop: 16 }}>
              To revoke Breaklytix&apos;s GitHub authorization, use GitHub → Settings → Applications.
              You can sign in again at any time.
            </p>
            <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setShowDisconnectConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? <><Spinner /> Signing out…</> : "Yes, sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}