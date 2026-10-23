// Typed client for the Breaklytix FastAPI backend.
import { clearSession, ensureSession, getToken, User } from "./auth";
import type {
  ChangelogEvent,
  MonitoringProviderRow,
} from "./providers/types";

export type { ChangelogEvent, MonitoringProviderRow } from "./providers/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
export const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "";

// GitHub OAuth scopes — `repo` grants read/write access to public AND private
// repositories the user can access, which is required for scanning private
// repos (the previous read-only set could not see them at all). Users who
// connected before this change must re-run GitHub OAuth to grant the new scope.
// `read:user`/`user:email` cover identity.
export const GITHUB_SCOPES = "read:user user:email repo";

export type Repo = {
  id: string;
  github_repo_id: string;
  full_name: string;
  default_branch: string;
  connected_at?: string | null;
  last_scanned_at?: string | null;
};

export type GitHubRepo = {
  github_repo_id: string;
  full_name: string;
  default_branch: string;
  private: boolean;
};

export type Detection = {
  id: string;
  api_name: string;
  file_path: string;
  line_number?: number | null;
  matched_snippet?: string | null;
  detected_at?: string | null;
};

export type ApiFootprintGroup = {
  api_name: string;
  status: "monitored" | "planned" | "coming_soon" | "unsupported";
  detection_count: number;
  file_count: number;
  detections: Detection[];
  category?: string;
};

export type DetectionsResponse = {
  repo: Repo;
  footprint: ApiFootprintGroup[];
};

export type Alert = {
  id: string;
  change_type: string;
  description?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  source_url?: string | null;
  file_path?: string | null;
  line_number?: number | null;
  email_sent: boolean;
  sent_at?: string | null;
  created_at?: string | null;
  severity: "critical" | "high" | "medium" | "low";
  severity_reason?: string | null;
  provider?: string | null;
  status?: string | null;
  is_test?: boolean;
};

export type AlertWithRepo = Alert & {
  repo_id: string;
  repo_name: string;
  read_at?: string | null;
};

export type SimulatedAlertLocation = {
  file_path: string;
  line_number?: number | null;
  matched_snippet?: string | null;
};

export type SimulateBreakingChangeResult = {
  api_name: string;
  change_type: string;
  old_value?: string | null;
  new_value?: string | null;
  severity: "critical" | "high" | "medium" | "low";
  severity_reason: string;
  matched_count: number;
  locations: SimulatedAlertLocation[];
  alert_created: boolean;
  alert_id?: string | null;
  email_sent: boolean;
  email_detail?: string | null;
  is_test: boolean;
};

export type ScanResult = {
  repo_id: string;
  files_scanned: number;
  detections_found: number;
  apis_detected: string[];
  last_scanned_at?: string | null;
  plan_limit_exceeded?: boolean;
  plan_warning?: string | null;
  new_apis_detected?: number;
  monitoring_limit?: number | null;
};

// ---- Fixes (Review UI) -------------------------------------------------------
export type FixStatus = "pending" | "needs_review" | "pr_created" | "merged" | "rejected";

export type Fix = {
  id: string;
  repo_id: string;
  fix_rule_id: string;
  file_path: string;
  diff_preview: string;
  pr_url?: string | null;
  pr_number?: number | null;
  status: FixStatus;
  created_at?: string | null;
  updated_at?: string | null;
  rule_title?: string | null;
  rule_description?: string | null;
  rule_confidence?: string | null;
  rule_old_value?: string | null;
  rule_new_value?: string | null;
  rule_source_url?: string | null;
};

export type FixesListResponse = {
  fixes: Fix[];
};

export type FixActionResponse = {
  fix_id: string;
  status: FixStatus;
  pr_url?: string | null;
  message: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: unknown) {
    // Coerce ANY payload (string / object / array) into a safe display string.
    // FastAPI uses `{"detail": "..."}`; our endpoints may use a dict detail
    // like `{"detail": {"error": ..., "message": ...}}` — never leak a bare
    // "[object Object]" to the UI.
    const text =
      typeof message === "string"
        ? message
        : message && typeof message === "object"
          ? ((message as { message?: unknown }).message
              ? String((message as { message: unknown }).message)
              : JSON.stringify(message))
          : String(message);
    super(text);
    this.status = status;
  }
}

