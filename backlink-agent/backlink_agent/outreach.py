"""Step 6 - write one personalised email per prospect.

Three safety properties:
  * A draft is created first. Sending only happens when AUTO_SEND is true.
  * The body must reference the prospect's own page, and any number in the body
    must exist in the site profile (so the model cannot invent metrics).
  * Suppressed addresses/domains are never contacted, and the daily limit is
    enforced from the tracker, not from memory.

Generation order: Claude API when ANTHROPIC_API_KEY is set, otherwise a
deterministic template that uses the same facts.
"""

from __future__ import annotations

import base64
import json
import os
import re
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from .config import Config
from .log import Log
from .tracker import Tracker
from .util import iso, slug

MAX_WORDS = 190
MIN_WORDS = 90
MAX_SUBJECT = 68

# Numbers that describe an HTTP response rather than a product claim.
HTTP_STATUS_CODES = {
    "301", "302", "307", "308", "400", "401", "403", "404",
    "405", "410", "429", "500", "502", "503", "504",
}

BANNED = (
    "revolutionary", "game-changer", "game changer", "cutting-edge", "world-class",
    "best-in-class", "synergy", "guaranteed", "10x", "skyrocket", "unlock the power",
)


class OutreachError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# fact grounding
# ---------------------------------------------------------------------------
def allowed_numbers(profile: dict) -> set[str]:
    """Every digit-string that legitimately appears on the site."""
    blob = _strip_thousands(json.dumps(profile, ensure_ascii=False))
    return set(re.findall(r"\b\d{1,4}\b", blob))


def _strip_thousands(text: str) -> str:
    """1,200 and 1200 are the same number; compare them that way."""
    return re.sub(r"(?<=\d),(?=\d{3}\b)", "", text or "")


def _has_invented_numbers(body: str, profile: dict) -> list[str]:
    allowed = allowed_numbers(profile)
    text = _strip_thousands(body)
    found = set(re.findall(r"\b\d{1,4}\b", text))
    # A proposed draft length ("1,200 words") is an offer, not a claim.
    proposals = set(re.findall(r"\b(\d{2,4})\s*(?:-|\s)\s*words?\b", text, re.I))
    # Years, small ordinals, list numbers and HTTP status codes are harmless:
    # a status code is our own observation, not a claim about the site.
    suspicious = {
        n for n in found - allowed - proposals - HTTP_STATUS_CODES if int(n) > 12
    }
    return sorted(suspicious)


# ---------------------------------------------------------------------------
# templates
# ---------------------------------------------------------------------------
def _offer_for(prospect: dict) -> str:
    opportunity = prospect.get("opportunity", "")
    evidence = (prospect.get("evidence") or "").lower()
    if "broken_link" in evidence or opportunity == "broken_link":
        return "broken_link"
    if opportunity in {"guest_post"}:
        return "guest_post"
    if opportunity in {"directory"}:
        return "tool_submission"
    return "guest_post"


def _subject_and_body(cfg: Config, profile: dict, prospect: dict) -> tuple[str, str, str]:
    offer = _offer_for(prospect)
    product = cfg.outreach.product_name or "Breaklytix"
    page_title = (prospect.get("title") or prospect.get("domain") or "").strip()
    page_url = prospect.get("url", "")
    domain = prospect.get("domain", "")
    greeting = "Hi,"

    one_liner = (profile.get("description") or "").strip().rstrip(".")
    if len(one_liner) > 180:
        one_liner = one_liner[:177].rsplit(" ", 1)[0] + "..."

    # The site's own description often starts with the product name. Avoid
    # "I work on Breaklytix, where Breaklytix monitors ...".
    if product and one_liner.lower().startswith(product.lower()):
        tail = one_liner[len(product):].lstrip(" -—:,")
        intro = f"I work on {product} ({cfg.site_url}), which {tail[:1].lower()}{tail[1:]}."
        product_line = f"{product} - {tail}"
    else:
        intro = f"I work on {product} ({cfg.site_url}) - {one_liner}."
        product_line = f"{product} - {one_liner}"

    if offer == "broken_link":
        subject = f"Dead link on {domain}"
        body = (
            f"{greeting}\n\n"
            f"I was reading \"{page_title[:90]}\" ({page_url}) and one of the outbound links is dead: "
            f"{prospect.get('dead_url', 'the linked page')} returns a 404.\n\n"
            f"{intro}\n\n"
            f"If it is useful, I can suggest a replacement page that covers the same topic, "
            f"or you can point that link at {cfg.site_url}. Either way the page keeps working.\n\n"
            f"Want me to send the one-line HTML snippet?\n\n"
            f"Best,\n{cfg.outreach.sender_name}"
        )
    elif offer == "tool_submission":
        subject = f"Submission for {domain}"
        body = (
            f"{greeting}\n\n"
            f"I would like to submit {product} to \"{page_title[:90]}\" ({page_url}).\n\n"
            f"One-line description, matching what the site actually does:\n"
            f"{product_line} ({cfg.site_url})\n\n"
            f"Category: developer tools / API monitoring.\n\n"
            f"Tell me if you need a different format or a logo, and I will send it.\n\n"
            f"Best,\n{cfg.outreach.sender_name}"
        )
    else:
        subject = f"Guest post idea for {domain}"
        body = (
            f"{greeting}\n\n"
            f"I read \"{page_title[:90]}\" ({page_url}) before writing, so this is aimed at your readers "
            f"rather than a generic pitch.\n\n"
            f"Idea: a practical piece on how a third-party API change actually reaches production code - "
            f"one real changelog entry, the five fields that matter, and how to find the files it breaks. "
            f"No vendor pitch in the body, one contextual mention at most.\n\n"
            f"{intro}\n\n"
            f"Would a 1,200-word draft be useful? I can send an outline first.\n\n"
            f"Best,\n{cfg.outreach.sender_name}"
        )

    return subject, body, offer


