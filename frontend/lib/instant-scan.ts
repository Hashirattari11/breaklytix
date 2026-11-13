// Public client for the anonymous Instant Repo Scan API.
//
// Deliberately independent of lib/api.ts: that module attaches the dashboard
// session token, while these endpoints are anonymous and must never send one.

import { SITE_URL } from "./site";

export const SCAN_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://backend-virid-ten-43.vercel.app";

export type ScanConfidence = "high" | "medium" | "low";

export type ScanEvidenceFile = {
  path: string;
  lines: number[];
  evidence: string[];
};

export type ScanProvider = {
  api_name: string;
  name: string;
  category: string;
  status: "monitored" | "planned" | "coming_soon" | "unsupported";
  confidence: ScanConfidence;
  evidence_count: number;
  file_count: number;
  files: ScanEvidenceFile[];
};

export type ScanRisk = {
  api_name: string;
  provider_name: string;
  title: string;
  description?: string | null;
  change_type: string;
  confidence: ScanConfidence;
  published_at?: string | null;
  source_url?: string | null;
  matched_fields: string[];
  wording: string;
};

export type ScanHealthFinding = {
  id: string;
  category: string;
  severity: "high" | "medium" | "low" | "info";
  title: string;
  explanation: string;
  file_path?: string | null;
  line_number?: number | null;
  service?: string | null;
  suggested_action: string;
  confidence: string;
  evidence?: string | null;
  advisory_id?: string | null;
  fixed_version?: string | null;
  advisory_url?: string | null;
  package?: string | null;
  installed_version?: string | null;
  ecosystem?: string | null;
};

export type ScanHealth = {
  score: number;
  findings: ScanHealthFinding[];
  summary: {
    total: number;
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
  };
  disclaimer: string;
};

export type ScanResult = {
  repo: string;
  repo_url: string;
  default_branch?: string;
  commit_sha?: string | null;
  scanned_at: string;
  duration_ms: number;
  partial: boolean;
  partial_reason?: string | null;
  files_considered: number;
  files_scanned: number;
  files_by_type?: Record<string, number> | null;
  files_skipped?: Array<{ reason: string; count: number; description: string }> | null;
  services?: Array<{ path: string; name: string; file_count: number }> | null;
  providers: ScanProvider[];
  risks: ScanRisk[];
  summary: {
    provider_count: number;
    integration_count: number;
    possible_risk_count: number;
    code_files?: number;
    config_files?: number;
    docs_files?: number;
    other_files?: number;
    skipped_count?: number;
  };
  no_risk_message?: string | null;
  no_integrations_message?: string | null;
  error_message?: string | null;
  health?: ScanHealth | null;
};

export type InstantScanPayload = {
  scan_id: string;
  cached: boolean;
  cached_at?: string | null;
  result: ScanResult;
};

export type StoredScan = {
  id: string;
  repo_full_name: string;
  created_at: string;
  email_captured: boolean;
  partial: boolean;
  result: ScanResult;
};

export type ScanStatus = {
  scan_id: string;
  repo_full_name?: string | null;
  status: "queued" | "scanning" | "completed" | "failed" | string;
  progress_step?: string | null;
  progress_message?: string | null;
  commit_sha?: string | null;
  partial?: boolean;
  duration_ms?: number | null;
  files_by_type?: Record<string, number> | null;
  files_skipped?: Array<{ reason: string; count: number; description: string }> | null;
  error_message?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  result?: ScanResult | null;
};

export class InstantScanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InstantScanError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
  } catch {
    /* fall through */
  }
  if (res.status === 429) return "Too many scans from this address. Try again in a little while.";
  if (res.status === 404) return "That repository could not be scanned. It may be private or unavailable.";
  return "Something went wrong while scanning. Please try again.";
}

export async function startInstantScan(repoUrl: string): Promise<InstantScanPayload> {
  const res = await fetch(`${SCAN_API_BASE}/api/instant-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_url: repoUrl }),
    cache: "no-store",
  });
  if (!res.ok) throw new InstantScanError(await parseError(res), res.status);
  return (await res.json()) as InstantScanPayload;
}

export async function getInstantScan(scanId: string): Promise<StoredScan | null> {
  const res = await fetch(`${SCAN_API_BASE}/api/instant-scan/${encodeURIComponent(scanId)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new InstantScanError(await parseError(res), res.status);
  return (await res.json()) as StoredScan;
}

export async function getScanStatus(scanId: string): Promise<ScanStatus | null> {
  const res = await fetch(`${SCAN_API_BASE}/api/scan-status/${encodeURIComponent(scanId)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new InstantScanError(await parseError(res), res.status);
  return (await res.json()) as ScanStatus;
}

export async function retryScan(scanId: string): Promise<void> {
  await fetch(`${SCAN_API_BASE}/api/scan-status/${encodeURIComponent(scanId)}/retry`, {
    method: "POST",
    cache: "no-store",
  });
}

export async function captureScanEmail(scanId: string, email: string): Promise<{ ok: boolean; email_sent: boolean }> {
  const res = await fetch(
    `${SCAN_API_BASE}/api/instant-scan/${encodeURIComponent(scanId)}/email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new InstantScanError(await parseError(res), res.status);
  return (await res.json()) as { ok: boolean; email_sent: boolean };
}

/** Fire-and-forget funnel event (share / badge copy / sign-up). Never blocks the UI. */
export function recordScanEvent(
  event: "share_clicked" | "badge_copied" | "email_submitted" | "github_signup_clicked" | "github_signup_completed" | "report_copied",
  scanId?: string,
  repoFullName?: string,
  props?: Record<string, string | number | boolean>,
): void {
  try {
    void fetch(`${SCAN_API_BASE}/api/instant-scan/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, scan_id: scanId, repo_full_name: repoFullName, props }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    /* analytics must never break the page */
  }
}

export function badgeSvgUrl(repoFullName: string): string {
  const [owner, repo] = repoFullName.split("/");
  return `${SITE_URL}/badge/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.svg`;
}

export function badgeMarkdown(repoFullName: string, scanId: string): string {
  const image = badgeSvgUrl(repoFullName);
  return `[![API watch | Breaklytix](${image})](${SITE_URL}/scan/${scanId})`;
}
