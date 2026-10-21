"use client";

import { useEffect, useState } from "react";
import { ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { clearSession, getUser } from "../../lib/auth";
import { getPendingAlerts } from "../../lib/admin";
import { ToastHost } from "../../components/dashboard-ui";
import { LogoMark } from "../../components/Logo";

const nav = [
  { name: "Overview", href: "/admin", icon: AdminOverviewIcon },
  { name: "Alert Queue", href: "/admin/alerts/pending", icon: AdminQueueIcon },
  { name: "System Health", href: "/admin/health", icon: AdminHealthIcon },
  { name: "Users & Repos", href: "/admin/users", icon: AdminUsersIcon },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    getPendingAlerts()
      .then((res) => setPendingCount(res?.alerts?.length ?? null))
      .catch(() => {});
  }, []);

  if (!mounted) {
    return (
      <div className="dashboard-shell">
        <aside className="sidebar" />
        <div className="dashboard-main">
          <div className="container page" style={{ paddingTop: 80, textAlign: "center" }}>
            Checking access…
          </div>
        </div>
      </div>
    );
  }

  const user = getUser();

  return (
    <div className="dashboard-shell">
      <aside className="sidebar p-sidebar" role="navigation" aria-label="Admin navigation">
        <div className="sidebar-header">
          <Link href="/admin" className="brand">
            <LogoMark size={26} withWordmark /> Breaklytix Admin
          </Link>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          <ul role="list">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`sidebar-link p-sb-item ${active ? "active p-sb-item--active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={item.name}
                  >
                    <span className="p-sb-icon"><item.icon /></span>
                    <span className="p-sb-text">{item.name}</span>
                    {item.name === "Alert Queue" && pendingCount !== null && pendingCount > 0 && (
                      <span className="p-count-bubble p-sb-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>
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
              {user?.github_login?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="user-details">
              <p className="user-name">{user?.github_login || "Admin"}</p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <Link href="/dashboard" className="btn btn-secondary btn-block sidebar-signout">
            ← Back to dashboard
          </Link>
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 8 }}
            onClick={() => {
              clearSession();
              window.location.href = "/dashboard";
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-inner">
            <Link href="/admin" className="brand">
              <LogoMark size={26} withWordmark /> Breaklytix Admin
            </Link>
            <div className="header-actions">
              <span className="header-user">{user?.github_login || user?.email}</span>
            </div>
          </div>
        </header>
        <main className="dashboard-content">
          <div className="container">{children}</div>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}

function AdminOverviewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function AdminQueueIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function AdminHealthIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function AdminUsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
