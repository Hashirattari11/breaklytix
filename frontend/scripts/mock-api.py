"""Local mock of the Breaklytix backend for UI width audits (dev only).

Serves worst-case fixtures (very long severity reasons, long file paths, long
repo names) on http://localhost:8000 so every dashboard page renders real
tables without touching production. Not imported by the app; run manually:

    python scripts/mock-api.py
"""
from __future__ import annotations

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

NOW = "2026-10-12T09:30:00Z"

REPO_ID = "11111111-1111-1111-1111-111111111111"
REPO_NAME = "Hashirattari11/Founder-hub-platform-monorepo"

LONG_REASON = (
    "Critical — A provider secret/API key pattern appears directly in source. "
    "If this is committed, attackers can replay it against the provider API, "
    "exhaust quota, incur billing charges and pivot to customer data."
)

REPOS = [
    {
        "id": REPO_ID,
        "github_repo_id": "900001",
        "full_name": REPO_NAME,
        "default_branch": "main",
        "connected_at": NOW,
        "last_scanned_at": NOW,
    },
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "github_repo_id": "900002",
        "full_name": "Hashirattari11/legacy-billing-integration-service-v2",
        "default_branch": "master",
        "connected_at": NOW,
        "last_scanned_at": NOW,
    },
]

ALERTS = [
    {
        "id": "a1",
        "repo_id": REPO_ID,
        "repo_name": REPO_NAME,
        "change_type": "provider_problem",
        "severity": "critical",
        "severity_reason": LONG_REASON,
        "description": "Possible hardcoded API secret",
        "source_url": "https://example.com/changelog",
        "file_path": "frontend/src/features/billing/providers/stripe/webhooks/verify-signature-env-loader.ts",
        "line_number": 33,
        "email_sent": False,
        "created_at": NOW,
        "status": "open",
        "read_at": None,
        "is_test": False,
    },
    {
        "id": "a2",
        "repo_id": "22222222-2222-2222-2222-222222222222",
        "repo_name": "Hashirattari11/legacy-billing-integration-service-v2",
        "change_type": "breaking_change",
        "severity": "high",
        "severity_reason": "Removed response field consumed by downstream mapper",
        "description": "Pagination cursor renamed from after_token to starting_after",
        "source_url": None,
        "file_path": "services/sync/pagination/cursor.ts",
        "line_number": 12,
        "email_sent": True,
        "created_at": NOW,
        "status": "open",
        "read_at": NOW,
        "is_test": False,
    },
]

ISSUES = [
    {
        "id": "i1",
        "provider": "stripe",
        "repo_id": REPO_ID,
        "repo_name": REPO_NAME,
        "repo_full_name": REPO_NAME,
        "category": "security",
        "severity": "critical",
        "status": "open",
        "confidence": 0.97,
        "title": "Possible hardcoded API secret in provider config",
        "description": LONG_REASON,
        # Mirrors what the backend's redact() actually returns, so the mock
        # exercises the "already redacted" display path. Deliberately NOT a
        # live-key-shaped literal: a real-looking sk_live_ fixture trips
        # GitHub push protection on every push.
        evidence: sk_live_[REDACTED],
        "file": "frontend/src/features/billing/providers/stripe/webhooks/verify-signature-env-loader.ts",
        "line": 33,
        "source": "pattern-scan",
        "recommended_action": "Rotate the key in the provider dashboard and load it from an environment variable.",
        "auto_fix_available": True,
        "created_at": NOW,
        "risk_level": "high",
        "risk_score": 92,
        "risk_factors": ["secret-in-source", "live-key"],
    },
    {
        "id": "i2",
        "provider": "github",
        "repo_id": REPO_ID,
        "repo_name": REPO_NAME,
        "repo_full_name": REPO_NAME,
        "category": "deprecated",
        "severity": "high",
        "status": "open",
        "confidence": 0.81,
        "title": "Deprecated REST endpoint still used by sync worker",
        "description": "GET /repos/:owner/:repo/import authors endpoint was removed in API version 2026-04; migrate to the GraphQL importer.",
        "evidence": "api.github.com/repos/%s/import/authors" % REPO_NAME,
        "file": "services/sync/github/import-authors.ts",
        "line": 87,
        "source": "changelog-monitor",
        "recommended_action": "Switch the call to GraphQL importer mutations.",
        "auto_fix_available": False,
        "created_at": NOW,
        "risk_level": "medium",
        "risk_score": 54,
        "risk_factors": ["deprecated-endpoint"],
    },
]

