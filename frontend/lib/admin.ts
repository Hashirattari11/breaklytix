// Typed admin API helpers (admin-only endpoints under /admin/*).
import { request } from "./api";

export type AdminOverview = {
  total_users: number;
  total_repos: number;
  alerts_sent: number;
  alerts_pending: number;
  alerts_dismissed: number;
  test_alerts_sent: number;
  providers_monitored: number;
  providers_planned: number;
};

export type PendingAlert = {
  id: string;
  repo_id?: string | null;
  repo_name?: string | null;
  provider?: string | null;
  api_name?: string | null;
  customer_email?: string | null;
  confidence?: string | null;
  severity?: string | null;
  severity_reason?: string | null;
  evidence?: string | null;
  subject?: string | null;
  preview?: string | null;
  created_at?: string | null;
};

export type PendingAlertsResponse = {
  alerts: PendingAlert[];
};

export type ApproveRejectResponse = {
  ok: boolean;
  email_sent?: boolean;
  alert_id?: string;
  status?: string;
};

export type HealthRow = {
  id?: string;
  job_name: string;
  status: string;
  duration_ms?: number | null;
  error_message?: string | null;
  ran_at?: string | null;
};

export type AdminHealthResponse = {
  rows: HealthRow[];
};

export type AdminUser = {
  id: string;
  email: string;
  github_login?: string | null;
  plan?: string | null;
  is_admin?: boolean;
  is_agency?: boolean;
  created_at?: string | null;
  is_suspended?: boolean;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  repository_count?: number;
  repositories?: AdminRepository[];
};

export type AdminRepository = {
  id: string;
  user_id?: string | null;
  full_name: string;
  default_branch?: string | null;
  connected_at?: string | null;
  last_scanned_at?: string | null;
};

export type AdminUsersResponse = {
  users: AdminUser[];
  /** True when the DB is missing admin columns (migration not yet applied);
   * the list is served from base columns with defaulted admin fields. */
  schema_degraded?: boolean;
  degraded_reason?: string;
};

export const getAdminOverview = () => request<AdminOverview>("/admin/overview");

export const getPendingAlerts = () => request<PendingAlertsResponse>("/admin/alerts/pending");

export const approveAlert = (id: string) =>
  request<ApproveRejectResponse>(`/admin/alerts/${id}/approve`, { method: "POST" });

export const rejectAlert = (id: string) =>
  request<ApproveRejectResponse>(`/admin/alerts/${id}/reject`, { method: "POST" });

export const getAdminHealth = () => request<AdminHealthResponse>("/admin/health");

export const getAdminUsers = (search?: string, status?: "active" | "suspended") => {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  if (status) params.set("status", status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<AdminUsersResponse>(`/admin/users${suffix}`);
};

export const updateAdminUserStatus = (id: string, suspended: boolean, reason?: string) =>
  request<{ ok: boolean; user: AdminUser }>(`/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ suspended, reason: reason?.trim() || null }),
  });

export const updateAdminUserPlan = (id: string, plan: string) =>
  request<{ ok: boolean; user: AdminUser }>(`/admin/users/${id}/plan`, {
    method: "PATCH",
    body: JSON.stringify({ plan }),
  });

export const disconnectAdminRepository = (id: string) =>
  request<void>(`/admin/repos/${id}`, { method: "DELETE" });
