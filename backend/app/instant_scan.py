"""Anonymous "Instant Repo Scan" engine.

Design constraints (security + abuse):
  * PUBLIC repositories only. No OAuth, no user tokens. A single server-side
    read-only token (``GITHUB_SCAN_TOKEN``) is used only to raise the GitHub
    API rate limit; it is never returned to a client.
  * Never clones a repository. Files come from the GitHub tarball archive
    (streamed, capped at 50 MB) and are extracted in memory.
  * Secret VALUES are never read, returned, logged, or stored. Evidence is
    limited to environment-variable NAMES, package names, import patterns,
    file paths and line numbers, and every snippet still passes through
    :func:`redact_snippet` as a second line of defence.
  * Hard caps: 3000 files, 300 KB per file, 50 MB archive, 55 s per invocation
    (90 s total across resumed workers). Big repos are scanned in relevance
    order (manifests, config, src/app/lib/api/server/backend) and the result is
    explicitly marked ``partial``.
  * 5 scans per IP per hour (hashed IP only), 2 concurrent scans, and a 24 h
    per-repository result cache keyed by repo + default-branch commit SHA.

The public POST returns a queued scan id immediately; a daemon worker performs
the scan and the frontend polls ``GET /api/scan-status/{id}``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from .changelog.matching import match_event_to_detection
from .config import settings
from .crypto import get_cipher
from .db import db, fetch_one
from .detection import scan_file

from .github_client import (
    GitHubArchiveTooLarge,
    GitHubError,
    download_repo_archive,
    get_branch_sha,
    get_repo,
)
from .instant_scan_archive import ArchiveExtractionError, ExtractedRepo, extract_archive
from .instant_scan_health import run_health_checks
from .instant_scan_files import (
    MANIFEST_FILES,
    classify_file,
    detect_service_roots,
    file_rank,
    is_safe_scan_file,
    normalize_archive_path,
    select_scan_files,
    service_for_path,
)
from .redact import redact_snippet
from .signatures import get_provider_category, status_for_api

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# URL validation (strict allow-list; this is the SSRF boundary)
# ---------------------------------------------------------------------------
_ALLOWED_HOSTS = {"github.com", "www.github.com"}
_OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
_REPO_RE = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


class InvalidRepoUrl(ValueError):
    """The pasted value is not a plain https://github.com/owner/repo URL."""


class RepoUnavailable(RuntimeError):
    """Repo is private, missing, empty, or GitHub refused the request."""


class ScanRateLimited(RuntimeError):
    def __init__(self, retry_after: int):
        super().__init__("Too many scans from this address. Try again shortly.")
        self.retry_after = max(1, int(retry_after))


class ScanBusy(RuntimeError):
    """Two scans are already running; ask the visitor to retry."""


