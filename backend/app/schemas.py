"""Pydantic request/response models for the API surface."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ---- Auth ------------------------------------------------------------------
class GitHubCallbackIn(BaseModel):
    code: str = Field(..., description="Temporary OAuth code from GitHub")
    redirect_uri: str | None = Field(
        default=None, description="Must match the redirect_uri used to start OAuth"
    )
    scan_id: str | None = Field(
        default=None, max_length=64, description="Instant scan to link to the signed-up user (post-scan sign-up flow)"
    )


class UserOut(BaseModel):
    id: str
    email: str
    github_login: str | None = None
    plan: str = "free"
    is_admin: bool = False
    is_agency: bool = False
    notify_daily_status: bool = False
    # Legal consent (master pass §2). NULL = never accepted → client shows
    # the one-time gate. consent_required is the server-computed flag.
    privacy_policy_version: str | None = None
    terms_version: str | None = None
    legal_consent_accepted_at: datetime | None = None
    consent_required: bool = False


class ConsentIn(BaseModel):
    """Body for POST /auth/consent — the versions the user is agreeing to."""
    privacy_policy_version: str = Field(
        ..., min_length=1, description="Privacy policy version the user agrees to (e.g. 2026-09-10)"
    )
    terms_version: str = Field(
        ..., min_length=1, description="Terms of service version the user agrees to (e.g. 2026-09-10)"
    )


class AuthOut(BaseModel):
    token: str = Field(..., description="Session JWT — send as `Authorization: Bearer <token>`")
    user: UserOut


# ---- Repos -----------------------------------------------------------------
class RepoConnectIn(BaseModel):
    github_repo_id: str
    full_name: str
    default_branch: str = "main"


class RepoOut(BaseModel):
    id: str
    github_repo_id: str
    full_name: str
    default_branch: str
    connected_at: datetime | None = None
    last_scanned_at: datetime | None = None


class GitHubRepoOut(BaseModel):
    """A repo as returned by GitHub (for the 'connect a repo' picker)."""
    github_repo_id: str
    full_name: str
    default_branch: str
    private: bool


class ScanResultOut(BaseModel):
    repo_id: str
    files_scanned: int
    detections_found: int
    apis_detected: list[str]
    last_scanned_at: datetime | None = None
    # Non-blocking plan-limit feedback: a scan always succeeds and stores ALL
    # detections; these fields tell the UI whether monitoring is capped.
    plan_limit_exceeded: bool = False
    plan_warning: str | None = None
    new_apis_detected: int = 0
    monitoring_limit: int | None = None


# ---- Detections (dashboard) ------------------------------------------------
class DetectionOut(BaseModel):
    id: str
    api_name: str
    file_path: str
    line_number: int | None = None
    matched_snippet: str | None = None
    detected_at: datetime | None = None


class ApiFootprintGroup(BaseModel):
    api_name: str
    status: str  # 'monitored' | 'planned' | 'coming_soon' | 'unsupported'
    detection_count: int
    file_count: int
    detections: list[DetectionOut]
    category: str | None = None  # Phase A: provider category


class DetectionsOut(BaseModel):
    repo: RepoOut
    footprint: list[ApiFootprintGroup]


# ---- Alerts (dashboard) ----------------------------------------------------
class AlertOut(BaseModel):
    id: str
    change_type: str
    description: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    source_url: str | None = None
    file_path: str | None = None
    line_number: int | None = None
    email_sent: bool = False
    sent_at: datetime | None = None
    created_at: datetime | None = None
    severity: str = "medium"
    severity_reason: str | None = None
    provider: str | None = None
    status: str | None = None
    is_test: bool = False
    read_at: datetime | None = None  # NULL => unread, set => read (alert lifecycle)


class AlertWithRepoOut(AlertOut):
    """AlertOut plus the repo it belongs to, for the cross-repo Alerts dashboard."""
    repo_id: str
    repo_name: str


class AlertStatusUpdateIn(BaseModel):
    """User-level alert triage: 'resolved' or 'ignored' (Alerts dashboard actions)."""
    status: str


class MarkAlertsReadIn(BaseModel):
    """Mark specific alerts as read (alert lifecycle). Empty/missing = all owned."""
    alert_ids: list[str] | None = Field(default=None, max_length=500)


class MarkAlertsReadOut(BaseModel):
    """How many alerts were newly marked read by the mark-read operation."""
    updated: int


class SimulatedAlertLocation(BaseModel):
    """Where a simulated breaking-change matched in the repo's code."""
    file_path: str
    line_number: int | None = None
    matched_snippet: str | None = None


class SimulateBreakingChangeOut(BaseModel):
    """Result of the 'Simulate Breaking Change' dashboard action (Phase 1)."""
    api_name: str
    change_type: str
    old_value: str | None = None
    new_value: str | None = None
    severity: str
    severity_reason: str
    matched_count: int
    locations: list[SimulatedAlertLocation]
    alert_created: bool
    alert_id: str | None = None
    email_sent: bool
    email_detail: str | None = None
    is_test: bool = True


# ---- Internal endpoints ----------------------------------------------------
class ScrapeResultOut(BaseModel):
    fetched_entries: int
    new_events: int
    source_url: str