EVENTS = [
    {
        "id": "e1",
        "api_name": "stripe",
        "title": "Stripe webhooks: signature verification header renamed for 2026-10 API revision",
        "change_type": "breaking_change",
        "severity": "high",
        "confidence": "high",
        "review_state": "unreviewed",
        "source_url": "https://example.com/changelog",
        "detected_at": NOW,
        "first_seen_at": NOW,
    },
    {
        "id": "e2",
        "api_name": "github",
        "title": "GitHub REST import authors endpoint removed; GraphQL importer is now required",
        "change_type": "deprecation",
        "severity": "medium",
        "confidence": "medium",
        "review_state": "reviewed",
        "source_url": None,
        "detected_at": NOW,
        "first_seen_at": NOW,
    },
]

PROVIDERS = [
    {"provider": p, "display_name": p.title(), "category": "payments" if p == "stripe" else "code",
     "monitoring_enabled": True, "monitoringEnabled": True, "has_detections": True, "hasDetections": True}
    for p in ["stripe", "github", "twilio", "sendgrid", "openai", "plaid", "pusher", "mongodb"]
]


def _mark_alerts_read():
    updated = 0
    for alert in ALERTS:
        if not alert.get("read_at"):
            alert["read_at"] = NOW
            updated += 1
    return {"updated": updated}


def stats():
    return {
        "repos": len(REPOS),
        "scans_total": 41,
        "scans_completed": 39,
        "findings_by_severity": {"critical": 1, "high": 2, "medium": 3, "low": 1},
        "findings_total": 7,
        "findings_open": 5,
        "fixes_created": 4,
        "prs_created": 2,
        "alerts_pending": len(ALERTS),
        "providers_monitored": 8,
        "providers_planned": 15,
        "monitored_api_count": 8,
        "last_scan_at": NOW,
    }