def parse_repo_url(raw: str) -> str:
    """Return canonical ``owner/repo`` or raise :class:`InvalidRepoUrl`.

    Accepts ``github.com/owner/repo`` with an optional ``https://`` scheme,
    optional ``www.``, optional trailing ``/`` and optional ``.git`` suffix.
    Rejects every other host, embedded credentials, ports, query strings,
    fragments, and path traversal â€” this blocks SSRF and open-redirect tricks.
    """
    value = (raw or "").strip()
    if not value:
        raise InvalidRepoUrl("Paste a public GitHub repository URL.")
    if len(value) > 300:
        raise InvalidRepoUrl("That URL is too long.")

    # Reject control characters outright.
    if any(ord(ch) < 32 for ch in value):
        raise InvalidRepoUrl("That URL contains invalid characters.")

    if "://" not in value:
        value = "https://" + value

    try:
        parts = urlsplit(value)
    except ValueError as exc:  # pragma: no cover - urlsplit rarely raises
        raise InvalidRepoUrl("That does not look like a GitHub repository URL.") from exc

    if parts.scheme not in ("http", "https"):
        raise InvalidRepoUrl("Only http(s) GitHub URLs are supported.")
    host = (parts.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        raise InvalidRepoUrl("Only github.com repository URLs are supported.")
    if parts.username or parts.password or parts.port:
        raise InvalidRepoUrl("That GitHub URL format is not supported.")
    if parts.query or parts.fragment:
        raise InvalidRepoUrl("Remove the query string and paste only the repository URL.")

    segments = [s for s in parts.path.split("/") if s]
    if len(segments) != 2:
        raise InvalidRepoUrl("Use the repository URL: https://github.com/owner/repo")
    owner, repo = segments
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
    if not _OWNER_RE.match(owner) or not _REPO_RE.match(repo):
        raise InvalidRepoUrl("That GitHub owner/repository name is not valid.")
    if repo in (".", "..") or owner in (".", ".."):
        raise InvalidRepoUrl("That GitHub repository path is not valid.")
    # GitHub repo names are case-insensitive â€” normalise to one canonical key
    # so the 24h per-repo cache can never drift on casing (Owner/Repo vs
    # owner/repo) and every scan of the same repo hits the same entry.
    return f"{owner.lower()}/{repo.lower()}"


# ---------------------------------------------------------------------------
# Safe evidence text
# ---------------------------------------------------------------------------
_ENV_REF_RE = re.compile(
    r"""(?:process\.env(?:\.|\[)["']?|os\.environ(?:\.get)?\(\s*["']|os\.getenv\(\s*["']|"""
    r"""env(?:iron)?(?:\.get)?\(\s*["']|ENV\[["'])([A-Z][A-Z0-9_]{2,})"""
)
_PACKAGE_REF_RE = re.compile(
    r"""(?:from\s+([A-Za-z0-9_.-]+)\s+import|import\s+([A-Za-z0-9_.-]+)|"""
    r"""require\(\s*["']([^"']+)["']\s*\)|from\s+["']([^"']+)["']|"""
    r"""["']([@A-Za-z0-9][A-Za-z0-9._/-]*)["']\s*:)"""
)
_ENV_NAME_ONLY_RE = re.compile(r"\b([A-Z][A-Z0-9_]{3,})\b")

_PROVIDER_LABELS = {
    "openai": "OpenAI", "github": "GitHub", "sendgrid": "SendGrid",
    "shopify": "Shopify", "aws": "AWS", "googleai": "Google AI",
    "huggingface": "Hugging Face", "elevenlabs": "ElevenLabs",
    "digitalocean": "DigitalOcean", "auth0": "Auth0", "paypal": "PayPal",
    "posthog": "PostHog", "mongodb": "MongoDB", "youtube": "YouTube",
    "whatsapp": "WhatsApp", "openweather": "OpenWeather", "serpapi": "SerpApi",
    "supabase": "Supabase", "firebase": "Firebase", "vercel": "Vercel",
    "stripe": "Stripe", "twilio": "Twilio", "anthropic": "Anthropic",
    "slack": "Slack", "resend": "Resend", "clerk": "Clerk", "notion": "Notion",
    "airtable": "Airtable", "algolia": "Algolia", "cloudinary": "Cloudinary",
    "discord": "Discord", "intercom": "Intercom", "mailgun": "Mailgun",
    "mapbox": "Mapbox", "mixpanel": "Mixpanel", "plaid": "Plaid",
    "postmark": "Postmark", "pusher": "Pusher", "redis": "Redis",
    "segment": "Segment", "sentry": "Sentry", "telegram": "Telegram",
    "twitter": "Twitter", "zoom": "Zoom",
}


def provider_label(api_name: str) -> str:
    return _PROVIDER_LABELS.get(api_name, api_name.replace("_", " ").title())


def evidence_for_line(path: str, line_text: str) -> str:
    """Build a safe, human-readable evidence string.

    Priority: environment-variable NAME -> package/import NAME -> generic
    file reference. The raw line (which may contain a credential) is NEVER
    returned.
    """
    line = line_text or ""
    env = _ENV_REF_RE.search(line)
    if env:
        return f"Environment variable reference: {env.group(1)}"

    # Only echo a quoted token when it is a KNOWN package name. Echoing an
    # arbitrary quoted string could surface a hardcoded credential.
    quoted = re.search(r"""["']([@A-Za-z0-9][A-Za-z0-9._/-]*)["']""", line)
    if quoted and package_provider(quoted.group(1)):
        return f"Package reference: {quoted.group(1)}"

    pkg = _PACKAGE_REF_RE.search(line)
    if pkg:
        name = next((g for g in pkg.groups() if g), "")
        name = name.strip().strip("'\"")
        if name and name not in ("import", "from"):
            if package_provider(name):
                name = _normalize_package(name)
            return f"Package reference: {name}"

    basename = path.rsplit("/", 1)[-1].lower()
    if basename == "package.json":
        return f"Package dependency listed in {path}"
    if basename == "requirements.txt":
        return f"Python dependency listed in {path}"

    # Last resort: only an env-var-looking NAME if present, otherwise a path.
    env_name = _ENV_NAME_ONLY_RE.search(line)
    if env_name and any(k in env_name.group(1) for k in ("KEY", "TOKEN", "SECRET")):
        return f"Environment variable reference: {env_name.group(1)}"
    return f"API usage reference in {path}"


# ---------------------------------------------------------------------------
# Provider + risk aggregation (pure; unit-testable)
# ---------------------------------------------------------------------------
_RISK_CHANGE_TYPES = (
    "BREAKING_CHANGE", "DEPRECATION", "API_VERSION_CHANGE", "ENDPOINT_CHANGE",
    "REQUEST_SCHEMA_CHANGE", "RESPONSE_SCHEMA_CHANGE", "AUTH_CHANGE", "SDK_CHANGE",
    "MODEL_CHANGE", "RATE_LIMIT_CHANGE", "BEHAVIOR_CHANGE", "SECURITY_CHANGE",
)
_CONFIDENCE_ORDER = {"high": 3, "medium": 2, "low": 1}


def _confidence_for(evidence_count: int, has_env_or_package: bool) -> str:
    if evidence_count >= 3 or (evidence_count >= 2 and has_env_or_package):
        return "high"
    if evidence_count >= 2:
        return "medium"
    return "low"


def aggregate_providers(detections: list[dict]) -> list[dict]:
    """Group redacted detections into per-provider summaries with evidence."""
    grouped: dict[str, dict] = {}
    for det in detections:
        api = det["api_name"]
        group = grouped.setdefault(
            api,
            {
                "api_name": api,
                "name": provider_label(api),
                "category": get_provider_category(api),
                "status": status_for_api(api),
                "evidence_count": 0,
                "file_count": 0,
                "_files": {},
                "_has_env_or_package": False,
            },
        )
        group["evidence_count"] += 1
        evidence = det.get("evidence") or evidence_for_line(
            det.get("file_path", ""), det.get("matched_snippet", "")
        )
        if evidence.startswith(("Environment variable reference:", "Package reference:", "Package dependency")):
            group["_has_env_or_package"] = True
        files = group["_files"]
        bucket = files.setdefault(
            det.get("file_path", ""), {"path": det.get("file_path", ""), "lines": [], "evidence": [], "service": None}
        )
        line = det.get("line_number")
        if isinstance(line, int) and line not in bucket["lines"]:
            bucket["lines"].append(line)
        if evidence and evidence not in bucket["evidence"]:
            bucket["evidence"].append(evidence)
        if not bucket.get("service"):
            bucket["service"] = det.get("service")

    providers: list[dict] = []
    for group in grouped.values():
        files = sorted(
            group.pop("_files").values(),
            key=lambda f: (-len(f["evidence"]), f["path"]),
        )
        has_env_or_package = bool(group.pop("_has_env_or_package", False))
        for f in files:
            f["lines"] = sorted(f["lines"])[:20]
            f["evidence"] = f["evidence"][:10]
        services = sorted({f.get("service") for f in files if f.get("service")})
        providers.append(
            {
                **group,
                "file_count": len(files),
                "confidence": _confidence_for(group["evidence_count"], has_env_or_package),
                "services": services,
                "files": files[:8],
            }
        )
    providers.sort(key=lambda p: (-p["evidence_count"], p["name"].lower()))
    return providers


def match_risks(
    providers: list[dict],
    detections: list[dict],
    events: list[dict],
    *,
    repo_packages: list[str] | None = None,
) -> list[dict]:
    """Match recent official provider events to the detected usage.

    Confidence follows the existing Phase B rules in
    :mod:`app.changelog.matching`. Wording is always "may affect" â€” a notice
    is never reported as a confirmed break.
    """
    by_api: dict[str, list[dict]] = {}
    for det in detections:
        by_api.setdefault(det["api_name"], []).append(det)

    best: dict[str, dict] = {}
    for event in events or []:
        api = (event.get("api_name") or "").lower()
        if api not in by_api:
            continue
        event_type = str(event.get("change_type") or "").upper()
        if event_type not in _RISK_CHANGE_TYPES:
            continue
        matches = [
            match_event_to_detection(event, det, repo_packages)
            for det in by_api[api]
        ]
        if not matches:
            continue
        top = max(matches, key=lambda m: _CONFIDENCE_ORDER.get(m.confidence, 0))
        # Provider-only overlap is not evidence that the notice affects this
        # repo. Without an endpoint, SDK, symbol or value match, every recent
        # notice for a detected provider would surface as a "possible risk" â€”
        # noisy, and it would overstate what the scan actually found.
        if not [field for field in (top.matched_fields or []) if field != "provider"]:
            continue
        event_key = str(event.get("id") or f"{api}:{event.get('content_hash')}")
        candidate = {
            "api_name": api,
            "provider_name": provider_label(api),
            "title": (event.get("description") or "Official provider change notice").strip()[:280],
            "description": (event.get("description") or "").strip()[:600] or None,
            "change_type": event_type,
            "confidence": top.confidence,
            "published_at": event.get("detected_at"),
            "source_url": event.get("source_url"),
            "matched_fields": top.matched_fields,
            "wording": "This official notice may affect your integration. Review the source before changing code.",
        }
        existing = best.get(event_key)
        if existing is None or _CONFIDENCE_ORDER.get(candidate["confidence"], 0) > _CONFIDENCE_ORDER.get(
            existing["confidence"], 0
        ):
            best[event_key] = candidate

    risks = list(best.values())
    # Stable two-pass sort: confidence first, then most recent notice.
    risks.sort(key=lambda r: str(r.get("published_at") or ""), reverse=True)
    risks.sort(key=lambda r: -_CONFIDENCE_ORDER.get(r["confidence"], 0))
    return risks


def extract_repo_packages(detections: list[dict]) -> list[str]:
    """Collect package names mentioned in package.json/requirements.txt hits."""
    packages: list[str] = []
    for det in detections:
        path = (det.get("file_path") or "").lower()
        if path.rsplit("/", 1)[-1] not in MANIFEST_FILES:
            continue
        snippet = det.get("matched_snippet") or ""
        for match in re.finditer(r"""["']([@A-Za-z0-9][A-Za-z0-9._/-]*)["']\s*:""", snippet):
            name = match.group(1)
            if name not in packages:
                packages.append(name)
        for token in re.findall(r"^([A-Za-z0-9][A-Za-z0-9._-]*)", snippet):
            if token not in packages:
                packages.append(token)
    return packages[:100]


# ---------------------------------------------------------------------------
# Manifest parsing: a dependency alone is weak evidence, never proof of use
# ---------------------------------------------------------------------------
_PACKAGE_TO_PROVIDER: dict[str, str] = {
    "stripe": "stripe",
    "openai": "openai",
    "anthropic": "anthropic", "@anthropic-ai/sdk": "anthropic",
    "@supabase/supabase-js": "supabase", "supabase": "supabase",
    "twilio": "twilio",
    "@sendgrid/mail": "sendgrid", "sendgrid": "sendgrid",
    "firebase": "firebase", "firebase-admin": "firebase",
    "@slack/web-api": "slack", "@slack/bolt": "slack", "slack_sdk": "slack",
    "resend": "resend",
    "octokit": "github", "@octokit/rest": "github", "pygithub": "github",
    "@shopify/shopify-api": "shopify", "shopify-api-node": "shopify",
    "@vercel/node": "vercel",
    "@paypal/checkout-server-sdk": "paypal", "@paypal/react-paypal-js": "paypal",
    "plaid": "plaid", "clerk": "clerk", "@clerk/nextjs": "clerk",
    "auth0": "auth0", "@auth0/nextjs-auth0": "auth0",
    "algolia": "algolia", "algoliasearch": "algolia",
    "cloudinary": "cloudinary",
    "mapbox-gl": "mapbox", "@mapbox/mapbox-sdk": "mapbox",
    "mixpanel": "mixpanel", "mixpanel-browser": "mixpanel",
    "posthog-js": "posthog", "posthog": "posthog",
    "segment": "segment", "@segment/analytics-node": "segment",
    "sentry": "sentry", "@sentry/node": "sentry", "@sentry/nextjs": "sentry",
    "discord.js": "discord", "discord": "discord",
    "python-telegram-bot": "telegram", "telegraf": "telegram",
    "tweepy": "twitter", "twitter-api-v2": "twitter",
    "zoom": "zoom", "@zoom/meetingsdk": "zoom",
    "airtable": "airtable",
    "notion-client": "notion", "@notionhq/client": "notion",
    "mailgun": "mailgun", "mailgun.js": "mailgun",
    "postmark": "postmark",
    "pusher": "pusher", "pusher-js": "pusher",
    "redis": "redis", "ioredis": "redis",
    "mongodb": "mongodb", "pymongo": "mongodb", "mongoose": "mongodb",
    "google-generativeai": "googleai", "@google/generative-ai": "googleai",
    "huggingface-hub": "huggingface", "@huggingface/inference": "huggingface",
    "elevenlabs": "elevenlabs",
    "intercom-client": "intercom",
    "boto3": "aws", "aws-sdk": "aws", "@aws-sdk/client-s3": "aws",
    "digitalocean": "digitalocean",
    "youtube": "youtube", "googleapis": "youtube",
}


def _normalize_package(name: str) -> str:
    return name.strip().strip("'\"").lower().replace("_", "-")


def package_provider(name: str) -> str | None:
    normalized = _normalize_package(name)
    if normalized in _PACKAGE_TO_PROVIDER:
        return _PACKAGE_TO_PROVIDER[normalized]
    # Scoped packages: match on the package part too (e.g. @sentry/nextjs).
    if normalized.startswith("@") and "/" in normalized:
        tail = normalized.split("/", 1)[1]
        if tail in _PACKAGE_TO_PROVIDER:
            return _PACKAGE_TO_PROVIDER[tail]
    return None


def manifest_detections(path: str, text: str) -> list[dict]:
    """Turn package.json / requirements.txt entries into weak detections."""
    basename = path.rsplit("/", 1)[-1].lower()
    found: list[tuple[str, int]] = []
    if basename == "package.json":
        try:
            data = json.loads(text)
        except (ValueError, TypeError):
            return []
        if not isinstance(data, dict):
            return []
        lines = text.splitlines()
        for section in (
            "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"
        ):
            block = data.get(section)
            if not isinstance(block, dict):
                continue
            for name in block:
                line_no = next(
                    (i + 1 for i, line in enumerate(lines) if f'"{name}"' in line),
                    1,
                )
                found.append((str(name), line_no))
    elif basename == "requirements.txt":
        for i, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("-"):
                continue
            name = re.split(r"[<>=!~\[\s;]", stripped, 1)[0]
            if name:
                found.append((name, i))
    else:
        return []

    detections: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for name, line_no in found:
        api = package_provider(name)
        if not api or (api, name) in seen:
            continue
        seen.add((api, name))
        detections.append(
            {
                "api_name": api,
                "file_path": path,
                "line_number": line_no,
                "matched_snippet": name,
                "symbols": [],
                "evidence": f"Package dependency: {name}",
            }
        )
    return detections


# ---------------------------------------------------------------------------
# Rate limit + concurrency (in-process guard, DB is the cross-instance truth)
# ---------------------------------------------------------------------------
# Bounds only concurrent scans (memory/CPU), never how many scans a visitor may
# run. Extra requests wait for a slot instead of getting a 429.
_scan_slots = threading.BoundedSemaphore(max(1, settings.instant_scan_concurrency))
_SCAN_QUEUE_TIMEOUT_SECONDS = 15.0
_active_scans: set[str] = set()
_active_lock = threading.Lock()


def hash_ip(ip: str) -> str:
    salt = settings.instant_scan_ip_salt or settings.jwt_secret or "breaklytix-instant-scan"
    return hashlib.sha256(f"{salt}:{ip or 'unknown'}".encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None = None) -> str:
    return (dt or _utcnow()).isoformat()


def _hour_ago_iso() -> str:
    return (_utcnow() - timedelta(hours=1)).isoformat()


def _cache_cutoff_iso() -> str:
    return (_utcnow() - timedelta(hours=settings.instant_scan_cache_hours)).isoformat()


def count_recent_scans(ip_hash: str) -> int:
    try:
        res = (
            db()
            .table("instant_scans")
            .select("id", count="exact")
            .eq("ip_hash", ip_hash)
            .gte("created_at", _hour_ago_iso())
            .execute()
        )
        if res.count is not None:
            return int(res.count)
        return len(res.data or [])
    except Exception:  # noqa: BLE001 â€” never fail closed on a counter read
        logger.warning("instant scan: rate-limit counter unavailable")
        return 0


def find_cached_scan(repo_full_name: str, commit_sha: str | None = None) -> dict | None:
    """Return the newest completed scan for ``repo_full_name`` at ``commit_sha``.

    The commit SHA is part of the cache key: a repository that changed since the
    last scan must never receive the old result. When ``commit_sha`` is omitted
    the lookup falls back to any commit (legacy behaviour, used by tests).
    """
    try:
        query = (
            db()
            .table("instant_scans")
            .select("id, repo_full_name, result_json, created_at")
            .eq("repo_full_name", repo_full_name)
            .eq("status", "completed")
            .gte("created_at", _cache_cutoff_iso())
        )
        if commit_sha:
            query = query.eq("commit_sha", commit_sha)
        rows = (
            query.order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: cache lookup failed")
        return None
    if not rows:
        return None
    row = rows[0]
    payload = row.get("result_json")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return None
    if not isinstance(payload, dict):
        return None
    return {"id": row["id"], "result": payload, "created_at": row.get("created_at")}


def _fetch_events(providers: list[str]) -> list[dict]:
    if not providers:
        return []
    try:
        return (
            db()
            .table("changelog_events")
            .select("*")
            .in_("api_name", providers)
            .in_("change_type", list(_RISK_CHANGE_TYPES))
            .order("detected_at", desc=True)
            .limit(300)
            .execute()
        ).data or []
    except Exception:  # noqa: BLE001 â€” risk matching is best-effort, not fatal
        logger.warning("instant scan: changelog lookup failed")
        return []


# ---------------------------------------------------------------------------
# Scan orchestration
# ---------------------------------------------------------------------------
def scan_public_repo(
    repo_full_name: str,
    *,
    commit_sha: str | None = None,
    deadline: float | None = None,
    progress: Callable[[str, str], None] | None = None,
    archive_bytes: bytes | None = None,
) -> dict:
    """Fetch a public repo as a tarball, scan it and summarise the result.

    ``archive_bytes`` is accepted for tests/resume; production downloads the
    tarball via :func:`app.github_client.download_repo_archive`.
    """
    started = time.monotonic()
    if deadline is None:
        deadline = started + settings.instant_scan_timeout_seconds

    token = settings.github_scan_token or ""
    try:
        repo_meta = get_repo(token, repo_full_name)
    except GitHubError as exc:
        raise RepoUnavailable(
            "We could not read that repository. It may be private, renamed, or unavailable."
        ) from exc
    if repo_meta.get("private"):
        raise RepoUnavailable("This scanner only works with public repositories.")

    # GitHub answers 301 for renamed/moved repos; get_repo follows the redirect
    # and returns the canonical name.
    canonical_name = str(repo_meta.get("full_name") or repo_full_name)
    branch = repo_meta.get("default_branch") or "main"
    if not commit_sha:
        try:
            commit_sha = get_branch_sha(token, canonical_name, branch)
        except GitHubError as exc:
            raise RepoUnavailable(
                "We could not read that repository. It may be private, renamed, or unavailable."
            ) from exc

    if progress:
        progress("downloading_repo", "Downloading repository archiveâ€¦")
    if archive_bytes is None:
        try:
            archive_bytes = download_repo_archive(
                token,
                canonical_name,
                branch,
                max_bytes=settings.instant_scan_max_archive_bytes,
            )
        except GitHubArchiveTooLarge as exc:
            raise RepoUnavailable(str(exc)) from exc
        except GitHubError as exc:
            msg = str(exc)
            if "403" in msg or "rate limit" in msg.lower():
                raise RepoUnavailable(
                    "GitHub rate limit reached. Add GITHUB_SCAN_TOKEN or try again in a few minutes."
                ) from exc
            raise RepoUnavailable(
                "GitHub could not provide this repository's archive. It may be empty, very large, or rate-limited."
            ) from exc

    if progress:
        progress("extracting_repo", "Extracting filesâ€¦")
    try:
        extracted = extract_archive(archive_bytes)
    except ArchiveExtractionError as exc:
        raise RepoUnavailable(
            "We could not read this repository's file archive. It may be empty or in an unsupported format."
        ) from exc

    if progress:
        progress("detecting_integrations", "Detecting integrationsâ€¦")
    return scan_extracted_repo(
        repo_full_name,
        canonical_name=canonical_name,
        branch=branch,
        commit_sha=commit_sha,
        extracted=extracted,
        started=started,
        deadline=deadline,
        progress=progress,
    )


def scan_extracted_repo(
    repo_full_name: str,
    *,
    canonical_name: str,
    branch: str,
    commit_sha: str,
    extracted: ExtractedRepo,
    started: float,
    deadline: float | None = None,
    progress: Callable[[str, str], None] | None = None,
) -> dict:
    """Scan an extracted archive and build the safe public result payload."""
    detections: list[dict] = []
    files_scanned = 0
    timed_out = False
    service_roots = extracted.service_roots

    for path, text in extracted.files.items():
        if deadline is not None and time.monotonic() >= deadline:
            timed_out = True
            break
        files_scanned += 1
        raw_detections = [
            {
                "api_name": det.api_name,
                "file_path": det.file_path,
                "line_number": det.line_number,
                "matched_snippet": redact_snippet(det.matched_snippet),
                "symbols": det.symbols,
            }
            for det in scan_file(path, text)
        ]
        basename = path.rsplit("/", 1)[-1].lower()
        if basename in MANIFEST_FILES:
            raw_detections.extend(manifest_detections(path, text))
        service = service_for_path(path, service_roots)
        for det in raw_detections:
            detections.append(
                {
                    **det,
                    "service": service or None,
                    "evidence": evidence_for_line(det["file_path"], det["matched_snippet"]),
                }
            )

    providers = aggregate_providers(detections)
    repo_packages = extract_repo_packages(detections)
    events = _fetch_events([p["api_name"] for p in providers])
    risks = match_risks(providers, detections, events, repo_packages=repo_packages)

    health = run_health_checks(extracted, detections)

    duration_ms = int((time.monotonic() - started) * 1000)
    if risks:
        no_risk_message = None
    elif events:
        no_risk_message = (
            "We found recent official provider notices, but none mentioned the endpoints, "
            "SDKs, or symbols visible in this repository."
        )
    else:
        no_risk_message = "No recent official breaking-change notice found for your detected providers."

    code_files = int(extracted.files_by_type.get("code") or 0)
    docs_files = int(extracted.files_by_type.get("docs") or 0)
    if providers:
        no_integrations_message = None
    else:
        no_integrations_message = (
            f"No third-party API integrations found in {code_files} code "
            f"file{'s' if code_files != 1 else ''} ({docs_files} docs/markdown "
            "files skipped). This repo looks like documentation or does not "
            "call external APIs."
        )

    partial = bool(extracted.truncated or timed_out)
    partial_reason = None
    if partial:
        if extracted.truncated:
            reasons = "; ".join(row["description"] for row in extracted.skipped) or (
                "file caps reached"
            )
            partial_reason = f"Large repository: {reasons}."
        elif timed_out:
            partial_reason = "Scan time limit reached; scanned the most relevant files first."
        else:
            partial_reason = "Large repository: scanned the most relevant files first (file cap)."

    service_counts: dict[str, int] = {}
    for path in extracted.files:
        service = service_for_path(path, service_roots)
        if service:
            service_counts[service] = service_counts.get(service, 0) + 1

    return {
        "repo": canonical_name,
        "repo_url": f"https://github.com/{canonical_name}",
        "default_branch": branch,
        "commit_sha": commit_sha or None,
        "scanned_at": _iso(),
        "duration_ms": duration_ms,
        "partial": partial,
        "partial_reason": partial_reason,
        "files_considered": int(extracted.total_safe_files),
        "files_scanned": files_scanned,
        "files_by_type": extracted.files_by_type,
        "files_skipped": extracted.skipped,
        "services": [
            {
                "path": prefix,
                "name": service_roots[prefix],
                "file_count": service_counts.get(prefix, 0),
            }
            for prefix in sorted(service_roots)
        ],
        "providers": providers,
        "risks": risks,
        "summary": {
            "provider_count": len(providers),
            "integration_count": len(detections),
            "possible_risk_count": len(risks),
            "code_files": code_files,
            "config_files": int(extracted.files_by_type.get("config") or 0),
            "docs_files": docs_files,
            "other_files": int(extracted.files_by_type.get("other") or 0),
            "skipped_count": sum(int(row.get("count") or 0) for row in extracted.skipped),
        },
        "no_risk_message": no_risk_message,
        "no_integrations_message": no_integrations_message,
        "health": health,
    }


# ---------------------------------------------------------------------------
# Scan rows: queue, progress, partial results
# ---------------------------------------------------------------------------
def _get_scan_row(scan_id: str) -> dict | None:
    try:
        rows = (
            db().table("instant_scans").select("*").eq("id", scan_id).limit(1).execute().data
            or []
        )
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not read scan row %s", scan_id)
        return None
    return rows[0] if rows else None


def create_scan_row(repo_full_name: str, ip_hash: str, commit_sha: str | None = None) -> str:
    payload = {
        "repo_full_name": repo_full_name,
        "ip_hash": ip_hash,
        "status": "queued",
        "progress_step": "queued",
        "progress_message": "Waiting for a workerâ€¦",
        "started_at": _iso(),
    }
    if commit_sha:
        payload["commit_sha"] = commit_sha
    try:
        res = db().table("instant_scans").insert(payload).execute()
        rows = res.data or []
        if rows and rows[0].get("id"):
            return str(rows[0]["id"])
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not create scan row for %s", repo_full_name)
    return hashlib.sha256(f"{repo_full_name}:{_iso()}".encode("utf-8")).hexdigest()[:32]


def update_scan_progress(
    scan_id: str, status: str, step: str, message: str, **fields
) -> None:
    payload = {
        "status": status,
        "progress_step": step,
        "progress_message": message,
        "updated_at": _iso(),
        **fields,
    }
    try:
        db().table("instant_scans").update(payload).eq("id", scan_id).execute()
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not update progress for %s", scan_id)


def persist_scan_result(scan_id: str, result: dict) -> None:
    update_scan_progress(
        scan_id,
        "completed",
        "completed",
        "Scan complete",
        result_json=result,
        partial=bool(result.get("partial")),
        duration_ms=int(result.get("duration_ms") or 0),
        commit_sha=result.get("commit_sha"),
        files_by_type=result.get("files_by_type"),
        files_skipped=result.get("files_skipped"),
        finished_at=_iso(),
        error_message=None,
    )


def fail_scan(
    scan_id: str,
    message: str,
    *,
    extracted: ExtractedRepo | None = None,
    repo: str = "",
    branch: str | None = None,
    commit_sha: str | None = None,
) -> None:
    files_by_type = (
        extracted.files_by_type
        if extracted
        else {"code": 0, "config": 0, "docs": 0, "other": 0}
    )
    files_skipped = extracted.skipped if extracted else []
    result = {
        "repo": repo,
        "repo_url": f"https://github.com/{repo}" if repo else "",
        "default_branch": branch,
        "commit_sha": commit_sha,
        "scanned_at": _iso(),
        "duration_ms": 0,
        "partial": True,
        "partial_reason": "The scan could not be completed. Partial results are shown.",
        "files_considered": int(extracted.total_safe_files) if extracted else 0,
        "files_scanned": 0,
        "files_by_type": files_by_type,
        "files_skipped": files_skipped,
        "services": [],
        "providers": [],
        "risks": [],
        "summary": {
            "provider_count": 0,
            "integration_count": 0,
            "possible_risk_count": 0,
            "code_files": int(files_by_type.get("code") or 0),
            "config_files": int(files_by_type.get("config") or 0),
            "docs_files": int(files_by_type.get("docs") or 0),
            "other_files": int(files_by_type.get("other") or 0),
            "skipped_count": sum(int(row.get("count") or 0) for row in files_skipped),
        },
        "no_risk_message": None,
        "no_integrations_message": None,
        "health": None,
        "error_message": message,
    }
    update_scan_progress(
        scan_id,
        "failed",
        "failed",
        message,
        result_json=result,
        partial=True,
        error_message=message,
        files_by_type=files_by_type,
        files_skipped=files_skipped,
        finished_at=_iso(),
    )


def persist_scan(
    repo_full_name: str,
    result: dict,
    *,
    ip_hash: str,
    email: str | None = None,
) -> str:
    """Store a completed scan row (legacy synchronous path + tests)."""
    payload = {
        "repo_full_name": repo_full_name,
        "result_json": result,
        "ip_hash": ip_hash,
        "email": email,
        "status": "completed",
        "progress_step": "completed",
        "progress_message": "Scan complete",
        "partial": bool(result.get("partial")),
        "duration_ms": int(result.get("duration_ms") or 0),
        "commit_sha": result.get("commit_sha"),
        "files_by_type": result.get("files_by_type"),
        "files_skipped": result.get("files_skipped"),
        "finished_at": _iso(),
    }
    try:
        res = db().table("instant_scans").insert(payload).execute()
        rows = res.data or []
        if rows and rows[0].get("id"):
            return str(rows[0]["id"])
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not persist result for %s", repo_full_name)
    # A result without a durable row cannot be shared; surface a stable id so
    # the caller still has a valid response shape. The page will 404 later.
    return hashlib.sha256(f"{repo_full_name}:{_iso()}".encode("utf-8")).hexdigest()[:32]


# ---------------------------------------------------------------------------
# Background worker (daemon thread + self-healing resume)
# ---------------------------------------------------------------------------
def _worker_progress(scan_id: str, step: str, message: str) -> None:
    update_scan_progress(scan_id, "scanning", step, message)


def _parse_iso(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _execute_scan(scan_id: str) -> None:
    row = _get_scan_row(scan_id)
    if not row:
        return
    repo_full_name = str(row.get("repo_full_name") or "")
    commit_sha = str(row.get("commit_sha") or "")
    token = settings.github_scan_token or ""
    extracted: ExtractedRepo | None = None
    canonical_name = repo_full_name
    branch = "main"
    acquired = False
    try:
        acquired = _scan_slots.acquire(timeout=settings.instant_scan_timeout_seconds)
        if not acquired:
            update_scan_progress(scan_id, "queued", "queued", "Waiting for a free workerâ€¦")
            return
        _worker_progress(scan_id, "resolving_repo", "Resolving repositoryâ€¦")
        try:
            repo_meta = get_repo(token, repo_full_name)
        except GitHubError as exc:
            raise RepoUnavailable(
                "We could not read that repository. It may be private, renamed, or unavailable."
            ) from exc
        if repo_meta.get("private"):
            raise RepoUnavailable("This scanner only works with public repositories.")
        canonical_name = str(repo_meta.get("full_name") or repo_full_name)
        branch = repo_meta.get("default_branch") or "main"
        if not commit_sha:
            commit_sha = get_branch_sha(token, canonical_name, branch)
        update_scan_progress(
            scan_id, "scanning", "resolving_repo", "Repository resolved.", commit_sha=commit_sha
        )

        cached = find_cached_scan(repo_full_name, commit_sha)
        if cached:
            persist_scan_result(scan_id, {**cached["result"], "commit_sha": commit_sha})
            logger.info("instant scan: cache_hit repo=%s scan_id=%s", repo_full_name, scan_id)
            return

        # Total budget across resumed invocations.
        row_started = _parse_iso(row.get("started_at"))
        if row_started:
            elapsed_total = (_utcnow() - row_started).total_seconds()
            remaining = settings.instant_scan_total_budget_seconds - elapsed_total
            if remaining <= 0:
                raise RepoUnavailable("The scan exceeded its total time budget. Please retry.")
        else:
            remaining = settings.instant_scan_total_budget_seconds
        started = time.monotonic()
        deadline = started + max(1.0, min(settings.instant_scan_timeout_seconds, remaining))

        _worker_progress(scan_id, "downloading_repo", "Downloading repository archiveâ€¦")
        archive_bytes = download_repo_archive(
            token, canonical_name, branch, max_bytes=settings.instant_scan_max_archive_bytes
        )
        _worker_progress(scan_id, "extracting_repo", "Extracting filesâ€¦")
        extracted = extract_archive(archive_bytes)
        _worker_progress(scan_id, "detecting_integrations", "Detecting integrationsâ€¦")
        result = scan_extracted_repo(
            repo_full_name,
            canonical_name=canonical_name,
            branch=branch,
            commit_sha=commit_sha,
            extracted=extracted,
            started=started,
            deadline=deadline,
            progress=lambda step, msg: _worker_progress(scan_id, step, msg),
        )
        persist_scan_result(scan_id, result)
        logger.info(
            "instant scan: completed repo=%s scan_id=%s duration_ms=%s",
            repo_full_name,
            scan_id,
            result.get("duration_ms"),
        )
    except RepoUnavailable as exc:
        fail_scan(
            scan_id, str(exc), extracted=extracted, repo=canonical_name,
            branch=branch, commit_sha=commit_sha,
        )
    except GitHubArchiveTooLarge as exc:
        fail_scan(
            scan_id, str(exc), extracted=extracted, repo=canonical_name,
            branch=branch, commit_sha=commit_sha,
        )
    except ArchiveExtractionError:
        fail_scan(
            scan_id,
            "We could not read this repository's file archive. It may be empty or in an unsupported format.",
            extracted=extracted, repo=canonical_name, branch=branch, commit_sha=commit_sha,
        )
    except Exception:  # noqa: BLE001 â€” a worker must never crash the instance
        logger.exception("instant scan: worker failed for %s", scan_id)
        fail_scan(
            scan_id, "The scan failed unexpectedly. Please retry.",
            extracted=extracted, repo=canonical_name, branch=branch, commit_sha=commit_sha,
        )
    finally:
        if acquired:
            _scan_slots.release()


def _run_worker(scan_id: str) -> None:
    try:
        _execute_scan(scan_id)
    finally:
        with _active_lock:
            _active_scans.discard(scan_id)


def start_scan_worker(scan_id: str) -> None:
    """Start the background worker once per scan (idempotent per process)."""
    with _active_lock:
        if scan_id in _active_scans:
            return
        _active_scans.add(scan_id)
    threading.Thread(
        target=_run_worker,
        args=(scan_id,),
        daemon=True,
        name=f"instant-scan-{scan_id[:8]}",
    ).start()


def _is_stale(updated_at: object) -> bool:
    parsed = _parse_iso(updated_at)
    if not parsed:
        return False
    return (_utcnow() - parsed).total_seconds() > settings.instant_scan_stale_seconds


def _public_status(row: dict) -> dict:
    status = str(row.get("status") or "queued")
    payload = row.get("result_json")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = None
    return {
        "scan_id": row.get("id"),
        "repo_full_name": row.get("repo_full_name"),
        "status": status,
        "progress_step": row.get("progress_step"),
        "progress_message": row.get("progress_message"),
        "commit_sha": row.get("commit_sha"),
        "partial": bool(row.get("partial")),
        "duration_ms": row.get("duration_ms"),
        "files_by_type": row.get("files_by_type"),
        "files_skipped": row.get("files_skipped"),
        "error_message": row.get("error_message"),
        "created_at": row.get("created_at"),
        "finished_at": row.get("finished_at"),
        "result": payload if isinstance(payload, dict) else None,
    }


def get_scan_status(scan_id: str) -> dict | None:
    """Public status read. Resumes a stale queued/scanning row on the next poll."""
    row = _get_scan_row(scan_id)
    if not row:
        return None
    status = str(row.get("status") or "queued")
    updated_at = row.get("updated_at") or row.get("created_at")
    if status in ("queued", "scanning") and _is_stale(updated_at):
        logger.info("instant scan: resuming stale scan %s", scan_id)
        start_scan_worker(scan_id)
        row = _get_scan_row(scan_id) or row
    return _public_status(row)


def create_instant_scan_job(raw_url: str, *, ip: str) -> dict:
    """Validate, resolve the commit, check the cache and queue a background scan."""
    repo_full_name = parse_repo_url(raw_url)
    ip_hash = hash_ip(ip)
    token = settings.github_scan_token or ""
    try:
        repo_meta = get_repo(token, repo_full_name)
    except GitHubError as exc:
        raise RepoUnavailable(
            "We could not read that repository. It may be private, renamed, or unavailable."
        ) from exc
    if repo_meta.get("private"):
        raise RepoUnavailable("This scanner only works with public repositories.")

    canonical_name = str(repo_meta.get("full_name") or repo_full_name)
    branch = repo_meta.get("default_branch") or "main"
    commit_sha = get_branch_sha(token, canonical_name, branch)

    cached = find_cached_scan(repo_full_name, commit_sha)
    if cached:
        logger.info(
            "instant scan: cache_hit repo=%s scan_id=%s", repo_full_name, cached.get("id")
        )
        return {
            "scan_id": cached["id"],
            "cached": True,
            "status": "completed",
            "cached_at": cached.get("created_at"),
            "result": cached["result"],
        }

    limit = settings.instant_scan_rate_limit
    if limit > 0 and count_recent_scans(ip_hash) >= limit:
        raise ScanRateLimited(retry_after=3600)

    scan_id = create_scan_row(repo_full_name, ip_hash, commit_sha=commit_sha)
    start_scan_worker(scan_id)
    logger.info("instant scan: queued repo=%s scan_id=%s", repo_full_name, scan_id)
    return {
        "scan_id": scan_id,
        "cached": False,
        "status": "queued",
        "cached_at": None,
        "result": None,
    }


def run_instant_scan(raw_url: str, *, ip: str) -> dict:
    """Synchronous scan (tests + fallback). The public router uses the queued job."""
    repo_full_name = parse_repo_url(raw_url)
    ip_hash = hash_ip(ip)

    cached = find_cached_scan(repo_full_name)
    if cached:
        logger.info(
            "instant scan: cache_hit repo=%s scan_id=%s",
            repo_full_name,
            cached.get("id"),
        )
        return {
            "scan_id": cached["id"],
            "cached": True,
            "cached_at": cached.get("created_at"),
            "result": cached["result"],
        }

    limit = settings.instant_scan_rate_limit
    if limit > 0 and count_recent_scans(ip_hash) >= limit:
        raise ScanRateLimited(retry_after=3600)

    if not _scan_slots.acquire(timeout=_SCAN_QUEUE_TIMEOUT_SECONDS):
        raise ScanBusy("The scanner is busy right now. Please retry in a few seconds.")
    try:
        result = scan_public_repo(repo_full_name)
    finally:
        _scan_slots.release()

    scan_id = persist_scan(repo_full_name, result, ip_hash=ip_hash)
    logger.info(
        "instant scan: completed repo=%s scan_id=%s duration_ms=%s cached=False",
        repo_full_name,
        scan_id,
        result.get("duration_ms"),
    )
    return {"scan_id": scan_id, "cached": False, "cached_at": None, "result": result}

def get_scan(scan_id: str) -> dict | None:
    """Public read of one stored scan (safe result JSON only)."""
    item = _get_scan_row(scan_id)
    if not item:
        return None
    payload = item.get("result_json")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return None
    if not isinstance(payload, dict):
        return None
    status = _public_status(item)
    status["email_captured"] = bool(item.get("email"))
    return status


def link_scan_to_user(scan_id: str, user_id: str) -> dict | None:
    """Link an anonymous instant scan to a signed-up user and mark monitoring on.

    - Sets ``instant_scans.user_id`` so the funnel can attribute a scan to the
      account that acted on it.
    - Adds the scanned public repo to the user's monitored ``repos`` rows (this
      is what arms the daily monitoring pipeline for that repo).
    - Turns the user's daily-status notification on.

    Returns ``None`` when the scan does not exist (the caller should 404).
    """
    scan = get_scan(scan_id)
    if not scan:
        return None
    repo_full_name = scan.get("repo_full_name") or ""
    if not repo_full_name:
        return None

    try:
        db().table("instant_scans").update({"user_id": user_id}).eq("id", scan_id).execute()
    except Exception:  # noqa: BLE001 â€” attribution must never break the connect flow
        logger.warning("instant scan: could not link scan %s to user", scan_id)

    user = fetch_one("users", {"id": user_id}) or {}
    token = ""
    raw_token = user.get("github_access_token") if isinstance(user, dict) else None
    if isinstance(raw_token, str) and raw_token:
        try:
            token = get_cipher().decrypt(raw_token)
        except Exception:  # noqa: BLE001
            token = ""

    repo_id: str | None = None
    gh_repo = None
    if token:
        try:
            gh_repo = get_repo(token, repo_full_name)
        except Exception:  # noqa: BLE001
            gh_repo = None
    if gh_repo:
        row = {
            "user_id": user_id,
            "github_repo_id": str(gh_repo.get("github_repo_id") or ""),
            "full_name": gh_repo.get("full_name") or repo_full_name,
            "default_branch": gh_repo.get("default_branch") or "main",
        }
        try:
            res = db().table("repos").upsert(row, on_conflict="user_id,github_repo_id").execute()
            repo_id = (res.data or [{}])[0].get("id") if res.data else None
        except Exception:  # noqa: BLE001
            logger.warning("instant scan: could not add scanned repo %s to monitored repos", repo_full_name)

    try:
        db().table("users").update({"notify_daily_status": True}).eq("id", user_id).execute()
    except Exception:  # noqa: BLE001
        logger.warning("instant scan: could not set daily status for user %s", user_id)

    user_email = (user.get("email") or "") if isinstance(user, dict) else ""
    if user_email:
        # Every sign-up via the scan CTA also writes a lead row (idempotent).
        try:
            db().table("leads").upsert(
                {"email": user_email, "repo": repo_full_name, "source": "instant_scan"},
                on_conflict="email,repo,source",
            ).execute()
        except Exception:  # noqa: BLE001
            logger.warning("instant scan: could not store lead for %s", repo_full_name)

    return {
        "ok": True,
        "scan_id": scan_id,
        "repo_full_name": repo_full_name,
        "repo_id": repo_id,
        "monitored": True,
    }


def latest_scan_for_repo(repo_full_name: str) -> dict | None:
    try:
        rows = (
            db()
            .table("instant_scans")
            .select("id, repo_full_name, result_json, created_at")
            .eq("repo_full_name", repo_full_name)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
    except Exception:  # noqa: BLE001
        return None
    if not rows:
        return None
    payload = rows[0].get("result_json")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return None
    if not isinstance(payload, dict):
        return None
    return {"id": rows[0]["id"], "result": payload, "created_at": rows[0].get("created_at")}


def record_event(event: str, *, scan_id: str | None = None, repo_full_name: str | None = None,
                 ip: str | None = None, props: dict | None = None) -> None:
    """Append a funnel event. Failures are silent (analytics is best-effort)."""
    try:
        db().table("instant_scan_events").insert(
            {
                "event": event,
                "scan_id": scan_id,
                "repo_full_name": repo_full_name,
                "ip_hash": hash_ip(ip) if ip else None,
                "props": props or None,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.debug("instant scan: could not record event %s", event)
