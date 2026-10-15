"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertWithRepo, listAllAlerts, markAlertsRead, updateAlertStatus } from "@/lib/api";
import RepositorySelector from "@/components/RepositorySelector";

import { formatDate, SeverityBadge, Spinner } from "@/components/ui";
import { ErrorCard, PageHeader } from "@/components/dashboard-ui";

function normalizeAlerts(payload: unknown): AlertWithRepo[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const maybe = payload as { alerts?: unknown; items?: unknown; data?: unknown };
    if (Array.isArray(maybe.alerts)) return maybe.alerts as AlertWithRepo[];
    if (Array.isArray(maybe.items)) return maybe.items as AlertWithRepo[];
    if (Array.isArray(maybe.data)) return maybe.data as AlertWithRepo[];
  }
  return [];
}

function isOpenStatus(status?: string | null) {
  const s = (status || "open").toLowerCase();
  return s !== "resolved" && s !== "ignored";
}

function AlertsPage() {
  const searchParams = useSearchParams();
  const repositoryId = searchParams.get("repository_id") ?? "";
  const [alerts, setAlerts] = useState<AlertWithRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const markedIds = useRef<Set<string>>(new Set());

  const isRead = (a: AlertWithRepo) => !!a.read_at;

  const setStatus = async (id: string, status: "resolved" | "ignored") => {
    setBusyId(id);
    try {
      await updateAlertStatus(id, status);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update alert");
    } finally {
      setBusyId(null);
    }
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      const a = await listAllAlerts(repositoryId || undefined);
      setAlerts(normalizeAlerts(a));
    } catch (e: unknown) {
      setAlerts([]);
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    }
  }, [repositoryId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!alerts || alerts.length === 0) return;
    const unread = alerts
      .filter((a) => !isRead(a) && !markedIds.current.has(a.id))
      .map((a) => a.id);
    if (unread.length === 0) return;
    unread.forEach((id) => markedIds.current.add(id));
    let cancelled = false;
    markAlertsRead(unread)
      .then(() => {
        if (cancelled) return;
        const stamped = new Date().toISOString();
        setAlerts((prev) =>
          (prev ?? []).map((a) =>
            unread.includes(a.id) && !a.read_at ? { ...a, read_at: stamped } : a
          )
        );
        window.dispatchEvent(new CustomEvent("breaklytix:alerts-read"));
      })
      .catch(() => {
        unread.forEach((id) => markedIds.current.delete(id));
      });
    return () => { cancelled = true; };
  }, [alerts]);

  const filtered = (alerts ?? []).filter(
    (a) =>
      (severityFilter === "all" || a.severity === severityFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "open" ? isOpenStatus(a.status) : a.status === statusFilter))
  );

  return (
    <div className="p-page">
      <PageHeader
        title="Alerts"
        subtitle={
          repositoryId
            ? "Breaking changes matched to the selected repository, sorted by severity."
            : "Breaking changes matched to your code across all monitored repos, sorted by severity."
        }
      />

      {error && <ErrorCard title="Could not load alerts" body={error} retry={load} />}

      <section className="card alert-board">
        <div className="p-toolbar alert-board-toolbar">
          <div className="p-filters">
            <div className="p-filter-group">
              <label className="muted small" htmlFor="sevFilter">Severity</label>
              <select
                id="sevFilter"
                className="input"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="p-filter-group">
              <RepositorySelector allowAll />
            </div>
            <div className="p-filter-group">
              <label className="muted small" htmlFor="statusFilter">Status</label>
              <select
                id="statusFilter"
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          {alerts !== null && (
            <p className="muted small alert-board-count">
              {filtered.length} of {alerts.length} alert{alerts.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {alerts === null ? (
          <div className="alert-board-loading"><Spinner /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {alerts.length === 0 ? "No alerts yet. You're all clear. 🎉" : "No alerts match the current filters."}
          </div>
        ) : (
          <ul className="alert-list">
            {filtered.map((a) => (
              <li key={a.id} className={`alert-card${isRead(a) ? " is-read" : ""}`}>
                <div className="alert-card-top">
                  <div className="alert-card-flags">
                    <SeverityBadge severity={a.severity} reason={a.severity_reason} />
                    <span className="pill pill-amber">
                      {(a.change_type || "change").replace(/_/g, " ")}
                    </span>
                    {a.email_sent ? (
                      <span className="pill pill-green">Email sent</span>
                    ) : (
                      <span className="pill pill-gray">Email pending</span>
                    )}
                  </div>
                  <time className="muted small alert-card-date" dateTime={a.created_at || undefined}>
                    {formatDate(a.created_at)}
                  </time>
                </div>

                <h2 className="alert-card-title">
                  {a.description || a.severity_reason || "Alert"}
                </h2>
                {a.severity_reason && a.severity_reason !== a.description && (
                  <p className="alert-card-reason">{a.severity_reason}</p>
                )}

                <div className="alert-card-meta">
                  {a.repo_id ? (
                    <Link className="alert-card-repo" href={`/dashboard/repos/${a.repo_id}`}>
                      {a.repo_name}
                    </Link>
                  ) : (
                    <span className="alert-card-repo">{a.repo_name}</span>
                  )}
                  {a.file_path && (
                    <code className="alert-card-loc">
                      {a.file_path}
                      {a.line_number ? `:${a.line_number}` : ""}
                    </code>
                  )}
                  {a.source_url && (
                    <a className="small" href={a.source_url} target="_blank" rel="noreferrer">
                      Changelog →
                    </a>
                  )}
                </div>

                <div className="alert-card-actions">
                  {a.status === "resolved" || a.status === "ignored" ? (
                    <span className="pill pill-gray" style={{ textTransform: "capitalize" }}>{a.status}</span>
                  ) : (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === a.id}
                        onClick={() => setStatus(a.id, "resolved")}
                      >
                        Resolve
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === a.id}
                        onClick={() => setStatus(a.id, "ignored")}
                      >
                        Ignore
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div />}><AlertsPage /></Suspense>;
}