export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  await ensureSession();
  const token = getToken();
  const headers = new Headers(options.headers);
  // Only declare a JSON body when one exists; GET/DELETE with a JSON
  // Content-Type triggered unnecessary CORS preflights.
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      if (typeof body === "string") detail = body;
      else if (body && typeof body.detail !== "undefined") detail = body.detail;
      else detail = body;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Generic fetch helper used by dashboard pages (returns parsed JSON body).
export const apiFetch = request;

// ---- Auth ------------------------------------------------------------------
export function buildGithubAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function githubCallback(
  code: string,
  redirectUri: string
): Promise<{ token: string; user: User }> {
  return request("/auth/github/callback", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
}

// ---- Legal consent (master pass §2) ---------------------------------------
export function getConsentStatus(): Promise<User> {
  return request("/auth/consent-status");
}

export function acceptConsent(
  privacyPolicyVersion: string,
  termsVersion: string
): Promise<User> {
  return request("/auth/consent", {
    method: "POST",
    body: JSON.stringify({ privacy_policy_version: privacyPolicyVersion, terms_version: termsVersion }),
  });
}

// ---- Repos -----------------------------------------------------------------
export const listRepos = () => request<Repo[]>("/repos");
export const listGithubRepos = () => request<GitHubRepo[]>("/repos/github");
export const getRepo = (id: string) => request<Repo>(`/repos/${id}`);
export const getDetections = (id: string) =>
  request<DetectionsResponse>(`/repos/${id}/detections`);
export const getAlerts = (id: string) => request<Alert[]>(`/repos/${id}/alerts`);
export const listAllAlerts = async (repositoryId?: string) => {
  const path = `/repos/alerts${repositoryId ? `?repository_id=${encodeURIComponent(repositoryId)}` : ""}`;
  const data = await request<AlertWithRepo[] | { alerts?: AlertWithRepo[]; items?: AlertWithRepo[]; data?: AlertWithRepo[] }>(path);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.alerts)) return data.alerts;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
};
// Alert lifecycle: mark alerts READ (server-backed, ownership enforced).
// No ids => ALL of the user's currently-unread alerts become read.
export const markAlertsRead = (alertIds?: string[]) =>
  request<{ updated: number }>("/repos/alerts/read", {
    method: "PATCH",
    body: JSON.stringify({ alert_ids: alertIds ?? null }),
  });
