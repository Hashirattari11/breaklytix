"""Daily status email: compose once-per-user-per-day and dispatch opt-in sends.

The daily scheduler builds a per-user report (repo rows with rescan outcome +
today's issue counts); this module composes the email and sends exactly one
message per opted-in user (``users.notify_daily_status``) per UTC day.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .config import settings
from .db import db
from .email_service import send_alert_email

DAILY_STATUS_ALERT_TYPE = "daily_status"

# Short human labels for rescan outcome codes (used in HTML + text bodies).
_RESCON_LABELS = {
    "time_budget": "Partial fresh re-scan (daily time budget reached)",
    "no_github_token": "Stored results only (no usable GitHub token)",
    "github_auth": "Stored results only (GitHub authentication failed)",
    "github_error": "Stored results only (GitHub was unreachable)",
    "rescan_exception": "Stored results only (re-scan error)",
    "not_requested": "Stored results only",
    "missing_repo_identity": "Stored results only (repository identity missing)",
}
_DEFAULT_RESCON_LABEL = "Stored results only"


def _rescan_text(rescan: dict | None) -> str:
    """One-line status for a repo's rescan outcome, from the scheduler stat."""
    stat = rescan or {}
    if stat.get("status") == "ok":
        return (
            "Fresh re-scan from GitHub completed — "
            f"{int(stat.get('detections') or 0)} detection(s) "
            f"from {int(stat.get('files_scanned') or 0)} file(s)"
        )
    if stat.get("status") == "ok_partial":
        return (
            "Partial fresh re-scan (daily time budget reached) — "
            f"{int(stat.get('files_scanned') or 0)} file(s) so far"
        )
    return _RESCON_LABELS.get(stat.get("reason") or "", _DEFAULT_RESCON_LABEL)


def compose_daily_status_email(repo_rows: list[dict], day: str) -> tuple[str, str, str]:
    """Return (subject, html, text) for one user's daily status report.

    ``repo_rows`` items: {repo, rescan, breaking_today, code_issues}.
    Pure function — no I/O — so it can be unit-tested in isolation.
    """
    subject = f"Breaklytix daily status — {day}"
    base = (settings.frontend_base_url or "https://breaklytix.site").rstrip("/")
    settings_url = f"{base}/dashboard/settings"

    counted_rows = [
        r for r in repo_rows
        if int(r.get("breaking_today") or 0) > 0 or int(r.get("code_issues") or 0) > 0
    ]
    headline = (
        f"{len(counted_rows)} of {len(repo_rows)} repo(s) have activity that needs attention."
        if repo_rows else "No repositories are connected yet."
    )

    body = (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
        'max-width:620px;margin:0 auto;color:#1a1a2e;">'
        f"<h2 style=\"margin:0 0 8px;\">&#128225; Breaklytix daily status — {day}</h2>"
        f"<p style=\"color:#555;margin:0 0 14px;\">{headline} "
        "Automated daily check at 06:00 UTC (times UTC).</p>"
    )

    if repo_rows:
        body += (
            '<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">'
            "<thead><tr style=\"text-align:left;color:#555;border-bottom:1px solid #e5e7eb;\">"
            "<th style=\"padding:6px 8px 6px 0;\">Repository</th>"
            "<th style=\"padding:6px 8px;\">Scan</th>"
            "<th style=\"padding:6px 8px;\">Breaking today</th>"
            "<th style=\"padding:6px 8px;\">Code issues</th>"
            "</tr></thead><tbody>"
        )
        text_lines = []
        for r in repo_rows:
            breaking = int(r.get("breaking_today") or 0)
            code = int(r.get("code_issues") or 0)
            scan_text = _rescan_text(r.get("rescan"))
            breaking_cell = (
                f"<strong style=\"color:#b00020\">{breaking}</strong>" if breaking else "0"
            )
            code_cell = f"<strong style=\"color:#92400e\">{code}</strong>" if code else "0"
            body += (
                "<tr style=\"border-bottom:1px solid #f1f1f4;\">"
                f"<td style=\"padding:8px 8px 8px 0;vertical-align:top;\">{r.get('repo') or 'unknown'}</td>"
                f"<td style=\"padding:8px;color:#555;vertical-align:top;\">{scan_text}</td>"
                f"<td style=\"padding:8px;vertical-align:top;\">{breaking_cell}</td>"
                f"<td style=\"padding:8px;vertical-align:top;\">{code_cell}</td>"
                "</tr>"
            )
            text_lines.append(
                f"- {r.get('repo') or 'unknown'} | {scan_text} | breaking today: {breaking} | code issues: {code}"
            )
        body += "</tbody></table>"
        text = "\n".join(
            [
                f"Breaklytix daily status — {day}",
                "",
                headline,
                "Automated daily check at 06:00 UTC (times UTC).",
                "",
            ]
            + text_lines
            + ["", f"Change this in Settings: {settings_url}"]
        )
    else:
        body += (
            '<p style="color:#555;">Connect a repository to receive daily scan '
            f"results here. <a href=\"{base}/dashboard/repos\" style=\"color:#4338ca;\">Connect a repo</a>."
            "</p>"
        )
        text = "\n".join(
            [
                f"Breaklytix daily status — {day}",
                "",
                headline,
                "",
                f"Connect a repo: {base}/dashboard/repos",
                f"Change this in Settings: {settings_url}",
            ]
        )

    body += (
        '<p style="color:#888;font-size:12px;margin:18px 0 0;">You receive this because the '
        'daily status email is enabled for your account. '
        f"<a href=\"{settings_url}\" style=\"color:#555;\">Change this in Settings</a>."
        "</p></div>"
    )
    return subject, body, text


