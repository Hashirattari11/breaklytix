"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Spinner } from "@/components/ui";
import {
  getProviderEvents,
  getMonitoringMatrix,
  ChangelogEvent,
  MonitoringProviderRow,
} from "@/lib/api";
import { getAllProviderIds, getProvider, PROVIDER_MAP } from "@/lib/providers/registry";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "UNKNOWN"];

function severityClass(sev?: string | null): string {
  switch ((sev || "UNKNOWN").toUpperCase()) {
    case "CRITICAL":
      return "pill pill-red";
    case "HIGH":
      return "pill pill-red";
    case "MEDIUM":
      return "pill pill-amber";
    case "LOW":
      return "pill pill-gray";
    case "INFO":
      return "pill pill-gray";
    default:
      return "pill";
  }
}

function confidenceClass(conf?: string | null): string {
  switch ((conf || "UNKNOWN").toUpperCase()) {
    case "HIGH":
      return "pill pill-red";
    case "MEDIUM":
      return "pill pill-amber";
    case "LOW":
      return "pill pill-gray";
    default:
      return "pill";
  }
}

function reviewBadge(state?: string | null) {
  switch (state) {
    case "reviewed":
      return <span className="pill pill-green" style={{ fontSize: 11 }}>Reviewed</span>;
    case "dismissed":
      return <span className="pill pill-gray" style={{ fontSize: 11 }}>Dismissed</span>;
    default:
      return <span className="pill pill-amber" style={{ fontSize: 11 }}>Unreviewed</span>;
  }
}

function displayProviderName(id: string): string {
  const p = getProvider(id);
  if (p) return p.displayName;
  const row = PROVIDER_MAP.get(id);
  return row?.displayName || id;
}

export default function ChangelogPage() {
  const [events, setEvents] = useState<ChangelogEvent[] | null>(null);
  const [matrix, setMatrix] = useState<MonitoringProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, mxRes] = await Promise.all([
        getProviderEvents({ limit: 100 }),
        getMonitoringMatrix(),
      ]);
      setEvents(evRes.events || []);
      setMatrix(mxRes.providers || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load provider changes");
      setEvents([]);
      setMatrix([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // All 44 providers, sorted by display name. Monitoring state from the matrix.
  const allProviders = useMemo(() => {
    return getAllProviderIds()
      .map((id) => {
        const row = matrix?.find((m) => m.provider_id === id);
        const p = getProvider(id);
        return {
          id,
          displayName: p?.displayName || displayProviderName(id),
          status: row?.status || (p?.monitoringStatus === "unavailable" ? "SOURCE_UNAVAILABLE" : "LIMITED"),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [matrix]);

  // Count of providers with an official source (not SOURCE_UNAVAILABLE).
  const monitoredCount = useMemo(
    () => allProviders.filter((p) => p.status !== "SOURCE_UNAVAILABLE").length,
    [allProviders]
  );

  const filtered = (events ?? []).filter(
    (e) =>
      (providerFilter === "all" || e.api_name === providerFilter) &&
      (severityFilter === "all" || (e.severity || "UNKNOWN").toUpperCase() === severityFilter) &&
      (reviewFilter === "all" || (e.review_state || "unreviewed") === reviewFilter)
  );

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Provider Changes</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Official API changes monitored across all {allProviders.length} providers.
            Severity, confidence and evidence come from the official source — no fabricated entries.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="pill pill-green" style={{ fontSize: 12 }}>
            Monitoring {monitoredCount} providers
          </span>
          <Link className="btn btn-secondary" href="/dashboard/providers">
            Monitoring Matrix
          </Link>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: "16px 20px 0",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="muted small" htmlFor="providerFilter" style={{ margin: 0 }}>Provider</label>
            <select
              id="providerFilter"
              className="input"
              style={{ width: "auto", padding: "6px 10px", maxWidth: 200 }}
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
            >
              <option value="all">All 44 providers</option>
              {allProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}{p.status === "SOURCE_UNAVAILABLE" ? " (unavailable)" : ""}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="muted small" htmlFor="severityFilter" style={{ margin: 0 }}>Severity</label>
            <select
              id="severityFilter"
              className="input"
              style={{ width: "auto", padding: "6px 10px" }}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All severities</option>
              {SEVERITY_ORDER.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="muted small" htmlFor="reviewFilter" style={{ margin: 0 }}>Status</label>
            <select
              id="reviewFilter"
              className="input"
              style={{ width: "auto", padding: "6px 10px" }}
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="reviewed">Reviewed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 20 }}><Spinner /> Loading provider changes…</div>
        ) : filtered.length === 0 ? (
          <div className="empty" style={{ marginTop: 16 }}>
            {events && events.length === 0
              ? `No provider changes detected yet. Monitoring ${monitoredCount} providers from official sources.`
              : "No changes match the current filters."}
          </div>
        ) : (
          <table className="table responsive-cards">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Change type</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th>Source</th>
                <th>Published</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td data-label="Provider">
                    <Link href={`/dashboard/changelog/${e.id}`} style={{ textDecoration: "none", fontWeight: 600 }}>
                      {displayProviderName(e.api_name)}
                    </Link>
                    <div className="small muted">{e.api_name}</div>
                  </td>
                  <td data-label="Change type">
                    <span className="pill pill-amber" style={{ fontSize: 11 }}>
                      {(e.change_type || "OTHER").replace(/_/g, " ")}
                    </span>
                    <div className="small" style={{ marginTop: 4 }}>{e.title}</div>
                  </td>
                  <td data-label="Severity">
                    <span className={severityClass(e.severity)} style={{ fontSize: 11 }}>
                      {e.severity || "UNKNOWN"}
                    </span>
                  </td>
                  <td data-label="Confidence">
                    <span className={confidenceClass(e.confidence)} style={{ fontSize: 11 }}>
                      {e.confidence || "UNKNOWN"}
                    </span>
                  </td>
                  <td data-label="Source">
                    {e.source_url ? (
                      <a className="small" href={e.source_url} target="_blank" rel="noreferrer">
                        Official source →
                      </a>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td data-label="Published" className="muted small">
                    {new Date(e.detected_at || e.first_seen_at || Date.now()).toLocaleDateString()}
                  </td>
                  <td data-label="Status">{reviewBadge(e.review_state)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}