export const updateAlertStatus = (id: string, status: "resolved" | "ignored") =>
  request<AlertWithRepo>(`/repos/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
export const scanRepo = (id: string) =>
  request<ScanResult>(`/repos/${id}/scan`, { method: "POST" });

export const simulateBreakingChange = (id: string, apiName?: string) => {
  const body = apiName ? JSON.stringify({ api_name: apiName }) : "{}";
  return request<SimulateBreakingChangeResult>(
    `/repos/${id}/simulate-breaking-change`,
    { method: "POST", body }
  );
};

// ---- Provider Coverage (Phase A) ------------------------------------------
export type ProviderCoverageEntry = {
  provider: string;
  displayName: string;
  category: string;
  detectionEnabled: boolean;
  monitoringEnabled: boolean;
  monitoringStatus: "supported" | "planned" | "unavailable";
  hasDetections: boolean;
};

export type ScanSummary = {
  totalProvidersDetected: number;
  highConfidenceProviders: number;
  providersMonitored: number;
  providersDetectedNotMonitored: number;
  totalDetections: number;
};

export const getProviderCoverage = (repoId: string) =>
  request<ProviderCoverageEntry[]>(`/repos/${repoId}/provider-coverage`);

export const getScanSummary = (repoId: string) =>
  request<ScanSummary>(`/repos/${repoId}/scan-summary`);

// ---- Changelog Notices (Phase B) ------------------------------------------
export type ChangelogNotice = {
  id: string;
  api_name: string;
  title: string;
  source_url?: string | null;
  detected_at?: string | null;
  description?: string | null;
  change_type?: string | null;
  severity?: string | null;
  confidence?: string | null;
  email_sent: boolean;
  sent_at?: string | null;
  created_at?: string | null;
  // nested changelog_events row when returned via notices endpoint
  changelog_events?: {
    id: string;
    api_name?: string;
    title?: string;
    source_url?: string | null;
    detected_at?: string | null;
    description?: string | null;
    change_type?: string | null;
    severity?: string | null;
  } | null;
};

export const getChangelogNotices = () =>
  request<{ notices: ChangelogNotice[] }>("/internal/changelog/notices");

// ---- Provider Changelog Events (real monitoring, all 44 providers) ---------

export type ProviderEventFilter = {
  provider?: string;
  change_type?: string;
  severity?: string;
  confidence?: string;
  review_state?: string;
  limit?: number;
  offset?: number;
};

export const getProviderEvents = (filters: ProviderEventFilter = {}) => {
  const params = new URLSearchParams();
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.change_type) params.set("change_type", filters.change_type);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.confidence) params.set("confidence", filters.confidence);
  if (filters.review_state) params.set("review_state", filters.review_state);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return request<{ events: ChangelogEvent[] }>(
    `/internal/changelog/events${qs ? `?${qs}` : ""}`
  );
};

export const getProviderEvent = (eventId: string) =>
  request<{ event: ChangelogEvent; alerts: unknown[] }>(
    `/internal/changelog/events/${eventId}`
  );

export const getMonitoringMatrix = () =>
  request<{ providers: MonitoringProviderRow[] }>(
    "/internal/changelog/monitoring"
  );

export const reviewProviderEvent = (eventId: string) =>
  request<{ updated: boolean }>(
    `/internal/changelog/events/${eventId}/review`,
    { method: "POST" }
  );

export const dismissProviderEvent = (eventId: string) =>
  request<{ updated: boolean }>(
    `/internal/changelog/events/${eventId}/dismiss`,
    { method: "POST" }
  );

export function connectRepo(body: {
  github_repo_id: string;
  full_name: string;
  default_branch: string;
}): Promise<Repo> {
  return request<Repo>("/repos/connect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---- Billing ------------------------------------------------------------------
export type CheckoutSessionIn = {
  plan: "starter" | "growth" | "enterprise";
  success_url: string;
  cancel_url: string;
};

export type CheckoutSessionOut = {
  session_id: string;
  url: string;
};

export type BillingPortalOut = {
  url: string;
};

export type BillingStatusOut = {
  plan: string;
  plan_status: string;
  monitored_api_limit: number;
  monitored_api_count: number;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
};

export const createCheckoutSession = (body: CheckoutSessionIn): Promise<CheckoutSessionOut> =>
  request("/billing/create-checkout-session", { method: "POST", body: JSON.stringify(body) });

export const getBillingPortal = (): Promise<BillingPortalOut> =>
  request("/billing/portal");

export const getBillingStatus = (): Promise<BillingStatusOut> =>
  request("/billing/status");


// ---- Fixes -------------------------------------------------------------------
export const getFixes = (repoId: string, status?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  return request<FixesListResponse>(`/repos/${repoId}/fixes?${params.toString()}`);
};

export const approveFix = (repoId: string, fixId: string) =>
  request<FixActionResponse>(`/repos/${repoId}/fixes/${fixId}/approve`, {
    method: "POST",
    body: "{}",
  });

export const dismissFix = (repoId: string, fixId: string) =>
  request<FixActionResponse>(`/repos/${repoId}/fixes/${fixId}/dismiss`, {
    method: "POST",
    body: "{}",
  });

// ---- Health Intelligence (real data, capability-gated) ----------------------
export type UsageGraphIntegration = {
  provider: string;
  methods: string[];
  files: string[];
  config_refs: string[];
  usage_points: Array<{ method: string; file: string; line?: number | null }>;
};

export type UsageGraph = {
  repo_id: string;
  integrations: UsageGraphIntegration[];
};

export type RateLimitSnapshot = {
  id: string;
  provider: string;
  limit_value?: number | null;
  remaining?: number | null;
  reset_at?: string | null;
  recorded_at?: string | null;
};

export type HealthRateLimitResponse = {
  snapshots: RateLimitSnapshot[];
  status: Record<string, { level?: string; message?: string }>;
};

export type ProviderConnection = {
  provider: string;
  connected_at?: string | null;
  has_key: boolean;
  last_error?: string | null;
};

export const getUsageGraph = async (repoId: string): Promise<UsageGraph> => {
  const g = await request<any>(`/health/repo/${repoId}/usage-graph`);
  // Backend returns integrations as {provider: {...}} object (not array) — normalize.
  let integrations: UsageGraphIntegration[] = [];
  if (Array.isArray(g?.integrations)) {
    integrations = g.integrations;
  } else if (g?.integrations && typeof g.integrations === "object") {
    integrations = Object.entries(g.integrations).map(([provider, val]: [string, any]) => ({
      provider,
      methods: val?.methods || [],
      files: val?.files || [],
      config_refs: val?.config_refs || [],
      usage_points: val?.usage_points || [],
    }));
  }
  return { repo_id: g?.repo_id ?? repoId, integrations };
};

export const getHealthRateLimit = (repoId: string) =>
  request<HealthRateLimitResponse>(`/health/rate-limit/${repoId}`);

export const getProviderConnections = () =>
  request<{ connections: ProviderConnection[] }>(`/health/provider-connections`);

export const createProviderConnection = (provider: string, apiKey: string) =>
  request<{ provider: string; connected: boolean; validated: boolean; message: string }>(
    `/health/provider-connections`,
    { method: "POST", body: JSON.stringify({ provider, api_key: apiKey }) }
  );

export const testProviderConnection = (provider: string, apiKey: string) =>
  request<{ provider: string; valid: boolean; message: string }>(
    `/health/provider-connections/${provider}/test`,
    { method: "POST", body: JSON.stringify({ api_key: apiKey }) }
  );

export const deleteProviderConnection = (provider: string) =>
  request<{ provider: string; connected: boolean }>(
    `/health/provider-connections/${provider}`,
    { method: "DELETE" }
  );

// ---- Health Intelligence: focused views (dashboard 3-section nav) -------------
export type HealthIssue = {
  id: string;
  provider: string;
  repo_id: string;
  category: string;
  severity: string;
  status: string;
  confidence: number;
  title: string;
  description: string;
  evidence: string;
  file: string | null;
  line: number | null;
  source: string;
  recommended_action: string;
  auto_fix_available: boolean;
  created_at: string;
  risk_level?: string | null;
  risk_score?: number | null;
  risk_factors?: string[] | null;
  repo_name?: string | null;
  repo_full_name?: string | null;
};

export type HealthProviderScore = {
  provider: string;
  score: number;
  status: string;
  breakdown?: Record<string, unknown>;
  checks?: Array<{ category?: string; status?: string; severity?: string; score?: number; evidence?: string }>;
  computed_at?: string | null;
  overall?: number | null;
  repository_name?: string | null;
};

export type HealthOverview = {
  score: number;
  status: string;
  repos: number;
  integrations: number;
  providers: HealthProviderScore[];
  issues: Record<string, number>;
};

export type ProviderIncident = {
  id: string;
  provider: string;
  title?: string | null;
  status?: string | null;
  started_at?: string | null;
  resolved_at?: string | null;
  impact?: string | null;
  source_url?: string | null;
};

export type ScanRecord = {
  id: string;
  repo_id?: string;
  status: string;
  scan_type?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  stats?: {
    files_scanned?: number;
    files_skipped?: number;
    findings_total?: number;
    detections_found?: number;
    apis_detected?: string[];
    by_severity?: Record<string, number>;
    by_type?: Record<string, number>;
    by_provider?: Record<string, number>;
  } | null;
  created_at?: string | null;
};

export type ScansListResponse = { scans: ScanRecord[] };

export const getHealthOverview = () => request<HealthOverview>("/health/overview");

// ---- Dashboard aggregate (real DB stats — repo/code intelligence only) -------
export type DashboardStats = {
  repos: number;
  scans_total: number;
  scans_completed: number;
  findings_by_severity: Record<string, number>;
  findings_total: number;
  findings_open: number;
  fixes_created: number;
  prs_created: number;
  alerts_pending: number;
  providers_monitored: number;
  providers_planned: number;
  monitored_api_count: number;
  last_scan_at?: string | null;
};

export const getDashboardStats = () => request<DashboardStats>("/repos/dashboard/stats");

export const getHealthRepo = (repoId: string) =>
  request<{ repo: { id: string; full_name: string; default_branch: string; is_production: boolean }; providers: HealthProviderScore[]; issues: HealthIssue[] }>(
    `/health/repo/${repoId}`
  );

export const getProviderIncidentsFeed = (repositoryId?: string) =>
  request<{ total: number; incidents: ProviderIncident[] }>(
    `/health/incidents${repositoryId ? `?repository_id=${encodeURIComponent(repositoryId)}` : ""}`
  );

export const getHealthIssues = (params?: {
  severity?: string;
  category?: string;
  provider?: string;
  status?: string;
  repositoryId?: string;
  limit?: number;
}) => {
  const q = new URLSearchParams();
  if (params?.severity) q.set("severity", params.severity);
  if (params?.category) q.set("category", params.category);
  if (params?.provider) q.set("provider", params.provider);
  if (params?.status) q.set("status", params.status);
  if (params?.repositoryId) q.set("repository_id", params.repositoryId);
  if (params?.limit) q.set("limit", String(params.limit));
  return request<HealthIssue[]>(`/health/issues?${q.toString()}`);
};

export type HealthRuntimeList<T extends string> = {
  total: number;
  critical?: number;
  high?: number;
  customer_code?: number;
  provider_incident?: number;
  [listKey: string]: number | HealthIssue[] | undefined;
};

export const getHealthErrors = (limit = 200, repositoryId?: string) =>
  request<{ total: number; critical: number; high: number; errors: HealthIssue[] }>(
    `/health/errors?limit=${limit}${repositoryId ? `&repository_id=${encodeURIComponent(repositoryId)}` : ""}`
  );

export const getHealthFailures = (limit = 200, repositoryId?: string) =>
  request<{ total: number; customer_code: number; provider_incident: number; other?: number; failures: HealthIssue[] }>(
    `/health/failures?limit=${limit}${repositoryId ? `&repository_id=${encodeURIComponent(repositoryId)}` : ""}`
  );

export const getHealthAnomalies = (limit = 200, repositoryId?: string) =>
  request<{ total: number; critical: number; high: number; anomalies: HealthIssue[] }>(
    `/health/anomalies?limit=${limit}${repositoryId ? `&repository_id=${encodeURIComponent(repositoryId)}` : ""}`
  );

export const updateHealthIssueStatus = (issueId: string, status: string) =>
  request<HealthIssue>(`/health/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const createIssueFix = (issueId: string) =>
  request<{ fix_id?: string; message: string }>(`/health/issues/${issueId}/fix`, { method: "POST" });

export const getHealthHistory = (repoId: string, provider?: string, days = 30) => {
  const q = new URLSearchParams({ days: String(days) });
  if (provider) q.set("provider", provider);
  return request<Record<string, unknown>[]>(`/health/history/${repoId}?${q.toString()}`);
};

export const getScans = (repoId: string) =>
  request<ScansListResponse>(`/repos/${repoId}/scans`);

// ---- Notifications (email preferences + test email) ------------------------
export type NotificationCategories = Record<string, boolean>;

export interface NotificationPreferencesResponse {
  categories: NotificationCategories;
}

export interface TestEmailResponse {
  ok: boolean;
  status: string;
  provider_message_id?: string | null;
  error_category?: string | null;
  detail?: string | null;
  sender_warning?: string | null;
}

export const getNotificationPreferences = () =>
  request<NotificationPreferencesResponse>("/notifications/preferences");

export const updateNotificationPreferences = (preferences: NotificationCategories) =>
  request<NotificationPreferencesResponse>("/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify({ preferences }),
  });