class ProcessResultOut(BaseModel):
    events_processed: int
    alerts_created: int
    emails_sent: int
    emails_failed: int


# ---- Billing (Phase 3) ------------------------------------------------------
class CheckoutSessionIn(BaseModel):
    plan: str = Field(..., description="Plan key: 'starter', 'growth', 'enterprise'")
    success_url: str = Field(..., description="Frontend URL to redirect after successful checkout")
    cancel_url: str = Field(..., description="Frontend URL to redirect if checkout cancelled")


class CheckoutSessionOut(BaseModel):
    session_id: str
    url: str


class BillingPortalOut(BaseModel):
    url: str


class BillingStatusOut(BaseModel):
    plan: str                     # 'trial', 'starter', 'growth', 'enterprise'
    plan_status: str              # 'trial', 'active', 'past_due', 'canceled'
    monitored_api_limit: int      # -1 for unlimited
    monitored_api_count: int      # current usage
    current_period_end: str | None = None
    cancel_at_period_end: bool = False


# ---- Fixes / Review UI (Phase 3) --------------------------------------------
class FixOut(BaseModel):
    id: str
    repo_id: str
    fix_rule_id: str
    file_path: str
    diff_preview: str
    pr_url: str | None = None
    pr_number: int | None = None
    status: str                   # 'pending' | 'needs_review' | 'pr_created' | 'merged' | 'rejected'
    created_at: str | None = None
    updated_at: str | None = None
    # Joined rule info for display
    rule_title: str | None = None
    rule_description: str | None = None
    rule_confidence: str | None = None
    rule_old_value: str | None = None
    rule_new_value: str | None = None
    rule_source_url: str | None = None


class FixesListOut(BaseModel):
    fixes: list[FixOut]


class FixActionIn(BaseModel):
    pass  # Empty body for approve/dismiss


class FixActionOut(BaseModel):
    fix_id: str
    status: str
    pr_url: str | None = None
    message: str


# ---- Scans / Findings / PRs (Phase 10 build-out) -----------------------------
class ScanStats(BaseModel):
    files_scanned: int = 0
    files_skipped: int = 0
    findings_total: int = 0
    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_provider: dict[str, int] = {}
    language: str | None = None
    package_manager: str | None = None


class ScanOut(BaseModel):
    id: str
    repo_id: str
    status: str  # QUEUED | SCANNING | ANALYZING | FIXING | VALIDATING | CREATING_PR | COMPLETED | FAILED
    scan_type: str = "full"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
    stats: ScanStats | None = None
    created_at: datetime | None = None


class ScansListOut(BaseModel):
    scans: list[ScanOut]


class FindingOut(BaseModel):
    """Normalized finding format (user spec): a single actionable API issue."""
    id: str
    scan_id: str | None = None
    repo_id: str
    severity: str  # critical | high | medium | low | info
    type: str      # deprecated | removed | endpoint_changed | method_changed | param_removed | auth_changed | version_major_bump | http_client | api_usage | advisory | ...
    provider: str | None = None
    file: str
    line: int | None = None
    message: str
    current_usage: str | None = None
    recommended_fix: str | None = None
    confidence: float | None = None  # 0.0 - 1.0
    status: str = "open"  # open | fixed | dismissed
    verification_status: str | None = None  # detected | potential | verified | false_positive | unknown | resolved
    evidence_url: str | None = None
    tech: str | None = None
    rule_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FindingsListOut(BaseModel):
    findings: list[FindingOut]


class FindingUpdateIn(BaseModel):
    status: str | None = None  # open | fixed | dismissed
    verification_status: str | None = None  # detected | potential | verified | false_positive | unknown | resolved
    evidence_url: str | None = None


class PullRequestOut(BaseModel):
    id: str
    repo_id: str
    fix_id: str | None = None
    number: int | None = None
    url: str | None = None
    title: str | None = None
    base_branch: str | None = None
    head_branch: str | None = None
    status: str = "open"
    created_at: datetime | None = None


class PRsListOut(BaseModel):
    pull_requests: list[PullRequestOut]


class FixCreateIn(BaseModel):
    finding_id: str


class FixCreateOut(BaseModel):
    fix: FixOut
    finding: FindingOut
    pr_url: str | None = None
    ai_status: str = "disabled"  # disabled | success | failed


class DashboardStatsOut(BaseModel):
    repos: int = 0
    scans_total: int = 0
    scans_completed: int = 0
    findings_by_severity: dict[str, int] = {}
    findings_total: int = 0
    findings_open: int = 0
    fixes_created: int = 0
    prs_created: int = 0
    alerts_pending: int = 0
    providers_monitored: int = 0
    providers_planned: int = 0
    monitored_api_count: int = 0
    last_scan_at: datetime | None = None


class RepoHealthOut(BaseModel):
    repo_id: str
    full_name: str
    default_branch: str
    last_scan_at: datetime | None = None
    scan_count: int = 0
    findings_total: int = 0
    findings_open: int = 0
    findings_by_severity: dict[str, int] = {}
    fixes_created: int = 0
    prs_created: int = 0
    health_score: int = 0  # 0-100
