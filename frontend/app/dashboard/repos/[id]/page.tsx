"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  CodeHealthIssue,
  DailyScanRun,
  DetectionsResponse,
  Fix,
  FixesListResponse,
  ProviderCoverageEntry,
  ScanSummary,
  SimulateBreakingChangeResult,
  getAlerts,
  getCodeHealthIssues,
  getDailyScanRuns,
  getDetections,
  getFixes,
  getProviderCoverage,
  getScanSummary,
  scanRepo,
  simulateBreakingChange,
} from "../../../../lib/api";

import { ApiBadge, apiLabel, formatDate, Nav, SeverityBadge, Spinner, StatusPill } from "../../../../components/ui";

export default function RepoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [data, setData] = useState<DetectionsResponse | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [fixesCount, setFixesCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulateBreakingChangeResult | null>(null);
  const [providerCoverage, setProviderCoverage] = useState<ProviderCoverageEntry[] | null>(null);
  const [scanSummary, setScanSummaryState] = useState<ScanSummary | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [showCoverage, setShowCoverage] = useState(false);
  const [codeHealth, setCodeHealth] = useState<CodeHealthIssue[] | null>(null);
  const [dailyScans, setDailyScans] = useState<DailyScanRun[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, a, f, coverage, summary, health, scans] = await Promise.all([
        getDetections(id),
        getAlerts(id),
        getFixes(id),
        getProviderCoverage(id).catch(() => []),
        getScanSummary(id).catch(() => null),
        getCodeHealthIssues(id).catch(() => []),
        getDailyScanRuns(id).catch(() => []),
      ]);
      setData(d);
      setAlerts(a);
      setFixesCount(f.fixes.length);
      setProviderCoverage(coverage);
      setScanSummaryState(summary);
      setCodeHealth(health);
      setDailyScans(scans);
      // Auto-select first detected provider
      if (d.footprint.length > 0 && !selectedProvider) {
        setSelectedProvider(d.footprint[0].api_name);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load repo");
    }
  }, [id, selectedProvider]);

  useEffect(() => {
    load();
  }, [load]);

  async function runScan() {
    setScanning(true);
    setScanMsg(null);
    setError(null);
    try {
      const res = await scanRepo(id);
      setScanMsg(
        `Scanned ${res.files_scanned} files — ${res.detections_found} detections across ${res.apis_detected.length} API(s).`
      );
      await load();
    } catch (e: any) {
      setError(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function runSimulate() {
    setSimulating(true);
    setError(null);
    setSimResult(null);
    try {
      const res = await simulateBreakingChange(id, selectedProvider || undefined);
      setSimResult(res);
      // Refresh history so the new TEST alert row appears.
      await load();
    } catch (e: any) {
      setError(e.message || "Simulation failed");
    } finally {
      setSimulating(false);
    }
  }

  function toggle(api: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(api) ? next.delete(api) : next.add(api);
      return next;
    });
  }

  const repo = data?.repo;

  return (
    <>
      <Nav />
      <main className="container page">
        <p style={{ marginTop: 0 }}>
          <Link href="/dashboard">← All repos</Link>
        </p>

        <div className="row" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>{repo?.full_name ?? "Repository"}</h1>
            <p className="muted small" style={{ margin: 0 }}>
              {repo ? (
                <>
                  Branch <code>{repo.default_branch}</code> · Last scanned{" "}
                  {formatDate(repo.last_scanned_at)}
                </>
              ) : (
                "Loading…"
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn btn-secondary" href={`/dashboard/repos/${id}/fixes`}>
              Fixes {fixesCount !== null && <span className="pill pill-gray" style={{ marginLeft: 6 }}>{fixesCount}</span>}
            </Link>
            <button className="btn btn-primary" onClick={runScan} disabled={scanning}>
              {scanning ? <><Spinner /> Scanning…</> : "Scan now"}
            </button>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {data && data.footprint.length > 0 && (
                <select
                  className="input"
                  style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                >
                  {data.footprint.map((g) => (
                    <option key={g.api_name} value={g.api_name}>
                      {g.api_name}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn btn-secondary"
                onClick={runSimulate}
                disabled={simulating || !data || data.footprint.length === 0}
                title="Fire a mock breaking change to demo alerting (TEST)."
              >
                {simulating ? <><Spinner /> Simulating…</> : "Send Test Alert"}
              </button>
            </div>
          </div>
        </div>

        {simResult && (
          <section className="card" style={{ marginBottom: 20, borderColor: "#f5b301", borderWidth: 2 }}>
            <div style={{ padding: "14px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  Simulated Alert
                  <span style={{ background: "#f5b301", color: "#1a1a2e", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase" }}>
                    TEST ALERT
                  </span>
                </h2>
                <span className="pill pill-amber" style={{ textTransform: "capitalize" }}>
                  {simResult.change_type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="muted small" style={{ margin: "8px 0 4px" }}>
                Matched {simResult.matched_count} location(s)&nbsp;·&nbsp;Severity:{" "}
                <SeverityBadge severity={simResult.severity} reason={simResult.severity_reason} />
              </p>
              {simResult.matched_count > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }} className="small">
                  {simResult.locations.map((loc, i) => (
                    <li key={i}>
                      <code>
                        {loc.file_path}
                        {loc.line_number ? `:${loc.line_number}` : ""}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small" style={{ margin: "12px 0 0" }}>
                <span className={`pill ${simResult.email_sent ? "pill-green" : "pill-gray"}`}>
                  {simResult.email_sent ? "✓ Test email sent" : "Email pending"}
                </span>
                {" "}
                <span className={simResult.alert_created ? "pill pill-green" : "pill pill-gray"}>
                  {simResult.alert_created ? "Alert row created" : "No alert row"}
                </span>
                {simResult.email_detail && (
                  <span className="muted" style={{ marginLeft: 8 }}>{simResult.email_detail}</span>
                )}
              </p>
            </div>
          </section>
        )}

        {scanMsg && <div className="pill pill-green" style={{ marginBottom: 12 }}>{scanMsg}</div>}
        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ---- API footprint ---- */}
        <section className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: "16px 20px 0" }}>
            <h2 style={{ marginBottom: 4 }}>Detected API footprint</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              {scanSummary
                ? `${scanSummary.totalProvidersDetected} provider(s) detected across ${scanSummary.totalDetections} finding(s). Monitoring: Phase B (planned).`
                : "Every third-party API we found in your code. All providers are detection-only in Phase A."}
            </p>
            {scanSummary && scanSummary.totalProvidersDetected > 0 && (
              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                <span>📊 {scanSummary.totalProvidersDetected} providers</span>
                <span>🔍 {scanSummary.totalDetections} detections</span>
                <span>⚡ {scanSummary.highConfidenceProviders} high-confidence</span>
                <span className="pill pill-gray" style={{ fontSize: 11 }}>Phase A: Detection Only</span>
              </div>
            )}
          </div>

          {data === null ? (
            <div style={{ padding: 20 }}><Spinner /> Loading…</div>
          ) : data.footprint.length === 0 ? (
            <div className="empty">
              No API usage detected yet. Click <strong>Scan now</strong> to analyze this repo.
            </div>
          ) : (
            <table className="table responsive-cards">
              <thead>
                <tr>
                  <th>API</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>Detections</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.footprint.map((g) => (
                  <FootprintRows
                    key={g.api_name}
                    group={g}
                    open={expanded.has(g.api_name)}
                    onToggle={() => toggle(g.api_name)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ---- Alert history ---- */}
        <section className="card" style={{ padding: 0 }}>
          <div
            style={{
              padding: "16px 20px 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ marginBottom: 4 }}>Alert history</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                Breaking changes we matched to this repo&apos;s code, sorted by severity.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label className="muted small" htmlFor="sevFilter" style={{ margin: 0 }}>
                Severity
              </label>
              <select
                id="sevFilter"
                className="input"
                style={{ width: "auto", padding: "6px 10px" }}
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
          </div>
          {alerts === null ? (
            <div style={{ padding: 20 }}><Spinner /> Loading…</div>
          ) : alerts.length === 0 ? (
            <div className="empty">No alerts yet. You&apos;re all clear. 🎉</div>
          ) : (
            <table className="table responsive-cards">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Change</th>
                  <th>Affected location</th>
                  <th>Email</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {alerts
                  .filter((a) => severityFilter === "all" || a.severity === severityFilter)
                  .map((a) => (
                    <tr key={a.id}>
                      <td data-label="Severity">
                        <SeverityBadge severity={a.severity} reason={a.severity_reason} />
                      </td>
                      <td data-label="Change">
                        <span className="pill pill-amber" style={{ marginBottom: 4 }}>
                          {a.change_type.replace(/_/g, " ")}
                        </span>
                        {a.is_test && (
                          <span title="This is a simulated test alert" style={{ background: "#f5b301", color: "#1a1a2e", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "1px 7px", borderRadius: 999, textTransform: "uppercase", marginLeft: 8 }}>
                            TEST
                          </span>
                        )}
                        <div className="small" style={{ marginTop: 4 }}>{a.description}</div>
                        {a.source_url && (
                          <a className="small" href={a.source_url} target="_blank" rel="noreferrer">
                            Changelog →
                          </a>
                        )}
                      </td>
                      <td data-label="Affected location">
                        {a.file_path ? (
                          <code>
                            {a.file_path}
                            {a.line_number ? `:${a.line_number}` : ""}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Email">
                        {a.email_sent ? (
                          <span className="pill pill-green">Sent</span>
                        ) : (
                          <span className="pill pill-gray">Pending</span>
                        )}
                      </td>
                      <td data-label="Date" className="muted small">{formatDate(a.created_at)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ---- Code Health ---- */}
        <section className="card" style={{ padding: 0, marginTop: 20 }}>
          <div style={{ padding: "16px 20px 0" }}>
            <h2 style={{ marginBottom: 4 }}>Code Health</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Deterministic code-health findings from daily scans (env vars, dependencies, deprecated patterns).
            </p>
            {dailyScans && dailyScans.length > 0 && (
              <div className="muted small" style={{ marginTop: 4 }}>
                <span className="pill pill-blue" style={{ fontSize: 11 }}>
                  Last checked: {formatDate(dailyScans[0].ran_at)}
                </span>
                {dailyScans[0].changelog_check_status === "breaking_change_found" && (
                  <span className="pill pill-red" style={{ fontSize: 11, marginLeft: 8 }}>
                    Breaking change: {dailyScans[0].changelog_issues_count}
                  </span>
                )}
                {dailyScans[0].code_check_status === "issue_found" && (
                  <span className="pill pill-red" style={{ fontSize: 11, marginLeft: 8 }}>
                    Code issues: {dailyScans[0].code_issues_count}
                  </span>
                )}
                {dailyScans[0].changelog_check_status === "clear" && dailyScans[0].code_check_status === "clear" && (
                  <span className="pill pill-green" style={{ fontSize: 11, marginLeft: 8 }}>
                    All checks passed
                  </span>
                )}
              </div>
            )}
          </div>

          {codeHealth === null ? (
            <div style={{ padding: 20 }}><Spinner /> Loading…</div>
          ) : codeHealth.length === 0 ? (
            <div className="empty">
              No code health issues detected. Run a scan or wait for the next daily check.
            </div>
          ) : (
            <table className="table responsive-cards">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Issue</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {codeHealth.map((issue) => (
                  <tr key={issue.id}>
                    <td data-label="Provider">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <ApiBadge name={issue.provider} /> <strong>{issue.provider}</strong>
                      </span>
                    </td>
                    <td data-label="Issue">
                      <span className="pill pill-amber" style={{ fontSize: 11, textTransform: "capitalize" }}>
                        {issue.issue_type.replace(/_/g, " ")}
                      </span>
                      {/* Clamped to 3 lines so one huge finding cannot destroy
                          the row/column layout; full text stays in the DOM
                          (title tooltip) and on the health issues detail page. */}
                      <div className="small clamp-3" style={{ marginTop: 4 }} title={issue.description}>
                        {issue.description}
                      </div>
                    </td>
                    <td data-label="File">
                      <code className="small">
                        {issue.file_path}
                        {issue.line_number ? `:${issue.line_number}` : ""}
                      </code>
                    </td>
                    <td data-label="Status">
                      {issue.status === "open" ? (
                        <span className="pill pill-red" style={{ fontSize: 11 }}>Open</span>
                      ) : issue.status === "resolved" ? (
                        <span className="pill pill-green" style={{ fontSize: 11 }}>Resolved</span>
                      ) : (
                        <span className="pill pill-gray" style={{ fontSize: 11 }}>Dismissed</span>
                      )}
                    </td>
                    <td data-label="Detected" className="muted small">{formatDate(issue.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ---- Provider Coverage (Phase A) ---- */}
        {providerCoverage && providerCoverage.length > 0 && (
          <section className="card" style={{ padding: 0, marginTop: 20 }}>
            <div style={{ padding: "16px 20px 0" }}>
              <h2 style={{ marginBottom: 4 }}>Provider Coverage</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                All 15 Phase A providers. Detection is active; monitoring goes live in Phase B.
              </p>
            </div>
            <table className="table responsive-cards">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Category</th>
                  <th>Detection</th>
                  <th>Monitoring</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {providerCoverage.map((p) => (
                  <tr key={p.provider}>
                    <td data-label="Provider">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <ApiBadge name={p.provider} /> <strong>{p.displayName || p.provider}</strong>
                      </span>
                    </td>
                    <td data-label="Category" style={{ textTransform: "capitalize" }}>{p.category}</td>
                    <td data-label="Detection">
                      <span className="pill pill-green" style={{ fontSize: 11 }}>Active</span>
                    </td>
                    <td data-label="Monitoring">
                      <span className="pill pill-gray" style={{ fontSize: 11 }}>
                        {p.monitoringEnabled ? "Active" : "Planned (Phase B)"}
                      </span>
                    </td>
                    <td data-label="Status">
                      {p.hasDetections ? (
                        <span className="pill pill-blue" style={{ fontSize: 11 }}>Detected</span>
                      ) : (
                        <span className="muted small">No detections</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}

function FootprintRows({
  group,
  open,
  onToggle,
}: {
  group: DetectionsResponse["footprint"][number];
  open: boolean;
  onToggle: () => void;
}) {
  const statusLabel = group.status === "planned" ? "Planned" : group.status === "monitored" ? "Monitored" : group.status;
  const statusColor = group.status === "monitored" ? "pill-green" : group.status === "planned" ? "pill-blue" : "pill-gray";
  return (
    <>
      <tr>
        <td data-label="API">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <ApiBadge name={group.api_name} /> <strong>{apiLabel(group.api_name)}</strong>
          </span>
          {group.category && (
            <span className="muted small" style={{ marginLeft: 8, textTransform: "capitalize" }}>
              {group.category}
            </span>
          )}
        </td>
        <td data-label="Status">
          <span className={`pill ${statusColor}`} style={{ fontSize: 11 }}>
            {statusLabel}
          </span>
        </td>
        <td data-label="Files">{group.file_count}</td>
        <td data-label="Detections">{group.detection_count}</td>
        <td data-label="" style={{ textAlign: "right" }}>
          <button className="btn btn-sm" onClick={onToggle}>
            {open ? "Hide" : "Show"} files
          </button>
        </td>
      </tr>
      {open &&
        group.detections.map((d) => (
          <tr key={d.id} style={{ background: "#fbfbfe" }}>
            <td data-label="" colSpan={5} style={{ paddingLeft: 24 }}>
              <code>
                {d.file_path}
                {d.line_number ? `:${d.line_number}` : ""}
              </code>
              {d.matched_snippet && (
                <div className="muted small" style={{ marginTop: 2, fontFamily: "monospace" }}>
                  {d.matched_snippet}
                </div>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}