export const sendTestEmail = () =>
  request<TestEmailResponse>("/notifications/test-email", { method: "POST" });

// ---- Daily status email toggle -----------------------------------------------
export interface DailyStatusResponse {
  notify_daily_status: boolean;
}

export const updateDailyStatus = (notify_daily_status: boolean) =>
  request<DailyStatusResponse>("/notifications/daily-status", {
    method: "PATCH",
    body: JSON.stringify({ notify_daily_status }),
  });

// ---- Code Health (Unified 24-Hour Scan Cycle) --------------------------------
export type CodeHealthIssue = {
  id: string;
  repo_id: string;
  provider: string;
  issue_type: string;
  description: string;
  file_path: string;
  line_number?: number | null;
  status: string; // open | resolved | dismissed
  detected_at: string;
  resolved_at?: string | null;
};

export type DailyScanRun = {
  id: string;
  repo_id: string;
  changelog_check_status: string; // clear | breaking_change_found | skipped_no_providers
  code_check_status: string; // clear | issue_found
  changelog_issues_count: number;
  code_issues_count: number;
  ran_at: string;
};

export const getCodeHealthIssues = (repoId: string, status?: string) => {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  const qs = q.toString();
  return request<CodeHealthIssue[]>(`/repos/${repoId}/code-health${qs ? `?${qs}` : ""}`);
};

