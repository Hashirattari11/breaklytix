"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Spinner } from "@/components/ui";
import { htmlToReadableText } from "@/lib/sanitize";
import {
  getProviderEvent,
  reviewProviderEvent,
  dismissProviderEvent,
  ChangelogEvent,
} from "@/lib/api";
import { getProvider } from "@/lib/providers/registry";

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

export default function ChangelogEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<ChangelogEvent | null>(null);
  const [relatedAlerts, setRelatedAlerts] = useState<unknown[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProviderEvent(id);
      setEvent(res.event);
      setRelatedAlerts(res.alerts || []);
      setNotFound(false);
    } catch (e: any) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = useCallback(async (action: "review" | "dismiss") => {
    setActing(true);
    setActionError(null);
    try {
      if (action === "review") {
        await reviewProviderEvent(id);
      } else {
        await dismissProviderEvent(id);
      }
      await load();
      router.refresh();
    } catch (e: any) {
      setActionError(e.message || "Action failed.");
    } finally {
      setActing(false);
    }
  }, [id, load, router]);

  if (loading) {
    return (
      <div className="page">
        <Spinner /> Loading event…
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="page">
        <h1>Change Not Found</h1>
        <p className="muted">This changelog event could not be found or is no longer available.</p>
        <Link className="btn btn-primary" href="/dashboard/changelog">
          ← Back to Provider Changes
        </Link>
      </div>
    );
  }

  const provider = getProvider(event.api_name);
  const providerName = provider?.displayName || event.provider_display || event.api_name;
  const evidence = event.severity_evidence || event.confidence_evidence || null;

  return (
    <div className="page">
      <Link className="btn btn-secondary" href="/dashboard/changelog" style={{ marginBottom: 16 }}>
        ← Back to Provider Changes
      </Link>

      <h1 style={{ marginBottom: 4 }}>{event.title}</h1>
      <p className="muted small" style={{ margin: 0 }}>
        {providerName} · {event.api_name} · Official provider change
      </p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0 20px", flexWrap: "wrap", alignItems: "center" }}>
        <span className="pill pill-amber" style={{ textTransform: "capitalize" }}>
          {(event.change_type || "OTHER").replace(/_/g, " ")}
        </span>
        <span className={severityClass(event.severity)}>
          Severity: {event.severity || "UNKNOWN"}
        </span>
        <span className={confidenceClass(event.confidence)}>
          Confidence: {event.confidence || "UNKNOWN"}
        </span>
        {event.review_state === "reviewed" && (
          <span className="pill pill-green">Reviewed</span>
        )}
        {event.review_state === "dismissed" && (
          <span className="pill pill-gray">Dismissed</span>
        )}
      </div>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>What changed</h3>
        {/* Provider descriptions contain rich HTML — NEVER render it (XSS risk
            and raw-tag soup). htmlToReadableText converts it to safe plain
            text: paragraphs readable, code backticked, links visible. */}
        <p style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
          {event.description
            ? htmlToReadableText(event.description)
            : "No description provided for this change."}
        </p>
        {event.last_seen_at && (
          <p className="muted small" style={{ marginTop: 8 }}>
            Last seen: {new Date(event.last_seen_at).toLocaleString()}
          </p>
        )}
        {event.detected_at && (
          <p className="muted small">
            Detected: {new Date(event.detected_at).toLocaleString()}
          </p>
        )}
        {event.source_url && (
          <p style={{ marginTop: 8 }}>
            <a href={event.source_url} target="_blank" rel="noreferrer">
              View on official source →
            </a>
          </p>
        )}
      </section>

      {evidence && (
        <section className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Classification evidence</h3>
          <pre
            style={{
              background: "#f6f6fb",
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </section>
      )}

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Impact</h3>
        {relatedAlerts.length === 0 ? (
          <p className="muted">
            No matching repository usage detected. This change is informational until your
            repositories are found to use this provider.
          </p>
        ) : (
          <>
            <p><strong>Potential impact detected</strong> — your scanned repositories may be affected.</p>
            <p className="muted small">
              {relatedAlerts.length} related alert{relatedAlerts.length === 1 ? "" : "s"} referencing
              this change exist in your alert history.
            </p>
            <Link className="btn btn-secondary btn-sm" href="/dashboard/alerts">
              View Alert History
            </Link>
          </>
        )}
      </section>

      {actionError && <div className="error-box" style={{ marginBottom: 16 }}>{actionError}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          className="btn btn-primary"
          disabled={acting || event.review_state === "reviewed"}
          onClick={() => mark("review")}
        >
          {event.review_state === "reviewed" ? "Reviewed" : "Mark as Reviewed"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={acting || event.review_state === "dismissed"}
          onClick={() => mark("dismiss")}
        >
          {event.review_state === "dismissed" ? "Dismissed" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}