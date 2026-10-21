"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { clearSession, ensureSession, getToken, getUser } from "../../lib/auth";
import { getConsentStatus, listAllAlerts } from "../../lib/api";
import { Badge, severityLabel, severityTone, timeAgo, ToastHost } from "../../components/dashboard-ui";
import {
  applyTheme,
  getStoredTheme,
  initTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  ThemeGlyph,
  ThemePref,
} from "../../lib/theme";
import { LogoMark } from "../../components/Logo";

type NavItem = {
  name: string;
  href: string;
  icon: () => ReactNode;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const Icon = (svg: ReactNode) => () => svg;

// ─────────────────────────── Navigation (unchanged hrefs) ───────────────────────────
const RUNTIME_INTELLIGENCE: NavItem[] = [
  { name: "API Errors", href: "/dashboard/health/errors", icon: Icon(<ErrorsIconSVG />) },
  { name: "Failures", href: "/dashboard/health/failures", icon: Icon(<FailuresIconSVG />) },
  { name: "Rate Limit Events", href: "/dashboard/health/rate-limit-events", icon: Icon(<RateLimitEventsIconSVG />) },
  { name: "Provider Incidents", href: "/dashboard/health/incidents", icon: Icon(<IncidentsIconSVG />) },
  { name: "Anomalies", href: "/dashboard/health/anomalies", icon: Icon(<AnomaliesIconSVG />) },
];

const CODE_BREAK_DETECTION: NavItem[] = [
  { name: "Repository Scanner", href: "/dashboard/health/scanner", icon: Icon(<ScannerIconSVG />) },
  { name: "API Usage in Code", href: "/dashboard/health/code-usage", icon: Icon(<CodeUsageIconSVG />) },
  { name: "SDK / Library Checker", href: "/dashboard/health/sdk", icon: Icon(<SdkIconSVG />) },
  { name: "Deprecated APIs", href: "/dashboard/health/deprecated", icon: Icon(<DeprecatedIconSVG />) },
  { name: "Potential Breaks", href: "/dashboard/health/breaks", icon: Icon(<BreaksIconSVG />) },
  { name: "Auto-Fix PRs", href: "/dashboard/health/auto-fix", icon: Icon(<FixesIconSVG />) },
];

const IMPACT_ENGINE: NavItem[] = [
  { name: "API Digital Twin", href: "/dashboard/digital-twin", icon: Icon(<ImpactIconSVG />) },
  { name: "Impact Overview", href: "/dashboard/impact", icon: Icon(<ImpactIconSVG />) },
  { name: "Fire Drill", href: "/dashboard/impact/fire-drill", icon: Icon(<FireDrillIconSVG />) },
];

// The three expandable core sections (collapsed by default; single source of truth for labels).
const CORE_SECTIONS: NavSection[] = [
  { label: "Runtime Intelligence", items: RUNTIME_INTELLIGENCE },
  { label: "Code Break Detection", items: CODE_BREAK_DETECTION },
  { label: "Impact Engine", items: IMPACT_ENGINE },
];

// Persisted sidebar accordion state (per section label → collapsed boolean).
const NAV_STORAGE_KEY = "autofix:sidebar:collapsed";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    "Runtime Intelligence": true,
    "Code Break Detection": true,
    "Impact Engine": true,
  });
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<{ id: string; change_type: string; repo_name: string; severity: string; created_at?: string | null }[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Theme: mirror lib/theme.ts state into React so controls reflect it.
  useEffect(() => {
    const pref = initTheme();
    setThemePref(pref);
    setResolvedTheme(resolveTheme(pref));
    const unsub = watchSystemTheme(pref);
    return unsub;
  }, []);

  const handleThemeChange = (pref: ThemePref) => {
    setThemePref(pref);
    setResolvedTheme(setTheme(pref));
  };

  useEffect(() => {
    let cancelled = false;
    // No session -> the login page is the gate (never auto-create demo here).
    if (!getToken()) {
      router.replace("/login");
      return () => { cancelled = true; };
    }
    setMounted(true);
    getConsentStatus()
      .then((user) => {
        if (!cancelled && user.consent_required) {
          router.replace("/legal-acceptance");
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [router]);

  // Close the mobile drawer whenever the route changes so the overlay
  // cannot sit on top of Alerts / API Errors after a nav tap.
  useEffect(() => {
    setSidebarOpen(false);
    setBellOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Real alerts for the notification bell (no fake counts).
  // The badge counts UNREAD open alerts only (server-backed read_at);
  // opening the Alerts page marks them read and this count refreshes on
  // every dashboard navigation.
  useEffect(() => {
    if (!getToken()) return;
    listAllAlerts()
      .then((alerts) => {
        const unreadOpen = alerts.filter(
          (a) => !a.is_test && !a.read_at && a.status !== "resolved" && a.status !== "ignored"
        );
        setAlertCount(unreadOpen.length);
        setRecent(unreadOpen.slice(0, 5).map((a) => ({
          id: a.id,
          change_type: a.change_type,
          repo_name: a.repo_name,
          severity: a.severity,
          created_at: a.created_at,
        })));
      })
      .catch(() => {});

    // The Alerts page marks alerts read server-side; it dispatches this
    // window event so the unread badge recomputes immediately (no fake 0).
    const onAlertsRead = () => {
      listAllAlerts()
        .then((alerts) => {
          const unreadOpen = alerts.filter(
            (a) => !a.is_test && !a.read_at && a.status !== "resolved" && a.status !== "ignored"
          );
          setAlertCount(unreadOpen.length);
        })
        .catch(() => {});
    };
    window.addEventListener("breaklytix:alerts-read", onAlertsRead);
    return () => window.removeEventListener("breaklytix:alerts-read", onAlertsRead);
  }, [pathname]);

  // Restore the user's expanded/collapsed sidebar state after first paint
  // (avoids hydration mismatch; defaults stay collapsed on a fresh visit).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, boolean>;
        setCollapsed((c) => ({ ...c, ...stored }));
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
  }, []);

  const persistCollapsed = (next: Record<string, boolean>) => {
    try {
      localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota/private-mode errors */
    }
  };

  // Auto-expand the core section whose child route is active (mount + route change).
  useEffect(() => {
    if (!mounted) return;
    const activeSection = CORE_SECTIONS.find((section) =>
      section.items.some((item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)))
    );
    if (activeSection) {
      setCollapsed((c) => {
        const next = { ...c, [activeSection.label]: false };
        persistCollapsed(next);
        return next;
      });
    }
  }, [pathname, mounted]);

  // Close popovers on outside click / Escape.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setBellOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggleSection = (label: string) =>
    setCollapsed((c) => {
      const next = { ...c, [label]: !c[label] };
      persistCollapsed(next);
      return next;
    });

  if (!mounted) {
    return (
      <div className="dashboard-shell">
        <aside className="sidebar" />
        <div className="dashboard-main">
          <header className="dashboard-header">
            <div className="dashboard-header-inner">
              <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              </button>
              <Link href="/dashboard" className="brand"><LogoMark size={26} withWordmark /></Link>
            </div>
          </header>
          <main className="dashboard-content">
            <div className="dashboard-container">{children}</div>
          </main>
        </div>
      </div>
    );
  }

  const user = getUser();

  const flatItems: NavItem[] = [
    { name: "Overview", href: "/dashboard", icon: Icon(<OverviewIconSVG />) },
    { name: "Repositories", href: "/dashboard/repos", icon: Icon(<ReposIconSVG />) },
    { name: "Alerts", href: "/dashboard/alerts", icon: Icon(<AlertsIconSVG />) },
    { name: "Provider Changes", href: "/dashboard/changelog", icon: Icon(<ChangelogIconSVG />) },
    { name: "Monitoring Matrix", href: "/dashboard/providers", icon: Icon(<ChangelogIconSVG />) },
    { name: "Developer CLI", href: "/dashboard/cli", icon: Icon(<CliIconSVG />) },
    { name: "Billing", href: "/dashboard/billing", icon: Icon(<BillingIconSVG />) },
    { name: "Integrations", href: "/dashboard/settings/integrations", icon: Icon(<SlackIconSVG />) },
    { name: "API Keys", href: "/dashboard/settings/api-keys", icon: Icon(<ApiKeyIconSVG />) },
    { name: "Agency", href: "/dashboard/agency", icon: Icon(<AgencyIconSVG />) },
    { name: "Settings", href: "/dashboard/settings", icon: Icon(<SettingsIconSVG />) },
    ...(user?.is_admin ? [{ name: "Admin", href: "/admin", icon: Icon(<AdminIconSVG />) }] : []),
  ];

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  const withRepositoryContext = (href: string) => {
    const repositoryId = searchParams.get("repository_id");
    if (!repositoryId || href.startsWith("/dashboard/providers")) return href;
    const params = new URLSearchParams({ repository_id: repositoryId });
    return `${href}?${params.toString()}`;
  };

  const shellTheme = minimized ? "p-sidebar-collapsed" : "";

  return (
    <div className={`dashboard-shell ${shellTheme}`}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <aside className={`sidebar p-sidebar ${sidebarOpen ? "open" : ""}`} role="navigation" aria-label="Main navigation">
        <div className="sidebar-header">
          <Link href="/dashboard" className="brand"><LogoMark size={26} withWordmark /></Link>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {CORE_SECTIONS.map((section) => {
            const isCollapsed = !!collapsed[section.label];
            return (
              <div key={section.label} className="sidebar-section sidebar-section-core">
                <button
                  className={`sidebar-section-toggle p-sb-toggle`}
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={!isCollapsed}
                  title={minimized ? section.label : undefined}
                >
                  <span className="sidebar-section-label p-sb-text">{section.label}</span>
                  <svg className={`sidebar-chevron ${isCollapsed ? "collapsed" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className={`p-sb-children ${isCollapsed ? "p-sb-children--closed" : ""}`}>
                  <ul role="list" aria-hidden={isCollapsed || undefined}>
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <li key={item.name}>
                          <Link
                            href={withRepositoryContext(item.href)}
                            className={`sidebar-link p-sb-item ${active ? "active p-sb-item--active" : ""}`}
                            aria-current={active ? "page" : undefined}
                            title={minimized ? item.name : undefined}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <span className="p-sb-icon"><item.icon /></span>
                            <span className="p-sb-text">{item.name}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}

          <p className="p-sb-label p-sb-text">General</p>
          <ul role="list" className="sidebar-flat">
            {flatItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`sidebar-link p-sb-item ${active ? "active p-sb-item--active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={minimized ? item.name : undefined}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="p-sb-icon"><item.icon /></span>
                    <span className="p-sb-text">{item.name}</span>
                    {item.name === "Alerts" && alertCount !== null && alertCount > 0 && (
                      <span className="p-count-bubble p-sb-badge" title={`${alertCount} alerts`}>{alertCount > 99 ? "99+" : alertCount}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.github_login?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="user-details p-sb-text">
              <p className="user-name">{user?.github_login || "User"}</p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <button className="btn btn-secondary btn-block p-btn p-btn--ghost sidebar-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className={`dashboard-header p-header`}>
          <div className="dashboard-header-inner">
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            <Link href="/dashboard" className="brand"><LogoMark size={26} withWordmark /></Link>

            <div className="header-actions p-header-actions">
              <button
                className="p-icon-btn p-theme-toggle"
                onClick={() => handleThemeChange(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme (or keep system in settings)"}
                title={themePref === "system" && resolvedTheme === "light" ? "Theme: system (light) — click for dark" : themePref === "system" ? "Theme: system (dark) — click for light" : resolvedTheme === "dark" ? "Theme: dark — click for light" : "Theme: light — click for dark"}
              >
                <ThemeGlyph dark={resolvedTheme === "dark"} />
              </button>

              <button
                className="p-icon-btn p-mini-toggle"
                onClick={() => setMinimized((m) => !m)}
                aria-label={minimized ? "Expand sidebar" : "Collapse sidebar"}
                title={minimized ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {minimized
                    ? <><path d="M3 6h18" /><path d="M3 12h12" /><path d="M3 18h18" /></>
                    : <><path d="M3 6h18" /><path d="M8 12h13" /><path d="M3 18h18" /></>}
                </svg>
              </button>

              <div style={{ position: "relative" }} ref={bellRef}>
                <button className="p-icon-btn" onClick={() => setBellOpen((o) => !o)} aria-label="Recent alerts" aria-expanded={bellOpen}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {alertCount !== null && alertCount > 0 && <span className="p-bell-badge">{alertCount > 99 ? "99+" : alertCount}</span>}
                </button>
                {bellOpen && (
                  <div className="p-dropdown" role="dialog" aria-label="Recent alerts">
                    <div className="p-dropdown-header">
                      <p className="p-dropdown-title">Recent alerts</p>
                      <p className="p-dropdown-sub">
                        {alertCount !== null ? `${alertCount} open alert${alertCount !== 1 ? "s" : ""} from monitored APIs` : "Loading alerts…"}
                      </p>
                    </div>
                    <div className="p-dropdown-body">
                      {recent.length === 0 ? (
                        <div style={{ padding: "18px 16px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                          {alertCount === null ? "Loading…" : "No open alerts — all clear ✨"}
                        </div>
                      ) : (
                        recent.map((a) => (
                          <Link key={a.id} href="/dashboard/alerts" className="p-dropdown-item" onClick={() => setBellOpen(false)}>
                            <span style={{ marginTop: 2 }}><Badge tone={severityTone(a.severity)} dot>{severityLabel(a.severity)}</Badge></span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.change_type}</span>
                              <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{a.repo_name} · {timeAgo(a.created_at)}</span>
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                    <div className="p-dropdown-footer">
                      <Link href="/dashboard/alerts" onClick={() => setBellOpen(false)}>View all alerts</Link>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ position: "relative" }} ref={menuRef}>
                <button className="p-avatar-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Account menu">
                  <span className="p-avatar">
                    {user?.github_login?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                  <span>{user?.github_login || "Account"}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--muted)" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="p-menu" role="menu" aria-label="Account">
                    <div className="p-menu-user">
                      <p style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{user?.github_login || "Account"}</p>
                      <p className="p-menu-mail">{user?.email}</p>
                    </div>
                    <div className="p-menu-sep" />
                    <Link href="/dashboard/settings" className="p-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                      Profile & settings
                    </Link>
                    <Link href="/dashboard/billing" className="p-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                      Billing & plan
                    </Link>
                    <Link href="/docs" className="p-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                      Help & Docs
                    </Link>
                    <div className="p-menu-sep" />
                    <div className="p-menu-label">Theme</div>
                    {(["light", "dark", "system"] as ThemePref[]).map((p) => (
                      <button
                        key={p}
                        className="p-menu-item"
                        role="menuitemradio"
                        aria-checked={themePref === p}
                        onClick={() => handleThemeChange(p)}
                        style={{ justifyContent: "space-between" }}
                      >
                        <span style={{ textTransform: "capitalize" }}>{p}</span>
                        {themePref === p && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--accent)" }} aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                      </button>
                    ))}
                    <div className="p-menu-sep" />
                    <button className="p-menu-item p-menu-item--danger" role="menuitem" onClick={handleSignOut}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="dashboard-content">
          <div className="dashboard-container">{children}</div>
        </main>
      </div>

      <ToastHost />
    </div>
  );

  function handleSignOut() {
    clearSession();
    window.location.href = "/login";
  }
}

// ─────────────────────────── Icons (unchanged) ───────────────────────────
function svg20(paths: ReactNode) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {paths}
    </svg>
  );
}

function OverviewIconSVG() {
  return svg20(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>);
}
function AlertsIconSVG() {
  return svg20(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>);
}
function ReposIconSVG() {
  return svg20(<><path d="M3 6a3 3 0 0 1 3-3h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a2 2 0 0 0-2 2" /><path d="M3 6v14a2 2 0 0 0 2 2h13" /><path d="M8 7h8" /><path d="M8 11h5" /></>);
}
function ErrorsIconSVG() {
  return svg20(<><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>);
}
function FailuresIconSVG() {
  return svg20(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>);
}
function RateLimitEventsIconSVG() {
  return svg20(<><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></>);
}
function IncidentsIconSVG() {
  return svg20(<><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);
}
function AnomaliesIconSVG() {
  return svg20(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3" /></>);
}
function ScannerIconSVG() {
  return svg20(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><line x1="12" y1="22" x2="12" y2="12" /><path d="M8 12l4-4 4 4" /></>);
}
function CodeUsageIconSVG() {
  return svg20(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>);
}
function SdkIconSVG() {
  return svg20(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /><path d="M9 12h6" /><path d="M12 9v6" /></>);
}
function DeprecatedIconSVG() {
  return svg20(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>);
}
function BreaksIconSVG() {
  return svg20(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9.5 12l2 2 4-4" /></>);
}
function FixesIconSVG() {
  return svg20(<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>);
}
function CliIconSVG() {
  return svg20(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>);
}
function BillingIconSVG() {
  return svg20(<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="14" x2="6.01" y2="14" /><line x1="10" y1="14" x2="10.01" y2="14" /><line x1="14" y1="14" x2="14.01" y2="14" /><line x1="18" y1="14" x2="18.01" y2="14" /></>);
}
function SlackIconSVG() {
  return svg20(<><path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z" /><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5-1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z" /><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z" /><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z" /><path d="M14 20.5c0-.83.67-1.5 1.5-1.5.83 0 1.5-.67 1.5-1.5z" /></>);
}
function ApiKeyIconSVG() {
  return svg20(<><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></>);
}
function AgencyIconSVG() {
  return svg20(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
}
function SettingsIconSVG() {
  return svg20(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>);
}
function AdminIconSVG() {
  return svg20(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>);
}
function ChangelogIconSVG() {
  return svg20(<><path d="M4 4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>);
}
function ImpactIconSVG() {
  return svg20(<><path d="M3 12h4l3-9 4 18 3-9h4" /></>);
}
function FireDrillIconSVG() {
  return svg20(<><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M12 8v4" /><path d="M12 16h.01" /></>);
}