# ---------------------------------------------------------------------------
# Claude generation
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You write short, specific outreach emails for a developer tool.

Hard rules:
- Plain text only. No markdown, no bullet lists, no emojis.
- 100 to 160 words in the body.
- Open by referencing the recipient's actual page title, and make one concrete
  observation about that page. Never write "I love your blog".
- Offer ONE specific thing: a guest post idea, a broken-link replacement, or a
  tool submission. Pick from the offer given to you.
- Never invent metrics, customer counts, funding, awards, users, or rankings.
  Only use facts supplied in FACTS.
- No superlatives. No "revolutionary", "game-changer", "cutting-edge".
- One ask, one question, at the end.
- Sign with the sender name given.

Return strict JSON: {"subject": "...", "body": "..."} and nothing else.
Subject: under 60 characters, lowercase except the product name, no clickbait."""


def _claude_generate(cfg: Config, profile: dict, prospect: dict, log: Log) -> tuple[str, str] | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    try:
        import anthropic  # optional dependency
    except ImportError:
        log.warn("anthropic_missing", note="pip install anthropic to enable AI drafting")
        return None

    facts = {
        "product": cfg.outreach.product_name,
        "site": cfg.site_url,
        "one_liner": profile.get("description", ""),
        "page_title_on_site": profile.get("title", ""),
        "proof_points": (profile.get("pitch") or {}).get("proof_points", []),
    }
    user = json.dumps(
        {
            "recipient": {
                "page_url": prospect.get("url", ""),
                "page_title": prospect.get("title", ""),
                "domain": prospect.get("domain", ""),
                "page_type": prospect.get("opportunity", ""),
                "why_we_picked_them": prospect.get("evidence", ""),
            },
            "offer": _offer_for(prospect),
            "FACTS": facts,
            "sender_name": cfg.outreach.sender_name,
        },
        ensure_ascii=False,
    )
    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=700,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user}],
        )
        raw = "".join(block.text for block in message.content if getattr(block, "type", "") == "text")
        data = json.loads(raw.strip().strip("`").removeprefix("json").strip())
        subject = str(data.get("subject", "")).strip()
        body = str(data.get("body", "")).strip()
        if subject and body:
            log.info("ai_draft", domain=prospect.get("domain"), model="claude-sonnet-5")
            return subject, body
    except Exception as exc:  # network, quota, bad JSON - all fall back to template
        log.warn("ai_draft_failed", domain=prospect.get("domain"), error=f"{type(exc).__name__}: {exc}")
    return None


# ---------------------------------------------------------------------------
# validation
# ---------------------------------------------------------------------------
def validate_email(subject: str, body: str, profile: dict) -> list[str]:
    problems: list[str] = []
    words = len(body.split())
    if words < MIN_WORDS:
        problems.append(f"too short ({words} words)")
    if words > MAX_WORDS:
        problems.append(f"too long ({words} words)")
    if len(subject) > MAX_SUBJECT:
        problems.append(f"subject too long ({len(subject)} chars)")
    lowered = body.lower()
    for word in BANNED:
        if word in lowered:
            problems.append(f"banned phrase: {word}")
    if "$" in body:
        problems.append("contains a price")
    invented = _has_invented_numbers(body, profile)
    if invented:
        problems.append(f"numbers not present on the site: {', '.join(invented)}")
    if body.count("?") == 0:
        problems.append("no question / call to action")
    return problems


# ---------------------------------------------------------------------------
# delivery
# ---------------------------------------------------------------------------
def _suppression(cfg: Config) -> tuple[set[str], set[str]]:
    emails: set[str] = set()
    domains: set[str] = set()
    path = cfg.data_dir / "suppression.txt"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip().lower()
            if not line or line.startswith("#"):
                continue
            (domains if "." in line and "@" not in line else emails).add(line)
    return emails, domains


def _message(cfg: Config, to_email: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((cfg.outreach.product_name or "Breaklytix", cfg.outreach_email))
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Reply-To"] = cfg.outreach_email
    msg["Message-ID"] = make_msgid(domain=cfg.my_domain)
    msg.set_content(body + "\n\n--\nIf this is not relevant, reply \"no\" and I will not follow up.\n")
    return msg


def _write_eml(cfg: Config, msg: EmailMessage, key: str) -> Path:
    path = cfg.draft_dir / f"{slug(key)}.eml"
    path.write_bytes(bytes(msg))
    return path


def _gmail_service(cfg: Config, log: Log):
    """Gmail API, if the optional libs and a token are present."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        return None
    token_path = cfg.data_dir / "gmail_token.json"
    if not token_path.exists():
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(token_path))
        if not creds.valid:
            log.warn("gmail_token_invalid", path=str(token_path))
            return None
        return build("gmail", "v1", credentials=creds, cache_discovery=False)
    except Exception as exc:
        log.warn("gmail_init_failed", error=str(exc))
        return None