ROUTES = {
    r"^/auth/consent-status$": lambda m: {
        "id": "u1", "email": "audit@example.com", "github_login": "auditor",
        "plan": "pro", "is_admin": False, "consent_required": False,
    },
    r"^/repos$": lambda m: REPOS,
    r"^/repos/github$": lambda m: REPOS,
    r"^/repos/dashboard/stats$": lambda m: stats(),
    r"^/repos/alerts$": lambda m: ALERTS,
    r"^/repos/alerts/read$": lambda m: _mark_alerts_read(),
    r"^/repos/alerts/[^/]+$": lambda m: ALERTS[0],
    r"^/health/provider-connections$": lambda m: {
        "connections": [
            {"provider": "stripe", "connected_at": NOW, "has_key": True, "last_error": None},
            {"provider": "twilio", "connected_at": NOW, "has_key": True,
             "last_error": "HTTP 429 rate limited by provider for the last 14 consecutive probes"},
        ],
    },
    r"^/health/errors$": lambda m: {"total": 2, "critical": 1, "high": 1, "errors": ISSUES},
    r"^/health/failures$": lambda m: {"total": 1, "customer_code": 1, "provider_incident": 0, "failures": ISSUES[:1]},
    r"^/health/anomalies$": lambda m: {"total": 0, "critical": 0, "high": 0, "anomalies": []},
    r"^/health/incidents$": lambda m: {
        "total": 1,
        "incidents": [{
            "id": "inc1", "provider": "twilio", "title": "Elevated error rates in SMS delivery (us1)",
            "status": "investigating", "started_at": NOW, "resolved_at": None,
            "impact": "Outbound SMS delayed up to 20 minutes in the us1 region",
            "source_url": "https://status.example.com",
        }],
    },
    r"^/health/overview$": lambda m: {
        "score": 82, "status": "healthy", "repos": len(REPOS), "integrations": 2,
        "providers": [], "issues": {"critical": 1, "high": 1, "medium": 3},
    },
    r"^/health/issues$": lambda m: ISSUES,
    r"^/internal/changelog/events$": lambda m: {"events": EVENTS},
    r"^/internal/changelog/monitoring$": lambda m: {"providers": PROVIDERS},
    r"^/internal/changelog/notices$": lambda m: {"notices": []},
    r"^/notifications/preferences$": lambda m: {
        "preferences": {"breaking_changes": True, "security": True, "daily_status": False, "incidents": True},
        "notify_daily_status": False,
    },
    r"^/notifications/test-email$": lambda m: {"sent": True},
    r"^/notifications/daily-status$": lambda m: {"sent": True},
    r"^/billing/status$": lambda m: {
        "plan": "pro", "plan_status": "active", "monitored_api_limit": 50,
        "monitored_api_count": 8, "current_period_end": "2026-11-01T00:00:00Z",
        "cancel_at_period_end": False,
    },
    r"^/impact/summary$": lambda m: {
        "total_analyses": 3,
        "by_severity": {"critical": 1, "high": 1, "medium": 1},
        "recent_analyses": [
            {"id": "im1", "repo_id": REPO_ID, "provider": "stripe", "change_type": "breaking_change",
             "severity": "critical", "confidence": 0.94, "detected_at": NOW},
        ],
        "affected_repos": 1,
    },
    r"^/impact/repos/[^/]+$": lambda m: {"analyses": [], "total": 0},
    r"^/repos/[^/]+/detections$": lambda m: {
        "repo": REPOS[0],
        "footprint": [{
            "api_name": "stripe",
            "files": ["frontend/src/features/billing/providers/stripe/webhooks/verify-signature-env-loader.ts"],
            "file_count": 1, "detection_count": 3, "status": "monitored",
        }],
    },
    r"^/repos/[^/]+/alerts$": lambda m: ALERTS,
    r"^/repos/[^/]+/fixes$": lambda m: {"fixes": []},
    r"^/repos/[^/]+/provider-coverage$": lambda m: [
        {"provider": "stripe", "display_name": "Stripe", "category": "payments",
         "monitoringEnabled": True, "hasDetections": True},
    ],
    r"^/repos/[^/]+/scan-summary$": lambda m: {
        "apis_detected": 1, "files_scanned": 120, "last_scan_at": NOW, "status": "clear",
    },
    r"^/repos/[^/]+/code-health$": lambda m: ISSUES,
    r"^/repos/[^/]+/daily-scans$": lambda m: [{
        "id": "ds1", "ran_at": NOW, "changelog_check_status": "clear", "code_check_status": "clear",
        "changelog_findings": 0, "code_findings": 2,
    }],
    r"^/repos/[^/]+/scans$": lambda m: {"scans": []},
    r"^/health/repo/[^/]+/usage-graph$": lambda m: {"integrations": {}},
    r"^/digital-twin/[^/]+/summary$": lambda m: {
        "simulations": 0, "analyses": 0, "last_simulation_at": None,
    },
    r"^/digital-twin/[^/]+/analyses$": lambda m: [],
    r"^/agency/status$": lambda m: {"clients": [], "is_agency": False},
    r"^/agency/clients$": lambda m: [],
    r"^/slack/connection$": lambda m: {"connected": False},
    r"^/admin/overview$": lambda m: {
        "users": 1, "repos": len(REPOS), "alerts": len(ALERTS), "plan_breakdown": {"pro": 1},
    },
    r"^/admin/users$": lambda m: {"users": []},
    r"^/admin/alerts/pending$": lambda m: {"alerts": []},
    r"^/admin/health$": lambda m: {"runs": []},
}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization,content-type,x-internal-secret")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quiet
        pass

    def _handle(self):
        path = urlparse(self.path).path
        if path == "/repos/alerts/read" and self.command != "PATCH":
            pass
        for pattern, fn in ROUTES.items():
            if re.match(pattern, path):
                return self._send(200, fn(None))
        # Safe defaults so unknown pages don't explode.
        if path.startswith("/repos/") or path.endswith(("s", "/list")):
            return self._send(200, [])
        return self._send(200, {})

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_PATCH(self):
        self._handle()

    def do_PUT(self):
        self._handle()

    def do_DELETE(self):
        self._handle()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
