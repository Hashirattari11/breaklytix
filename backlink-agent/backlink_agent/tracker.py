"""Step 8 - the single source of truth: data/prospects.csv.

Status flow:
    found -> scored -> drafted -> sent -> replied
                                  \\-> no_response
    any -> dropped (below score threshold, blocked, or manually excluded)
    sent/replied -> link_live -> link_lost (weekly checker)

Nothing writes to this file except Tracker, so dedupe and counters cannot drift.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .config import Config
from .log import Log
from .util import atomic_write_text, iso, parse_iso

FIELDS = [
    "domain", "url", "title", "score", "status", "opportunity", "source", "evidence",
    "contact_email", "contact_source", "contact_kind",
    "first_seen", "last_scored", "drafted_at", "sent_at", "followup_at", "replied_at",
    "link_url", "link_rel", "link_status", "link_checked_at", "notes",
]

STATUSES = {
    "found", "scored", "dropped", "drafted", "sent", "replied",
    "no_response", "link_live", "link_lost", "blocked",
}


@dataclass
class Row:
    domain: str
    url: str = ""
    title: str = ""
    score: str = ""
    status: str = "found"
    opportunity: str = ""
    source: str = ""
    evidence: str = ""
    contact_email: str = ""
    contact_source: str = ""
    contact_kind: str = ""
    first_seen: str = ""
    last_scored: str = ""
    drafted_at: str = ""
    sent_at: str = ""
    followup_at: str = ""
    replied_at: str = ""
    link_url: str = ""
    link_rel: str = ""
    link_status: str = ""
    link_checked_at: str = ""
    notes: str = ""


class Tracker:
    def __init__(self, cfg: Config, log: Log) -> None:
        self.cfg = cfg
        self.log = log
        self.path = cfg.prospects_path
        self.rows: dict[str, dict] = {}
        self.load()

    # -- persistence ---------------------------------------------------------
    def load(self) -> None:
        self.rows = {}
        if not self.path.exists():
            return
        try:
            text = self.path.read_text(encoding="utf-8-sig")
            for row in csv.DictReader(io.StringIO(text)):
                domain = (row.get("domain") or "").strip().lower()
                if not domain:
                    continue
                clean = {field: (row.get(field) or "") for field in FIELDS}
                clean["domain"] = domain
                self.rows[domain] = clean
        except (OSError, csv.Error) as exc:
            self.log.error("tracker_load_failed", error=str(exc))

    def save(self) -> None:
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        for domain in sorted(self.rows):
            writer.writerow({field: self.rows[domain].get(field, "") for field in FIELDS})
        atomic_write_text(self.path, buffer.getvalue())

    # -- mutation ------------------------------------------------------------
    def upsert(self, record: dict) -> dict:
        domain = (record.get("domain") or "").strip().lower()
        if not domain:
            raise ValueError("record needs a domain")
        existing = self.rows.get(domain)
        if existing is None:
            existing = {field: "" for field in FIELDS}
            existing["domain"] = domain
            existing["first_seen"] = iso()
            existing["status"] = record.get("status") or "found"
            self.rows[domain] = existing
        for key, value in record.items():
            if key in FIELDS and value not in (None, ""):
                # Never overwrite a further-along status with an earlier one.
                if key == "status" and self._rank(value) < self._rank(existing.get("status", "")):
                    continue
                existing[key] = str(value)
        return existing

    @staticmethod
    def _rank(status: str) -> int:
        order = {
            "found": 0, "scored": 1, "dropped": 1, "blocked": 1,
            "drafted": 2, "sent": 3, "no_response": 3,
            "replied": 4, "link_live": 5, "link_lost": 5,
        }
        return order.get(status, 0)

    def set_status(self, domain: str, status: str, **fields: str) -> None:
        if status not in STATUSES:
            raise ValueError(f"unknown status: {status}")
        row = self.rows.get(domain.lower())
        if row is None:
            row = {field: "" for field in FIELDS}
            row["domain"] = domain.lower()
            row["first_seen"] = iso()
            self.rows[domain.lower()] = row
        row["status"] = status
        for key, value in fields.items():
            if key in FIELDS:
                row[key] = str(value)

    # -- queries -------------------------------------------------------------
    def get(self, domain: str) -> dict | None:
        return self.rows.get(domain.lower())

    def by_status(self, *statuses: str) -> list[dict]:
        return [r for r in self.rows.values() if r.get("status") in statuses]

    def sent_today(self) -> int:
        today = datetime.now(timezone.utc).date()
        count = 0
        for row in self.rows.values():
            sent = parse_iso(row.get("sent_at"))
            if sent and sent.date() == today:
                count += 1
        return count

    def due_followups(self, after_days: int) -> list[dict]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=after_days)
        due = []
        for row in self.rows.values():
            if row.get("status") != "sent":
                continue
            if row.get("followup_at"):
                continue
            sent = parse_iso(row.get("sent_at"))
            if sent and sent <= cutoff:
                due.append(row)
        return due

    def contacts_for_outreach(self, limit: int) -> list[dict]:
        already = {"drafted", "sent", "replied", "no_response", "link_live", "link_lost"}
        pool = [
            r for r in self.rows.values()
            if r.get("status") in {"scored", "found"}
            and r.get("contact_email")
            and r.get("status") not in already
        ]
        pool.sort(key=lambda r: -_as_int(r.get("score")))
        return pool[:limit]

    def summary(self) -> dict:
        counts: dict[str, int] = {}
        for row in self.rows.values():
            counts[row.get("status", "found")] = counts.get(row.get("status", "found"), 0) + 1
        scores = [_as_int(r.get("score")) for r in self.rows.values() if r.get("score")]
        return {
            "total": len(self.rows),
            "by_status": dict(sorted(counts.items())),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "sent_today": self.sent_today(),
            "daily_limit": self.cfg.daily_send_limit,
            "auto_send": self.cfg.auto_send,
        }

    def write_report(self) -> str:
        data = self.summary()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        lines = [
            f"# Backlink agent - {today}",
            "",
            f"- Prospects tracked: **{data['total']}**",
            f"- Average score: **{data['avg_score']}**",
            f"- Sent today: **{data['sent_today']} / {data['daily_limit']}**",
            f"- AUTO_SEND: **{data['auto_send']}**",
            "",
            "## By status",
            "",
            "| Status | Count |",
            "|---|---|",
        ]
        for status, count in data["by_status"].items():
            lines.append(f"| {status} | {count} |")
        due = self.due_followups(self.cfg.outreach.followup_after_days)
        lines += ["", f"## Follow-ups due: {len(due)}", ""]
        for row in due[:20]:
            lines.append(f"- {row['domain']} (sent {row.get('sent_at', '')})")
        lines += ["", "## Top prospects not yet contacted", "", "| Score | Domain | Opportunity |", "|---|---|---|"]
        pool = [r for r in self.rows.values() if r.get("status") in {"scored", "found"} and r.get("contact_email")]
        pool.sort(key=lambda r: -_as_int(r.get("score")))
        for row in pool[:15]:
            lines.append(f"| {row.get('score', '')} | {row['domain']} | {row.get('opportunity', '')} |")

        path = self.cfg.report_dir / f"{today}.md"
        atomic_write_text(path, "\n".join(lines) + "\n")
        return str(path)


def _as_int(value) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0