export const getDailyScanRuns = (repoId: string, limit = 10) =>
  request<DailyScanRun[]>(`/repos/${repoId}/daily-scans?limit=${limit}`);

// ---- Impact Engine ----

export type ImpactAnalysis = {
  id: string;
  repo_id: string;
  changelog_event_id?: string | null;
  provider: string;
  api_endpoint?: string | null;
  change_type: string;
  change_description?: string | null;
  source_url?: string | null;
  detected_at: string;
  affected_files: ImpactAffectedFile[];
  affected_sdks: Record<string, unknown>[];
  severity: string; // safe | low | medium | high | breaking | unknown
  confidence: number;
  impact_reason?: string | null;
  expected_behavior?: string | null;
  potential_failure?: string | null;
  recommended_fix?: string | null;
  fix_diff?: string | null;
  fix_status: string; // not_generated | generated | applied | verified | failed
  verification_status: string; // not_verified | static_analysis | verified | verification_failed
  verification_details: Record<string, unknown>;
  scan_id?: string | null;
  created_at: string;
};

export type ImpactAffectedFile = {
  file_path: string;
  line_number?: number | null;
  function_name?: string | null;
  class_name?: string | null;
  snippet?: string;
  api_endpoint?: string | null;
  sdk_package?: string | null;
  sdk_version?: string | null;
  workflow?: string | null;
  reason?: string;
};

