"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState, Suspense} from "react";
import { useSearchParams } from "next/navigation";
import RepositorySelector from "../../../../components/RepositorySelector";
import { getHealthFailures, HealthIssue, updateHealthIssueStatus } from "../../../../lib/api";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#84cc16",
  info: "#6b7280",
};

function FailuresPage() {
  const searchParams = useSearchParams();
  const repositoryId = searchParams.get("repository_id") ?? "";
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [summary, setSummary] = useState<{ total: number; customer_code: number; provider_incident: number; other: number }>({
    total: 0,
    customer_code: 0,
    provider_incident: 0,
    other: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getHealthFailures(500, repositoryId || undefined)
      .then((res) => {
        setIssues(Array.isArray(res.failures) ? res.failures : []);
        setSummary({ total: res.total, customer_code: res.customer_code, provider_incident: res.provider_incident, other: res.other || 0 });
      })
      .catch(() => {
        setIssues([]);
        setSummary({ total: 0, customer_code: 0, provider_incident: 0, other: 0 });
      })
      .finally(() => setLoading(false));
  }, [repositoryId]);

  useEffect(load, [load]);

  const failures = useMemo(
    () => issues.filter((i) => ["customer_code", "customer_usage", "configuration", "provider_incident"].includes(i.category)),
    [issues]
  );

  const resolve = async (id: string) => {
    setBusy(id);
    try {
      await updateHealthIssueStatus(id, "resolved");
      load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="loading">Loading failures…</div>;

  return (
    <div>
      <h1>Runtime &amp; Usage Intelligence · Failures</h1>
      <p className="subtitle">Code-side failures and provider incidents — scoped to the selected repository</p>
      <div style={{ margin: "12px 0" }}>
        <RepositorySelector allowAll />
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -8 }}>
        {summary.total} open failure{summary.total !== 1 ? "s" : ""} · {summary.customer_code} code-side · {summary.provider_incident} provider · {summary.other} config/usage
      </p>

      {failures.length === 0 ? (
        <div className="empty-state">
          <p>No failures recorded for this repository.</p>
        </div>
      ) : (
        <div className="issues-list">
          {failures.map((issue) => (
            <div key={issue.id} className="issue-card">
              <div className="issue-header">
                <span style={{ color: SEVERITY_COLOR[issue.severity] || "#6b7280", fontWeight: 700 }}>
                  {issue.severity.toUpperCase()}
                </span>
                <span className="issue-category">{issue.category}</span>
                <span className="issue-provider">{issue.provider}</span>
                {issue.repo_full_name && (
                  <span className="issue-provider" style={{ opacity: 0.7 }}>{issue.repo_full_name}</span>
                )}
              </div>
              <h3 className="issue-title">{issue.title}</h3>
              <p className="issue-description">{issue.description}</p>
              {issue.file && (
                <p className="issue-location">
                  File: {issue.file}
                  {issue.line ? `:${issue.line}` : ""}
                </p>
              )}
              {issue.recommended_action && <p className="issue-action">Recommended: {issue.recommended_action}</p>}
              <div className="issue-footer">
                <span className="issue-confidence">Confidence: {Math.round((issue.confidence || 0) * 100)}%</span>
                <span className="issue-source">Source: {issue.source}</span>
              </div>
              <div style={{ marginTop: 10 }}>
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
  return <Suspense fallback={<div />}><FailuresPage /></Suspense>;
}