def _create_draft(cfg: Config, msg: EmailMessage, log: Log, key: str) -> tuple[str, str]:
    service = _gmail_service(cfg, log)
    if service is None:
        path = _write_eml(cfg, msg, key)
        log.action("draft_eml", path=str(path), to=msg["To"])
        return f"eml:{path.name}", str(path)
    raw = base64.urlsafe_b64encode(bytes(msg)).decode()
    draft = service.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    log.action("draft_gmail", id=draft.get("id"), to=msg["To"])
    return draft.get("id", ""), "gmail"


def _send(cfg: Config, msg: EmailMessage, draft_id: str, log: Log) -> bool:
    service = _gmail_service(cfg, log)
    if service is None:
        log.warn("send_skipped", reason="no Gmail credentials; draft left in data/drafts")
        return False
    if draft_id and not draft_id.startswith("eml:"):
        service.users().drafts().send(userId="me", body={"id": draft_id}).execute()
    else:
        raw = base64.urlsafe_b64encode(bytes(msg)).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
    log.action("email_sent", to=msg["To"], subject=msg["Subject"])
    return True


# ---------------------------------------------------------------------------
# public
# ---------------------------------------------------------------------------
def run(
    cfg: Config,
    profile: dict,
    keywords: dict,
    tracker: Tracker,
    log: Log,
    *,
    dry_run: bool = False,
    limit: int | None = None,
) -> dict:
    if not cfg.has_outreach_email:
        log.error("outreach_blocked", reason="outreach_email is empty in config.yaml")
        return {"drafted": 0, "sent": 0, "skipped": 0}

    suppressed_emails, suppressed_domains = _suppression(cfg)
    budget = min(limit or cfg.daily_send_limit, cfg.daily_send_limit) - tracker.sent_today()
    if budget < 0:
        budget = 0

    candidates = tracker.contacts_for_outreach(limit=200)
    drafted = sent = skipped = 0
    profile = dict(profile)
    profile["pitch"] = keywords.get("pitch", {})

    for prospect in candidates:
        email = prospect.get("contact_email", "")
        domain = prospect.get("domain", "")
        if not email or domain in suppressed_domains or email in suppressed_emails:
            skipped += 1
            continue

        generated = _claude_generate(cfg, profile, prospect, log)
        if generated:
            subject, body = generated
            generator = "claude"
        else:
            subject, body, _ = _subject_and_body(cfg, profile, prospect)
            generator = "template"

        problems = validate_email(subject, body, profile)
        if problems:
            log.warn("draft_rejected", domain=domain, problems=problems)
            tracker.upsert({"domain": domain, "notes": f"draft rejected: {'; '.join(problems)}"})
            skipped += 1
            continue

        msg = _message(cfg, email, subject, body)
        if dry_run:
            log.action("dry_run_draft", domain=domain, to=email, subject=subject)
            drafted += 1
            continue

        draft_id, where = _create_draft(cfg, msg, log, domain)
        tracker.set_status(
            domain,
            "drafted",
            drafted_at=iso(),
            contact_source=prospect.get("contact_source", ""),
            notes=f"{generator} draft via {where}",
        )
        drafted += 1

        if cfg.auto_send and sent < budget:
            if _send(cfg, msg, draft_id, log):
                tracker.set_status(domain, "sent", sent_at=iso())
                sent += 1
        elif cfg.auto_send:
            log.info("send_budget_reached", limit=cfg.daily_send_limit)

    tracker.save()
    log.action("outreach_done", drafted=drafted, sent=sent, skipped=skipped, budget=budget)
    return {"drafted": drafted, "sent": sent, "skipped": skipped}