export type ImpactSummary = {
  total_analyses: number;
  by_severity: Record<string, number>;
  recent_analyses: ImpactSummaryItem[];
  affected_repos: number;
};

export type ImpactSummaryItem = {
  id: string;
  repo_id: string;
  provider: string;
  change_type: string;
  severity: string;
  confidence: number;
  detected_at: string;
};

export const getImpactAnalyses = (repoId: string, limit = 50, offset = 0, severity?: string) => {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (severity) q.set("severity", severity);
  return request<{ analyses: ImpactAnalysis[]; total: number }>(`/impact/repos/${repoId}?${q}`);
};

export const getImpactAnalysis = (analysisId: string) =>
  request<ImpactAnalysis>(`/impact/analyses/${analysisId}`);

export const getImpactSummary = (repositoryId?: string) =>
  request<ImpactSummary>(`/impact/summary${repositoryId ? `?repository_id=${encodeURIComponent(repositoryId)}` : ""}`);

export const analyzeChangelogEvent = (changelogEventId: string, repoId: string) =>
  request<ImpactAnalysis>(`/impact/analyze-event`, {
    method: "POST",
    body: JSON.stringify({ changelog_event_id: changelogEventId, repo_id: repoId }),
  });

export const runFireDrill = (repoId: string, provider: string) =>
  request<ImpactAnalysis>(`/impact/fire-drill`, {
    method: "POST",
    body: JSON.stringify({ repo_id: repoId, provider }),
  });

