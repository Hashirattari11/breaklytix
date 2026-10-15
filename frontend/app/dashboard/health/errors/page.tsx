"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import RepositorySelector from "../../../../components/RepositorySelector";
import {
  createIssueFix,
  getHealthErrors,
  HealthIssue,
  updateHealthIssueStatus,
} from "../../../../lib/api";
import { ErrorCard, PageHeader } from "@/components/dashboard-ui";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#84cc16",
  info: "#6b7280",
};

function ErrorsPage() {
  const searchParams = useSearchParams();
  const repositoryId = searchParams.get("repository_id") ?? "";
  const [issues, setIssues] = useState<HealthIssue[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; critical: number; high: number }>({
    total: 0,
    critical: 0,
    high: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getHealthErrors(500, repositoryId || undefined)
      .then((res) => {
        const rows = Array.isArray(res.errors) ? res.errors : [];
        setIssues(rows);
        setSummary({
          total: typeof res.total === "number" ? res.total : rows.length,
          critical: typeof res.critical === "number" ? res.critical : rows.filter((i) => i.severity === "critical").length,
          high: typeof res.high === "number" ? res.high : rows.filter((i) => i.severity === "high").length,
        });
      })
      .catch((e: unknown) => {
        setIssues([]);
        setSummary({ total: 0, critical: 0, high: 0 });
        setError(e instanceof Error ? e.message : "Failed to load API errors");
      })
      .finally(() => setLoading(false));
  }, [repositoryId]);

  useEffect(load, [load]);

  const resolve = async (id: string) => {
    setBusy(id);
    try {
      await updateHealthIssueStatus(id, "resolved");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update issue");
    } finally {
      setBusy(null);
    }
  };

  const queueFix = async (id: string) => {
    setBusy(id);
    try {
      await createIssueFix(id);
      alert("Auto-fix queued — see Code Break Detection → Auto-Fix PRs to review/approve.");
    } catch (e: unknown) {
      alert(`Could not queue fix: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const errors = issues ?? [];

  return (
    <div className="p-page">
      <PageHeader
        title="API Errors"
        subtitle={
          repositoryId
            ? "High/critical reliability findings for the selected repository."
            : "High/critical reliability findings across all of your monitored repositories."
        }
      />

      {error && <ErrorCard title="Could not load API errors" body={error} retry={load} />}

      <div style={{ margin: "0 0 12px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <RepositorySelector allowAll />
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        {summary.total} open error{summary.total !== 1 ? "s" : ""} · {summary.critical} critical · {summary.high} high
      </p>

      {loading && issues === null ? (
        <div className="loading">Loading API errors…</div>
      ) : errors.length === 0 ? (
        <div className="empty-state">
          <p>
            {repositoryId
              ? "No high-severity API errors for this repository."
              : "No high-severity API errors across your repositories."}
          </p>
          <Link href="/dashboard/health/issues" className="btn btn-primary">
            View all issues
          </Link>
        </div>
      ) : (
        <div className="issues-list">
          {errors.map((issue) => (
            <div key={issue.id} className="issue-card">
              <div className="issue-header">
                <span style={{ color: SEVERITY_COLOR[issue.severity] || "#6b7280", fontWeight: 700 }}>
                  {(issue.severity || "unknown").toUpperCase()}
                </span>
                {issue.category && <span className="issue-category">{issue.category}</span>}
                {issue.provider && <span className="issue-provider">{issue.provider}</span>}
                {issue.repo_full_name && (
                  <span className="issue-provider" style={{ opacity: 0.7 }}>{issue.repo_full_name}</span>
                )}
                {issue.risk_level && (
                  <span className={`issue-risk risk-${issue.risk_level}`}>Risk {issue.risk_level}</span>
                )}
              </div>
              <h3 className="issue-title">
                <Link href={`/dashboard/health/issues/${issue.id}`}>{issue.title}</Link>
              </h3>
              <p className="issue-description">{issue.description}</p>
              {issue.file && (
                <p className="issue-location">
                  File: {issue.file}
                  {issue.line ? `:${issue.line}` : ""}
                </p>
              )}
              <div className="issue-footer">
                <span className="issue-confidence">Confidence: {Math.round((issue.confidence || 0) * 100)}%</span>
                {issue.source && <span className="issue-source">Source: {issue.source}</span>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Link href={`/dashboard/health/issues/${issue.id}`} className="btn btn-sm btn-secondary">
                  View details
                </Link>
                {issue.auto_fix_available && (
                  <button className="btn btn-sm btn-primary" disabled={busy === issue.id} onClick={() => queueFix(issue.id)}>
                    Queue fix
                  </button>
                )}
                <button className="btn btn-sm btn-secondary" disabled={busy === issue.id} onClick={() => resolve(issue.id)}>
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="loading">Loading API errors…</div>}><ErrorsPage /></Suspense>;
}
