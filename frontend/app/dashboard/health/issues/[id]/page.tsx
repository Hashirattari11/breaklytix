"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../../lib/api";

interface Issue {
  id: string;
  provider: string;
  repo_id: string;
  category: string;
  severity: string;
  status: string;
  confidence: number | null;
  title: string;
  description: string;
  evidence: string | null;
  file: string | null;
  line: number | null;
  source: string;
  recommended_action: string | null;
  auto_fix_available: boolean;
  auto_fix_rule_id: string | null;
  what_happened: string | null;
  why_it_matters: string | null;
  what_to_do: string | null;
  created_at: string | null;
  resolved_at: string | null;
  risk_level?: string;
  risk_score?: number;
  risk_factors?: string[];
  repo_full_name?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#84cc16",
  info: "#6b7280",
};

const STATUSES = ["open", "acknowledged", "in_progress", "resolved", "ignored"];

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const issueId = String(params.id);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [repoName, setRepoName] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [prCreating, setPrCreating] = useState(false);
  const [prMessage, setPrMessage] = useState("");

  useEffect(() => {
    apiFetch(`/health/issues/${issueId}`)
      .then((res: any) => {
        setIssue(res.issue);
        setRepoName(res.repo?.full_name || "");
      })
      .catch(() => setIssue(null))
      .finally(() => setLoading(false));
  }, [issueId]);

  if (loading) return <div className="loading">Loading issue...</div>;
  if (!issue) return <div className="error-state">Issue not found.</div>;

  const setStatus = async (status: string) => {
    setUpdating(true);
    try {
      const updated = await apiFetch(`/health/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setIssue(updated as Issue);
      setPrMessage("");
    } catch (e: any) {
      setPrMessage(`Failed to update: ${String(e)}`);
    } finally {
      setUpdating(false);
    }
  };

  const createFixPr = async () => {
    setPrCreating(true);
    setPrMessage("");
    try {
      // Queue a deterministic fix through the existing review-before-apply flow.
      const res: any = await apiFetch(`/health/issues/${issue.id}/fix`, {
        method: "POST",
      });
      setPrMessage(`${res.message} (Fix ${res.fix_id?.slice(0, 8) || ""})`);
      setIssue({ ...issue, status: "in_progress" });
    } catch (e: any) {
      setPrMessage(`Failed to create fix: ${String(e)}`);
    } finally {
      setPrCreating(false);
    }
  };

  return (
    <div className="issue-detail-page">
      <div className="breadcrumb">
        <Link href="/dashboard/health">API Health</Link> /{" "}
        <Link href="/dashboard/health/issues">Issues</Link> / {issue.id.slice(0, 8)}
      </div>

      <div className="issue-header" style={{ borderLeftColor: SEVERITY_COLOR[issue.severity] || "#6b7280" }}>
        <div className="issue-meta">
          <span className="issue-severity" style={{ color: SEVERITY_COLOR[issue.severity] || "#6b7280" }}>
            {issue.severity.toUpperCase()}
          </span>
          {issue.risk_level && (
            <span
              className={`issue-risk risk-${issue.risk_level}`}
              title={issue.risk_factors?.join(", ") || "Explainable risk score"}
            >
              Risk {issue.risk_level}
              {typeof issue.risk_score === "number" ? ` · ${issue.risk_score}` : ""}
            </span>
          )}
          <span className="issue-category">{issue.category}</span>
          <span className="issue-provider">{issue.provider}</span>
                {issue.repo_full_name && (
                  <span className="issue-provider" style={{ opacity: 0.7 }}>{issue.repo_full_name}</span>
                )}
          <span className={`status-pill status-${issue.status}`}>{issue.status}</span>
        </div>
        <h1>{issue.title}</h1>
        <p className="repo-line">Repository: {repoName}</p>
        <div className="issue-facts">
          {issue.file && (
            <p>
              File: <code>{issue.file}</code>
              {issue.line ? `:${issue.line}` : ""}
            </p>
          )}
          {issue.confidence != null && <p>Confidence: {(issue.confidence * 100).toFixed(0)}%</p>}
          <p>Source: {issue.source}</p>
          <p>Created: {issue.created_at ? new Date(issue.created_at).toLocaleString() : "—"}</p>
        </div>
      </div>

      {(issue.what_happened || issue.description) && (
        <section>
          <h2>What happened?</h2>
          <p>{issue.what_happened || issue.description}</p>
        </section>
      )}
      {issue.why_it_matters && (
        <section>
          <h2>Why it matters</h2>
          <p>{issue.why_it_matters}</p>
        </section>
      )}
      {issue.recommended_action && (
        <section>
          <h2>Recommended action</h2>
          <p>{issue.recommended_action}</p>
        </section>
      )}
      {issue.what_to_do && (
        <section>
          <h2>What to do</h2>
          <p>{issue.what_to_do}</p>
        </section>
      )}

      {issue.evidence && (
        <section>
          <h2>View technical details</h2>
          <pre className="evidence-block">{issue.evidence}</pre>
        </section>
      )}

      <section>
        <h2>Actions</h2>
        <div className="issue-actions">
          {issue.auto_fix_available && (
            <button className="btn btn-primary" onClick={createFixPr} disabled={prCreating || updating}>
              {prCreating ? "Creating PR..." : "Create GitHub PR (Auto-fix)"}
            </button>
          )}
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`btn btn-secondary ${s === issue.status ? "btn-active" : ""}`}
              onClick={() => setStatus(s)}
              disabled={updating || s === issue.status}
            >
              {s === issue.status ? `Status: ${s}` : `Mark ${s}`}
            </button>
          ))}
        </div>
        {prMessage && <p className="pr-message">{prMessage}</p>}
      </section>

      <div className="health-actions">
        <Link href="/dashboard/health/issues" className="btn btn-secondary">
          Back to Issues
        </Link>
      </div>
    </div>
  );
}