export type FireDrillMatrixRow = {
  provider: string;
  status: "active" | "at_risk" | "unknown" | "inactive";
  usage_detected: boolean;
  recent_events: number;
  latest_event?: string | null;
};

export type FireDrillMatrix = {
  repo_id: string;
  providers: FireDrillMatrixRow[];
  total: number;
  summary: { active: number; at_risk: number; unknown: number; inactive: number };
};

export const fireDrillMatrix = (repoId: string) =>
  request<FireDrillMatrix>(`/impact/fire-drill-matrix`, {
    method: "POST",
    body: JSON.stringify({ repo_id: repoId }),
  });

export const generateImpactFix = (analysisId: string, filePath?: string) =>
  request<{ success: boolean; fixes: ImpactFix[]; message: string }>(`/impact/generate-fix`, {
    method: "POST",
    body: JSON.stringify({ analysis_id: analysisId, file_path: filePath }),
  });

export type ImpactFix = {
  file_path: string;
  old_value: string;
  new_value: string;
  diff: string;
  confidence: number;
  description: string;
};

// ---- API Digital Twin ----
// Simulates real provider changelog events against ONE repository's real
// scanned usage. Static analysis only — labels never claim production is
// failing. affected_file/symbol/line come from real scan evidence; null means
// "evidence not available", never a guess.

export type TwinFinding = {
  api_detection_id?: string | null;
  affected_file?: string | null;
  affected_symbol?: string | null;
  line_number?: number | null;
  usage_context?: string | null;
  explanation?: string | null;
  recommended_change?: string | null;
  severity?: string;      // breaking | high | medium | low | safe | unknown
  confidence?: number;    // 0.0 - 1.0
  impact_status?: string; // NO MATCH | SAFE | POTENTIAL IMPACT | HIGH RISK | BREAKING RISK | UNKNOWN
  matched_fields?: string[];
};

export type TwinRunResponse = {
  run_id?: string | null;
  repository_id: string;
  provider_filter?: string | null;
  events_considered: number;
  analyses_created: number;
  no_match_count: number;
  alerts_created: number;
  email_status?: string;   // sent | failed | skipped_* | not_attempted
  email_detail?: string | null;
  last_simulated_at?: string | null;
  findings: TwinFinding[];
};

export type TwinAnalysis = {
  id: string;
  repository_id: string;
  provider_id: string;
  change_event_id: string;
  impact_status: string;
  severity: string;
  confidence: number;
  affected_file?: string | null;
  affected_symbol?: string | null;
  line_number?: number | null;
  usage_context?: string | null;
  explanation: string;
  recommended_change?: string | null;
  source_url?: string | null;
  api_detection_id?: string | null;
  alert_id?: string | null;
  run_id?: string | null;
  created_at?: string | null;
};

export type TwinSummary = {
  repository_id: string;
  provider_changes: number;
  affected_usages: number;
  potential_breaks: number;
  high_risk: number;
  breaking_risk: number;
  safe: number;
  by_status: Record<string, number>;
  providers: string[];
  last_simulation?: string | null;
  last_run?: Record<string, unknown> | null;
};

export const getTwinSummary = (repoId: string) =>
  request<TwinSummary>(`/digital-twin/${repoId}/summary`);

export const getTwinAnalyses = (repoId: string, limit = 100) =>
  request<TwinAnalysis[]>(`/digital-twin/${repoId}/analyses?limit=${limit}`);

export const runTwinSimulation = (repoId: string, provider?: string, changelogEventId?: string) =>
  request<TwinRunResponse>(`/digital-twin/${repoId}/simulate`, {
    method: "POST",
    body: JSON.stringify({
      provider: provider || null,
      changelog_event_id: changelogEventId || null,
    }),
  });
