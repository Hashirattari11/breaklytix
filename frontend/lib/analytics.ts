/**
 * Lightweight, privacy-friendly conversion tracking.
 *
 * No third-party analytics is currently configured for this site, so events
 * are recorded to a first-party buffer (window.dataLayer-compatible shape)
 * and mirrored to the console in development only. When a real analytics
 * provider is added (e.g. Plausible/PostHog), forward events there from
 * `dispatch()` — the call sites below won't need to change.
 *
 * Events carry NO personal information: just the event name and an optional
 * anonymous property bag (booleans/strings like which CTA was clicked).
 */

export type AnalyticsEvent =
  | "landing_page_view"
  | "hero_cta_click"
  | "github_connect_click"
  | "see_how_click"
  | "nav_get_started_click"
  | "signup_started"
  | "signup_completed"
  | "repository_connected"
  | "repository_scan_started"
  | "repository_scan_completed"
  | "first_impact_found"
  | "scan_started"
  | "scan_completed"
  | "email_captured"
  | "share_clicked"
  | "badge_copied";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function dispatch(event: AnalyticsEvent, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...props, ts: Date.now() });
    if (process.env.NODE_ENV !== "production") {
      // Dev-only visibility; production stays silent (no console noise).
      console.info("[analytics]", event, props ?? {});
    }
  } catch {
    /* analytics must never break the page */
  }
}

/** Fire a conversion/UX event. Safe to call during render-free handlers only. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  dispatch(event, props);
}
