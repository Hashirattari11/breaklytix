"""Step 7 - exactly one follow-up, sent no sooner than N days after the first.

Rules baked in:
  * one follow-up per prospect, ever (followup_at is checked, then written)
  * never to someone who replied, unsubscribed, or whose link is already live
  * same AUTO_SEND switch as the first email
"""

from __future__ import annotations

from .config import Config
from .log import Log
from .outreach import _create_draft, _message, _send, validate_email
from .tracker import Tracker
from .util import iso


def _followup_body(cfg: Config, row: dict) -> tuple[str, str]:
    domain = row.get("domain", "")
    product = cfg.outreach.product_name or "Breaklytix"
    subject = f"Re: {product} - {domain}"
    body = (
        "Hi,\n\n"
        f"Following up once on my note about \"{(row.get('title') or domain)[:80]}\". "
        "I know inboxes are noisy, so this is the only follow-up.\n\n"
        "If a guest post, a dead-link replacement, or a listing is not useful right now, "
        "just reply \"no\" and I will close the loop.\n\n"
        f"Best,\n{cfg.outreach.sender_name}"
    )
    return subject, body


def run(
    cfg: Config,
    profile: dict,
    tracker: Tracker,
    log: Log,
    *,
    dry_run: bool = False,
) -> dict:
    due = tracker.due_followups(cfg.outreach.followup_after_days)
    if not due:
        log.info("followups_none_due", after_days=cfg.outreach.followup_after_days)
        return {"drafted": 0, "sent": 0}

    drafted = sent = 0
    for row in due:
        domain = row["domain"]
        email = row.get("contact_email", "")
        if not email:
            continue
        if row.get("replied_at"):
            continue

        subject, body = _followup_body(cfg, row)
        problems = validate_email(subject, body, profile)
        # The short follow-up intentionally breaks the minimum length rule.
        problems = [p for p in problems if not p.startswith("too short")]
        if problems:
            log.warn("followup_rejected", domain=domain, problems=problems)
            continue

        msg = _message(cfg, email, subject, body)
        if dry_run:
            log.action("dry_run_followup", domain=domain, to=email)
            drafted += 1
            continue

        draft_id, _where = _create_draft(cfg, msg, log, domain)
        tracker.set_status(domain, "sent", followup_at=iso())
        drafted += 1
        if cfg.auto_send:
            if _send(cfg, msg, draft_id, log):
                sent += 1

    tracker.save()
    log.action("followup_done", due=len(due), drafted=drafted, sent=sent)
    return {"drafted": drafted, "sent": sent}