def _daily_status_already_sent(user_id: str, day: str) -> bool:
    """True if a daily_status email was recorded for this user earlier today.

    send_alert_email's fingerprint dedup only spans ~1h, so a same-day check
    makes the "exactly one per day" promise real. A lookup failure must not
    double-send and must not block a legitimate send either, so it fails open
    (False) — schedule + fingerprint dedup still bound the volume.
    """
    try:
        rows = (
            db().table("email_deliveries")
            .select("id")
            .eq("user_id", user_id)
            .eq("alert_type", DAILY_STATUS_ALERT_TYPE)
            .in_("status", ["sent", "queued"])
            .gte("created_at", day)
            .limit(1)
            .execute()
        ).data or []
        return bool(rows)
    except Exception:
        return False


def send_daily_status_reports(reports: dict[str, dict]) -> dict:
    """Send the daily status email to every opted-in user who has repos.

    ``reports`` maps user_id -> {"email": str, "notify": bool, "repos": [rows]}.
    Returns {"sent": n, "skipped": n, "failed": n} for the run summary.
    """
    today = datetime.now(timezone.utc).date().isoformat()
    sent = skipped = failed = 0
    for user_id, report in (reports or {}).items():
        if not report.get("notify"):
            continue  # Daily-status flag off — user did not opt in.
        recipient = (report.get("email") or "").strip()
        if not recipient:
            continue
        try:
            subject, html, text = compose_daily_status_email(report.get("repos") or [], today)
        except Exception as exc:  # noqa: BLE001
            print(f"Error composing daily status email for {user_id}: {exc}")
            failed += 1
            continue
        if _daily_status_already_sent(user_id, today):
            skipped += 1
            continue
        try:
            outcome = send_alert_email(
                user_id=user_id,
                recipient=recipient,
                alert_type=DAILY_STATUS_ALERT_TYPE,
                subject=subject,
                html=html,
                text=text,
                # Not a burst alert: one scheduled summary per day, guarded on
                # its own by _daily_status_already_sent. The 5/day alert cap
                # must not block the scheduled status email.
                enforce_daily_cap=False,
                fingerprint=f"daily_status:{user_id}:{today}",
            )
        except Exception as exc:  # noqa: BLE001
            print(f"Error sending daily status email for {user_id}: {exc}")
            failed += 1
            continue
        status = (outcome or {}).get("status")
        if outcome.get("ok") and status == "sent":
            sent += 1
        elif status == "skipped" or outcome.get("skipped_duplicate"):
            skipped += 1
        else:
            failed += 1
    return {"sent": sent, "skipped": skipped, "failed": failed}
