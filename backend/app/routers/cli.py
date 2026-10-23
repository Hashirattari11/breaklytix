"""CLI support — local scan endpoint."""
from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_current_user_id
from ..config import settings
from ..redact import redact_snippet

router = APIRouter(prefix="/cli", tags=["cli"])

# Max bytes a scanned file may occupy before it is skipped (avoids reading
# arbitrarily large/hostile files).
MAX_SCAN_FILE_BYTES = 256 * 1024
MAX_SCAN_FILES = 5000
MAX_SCAN_DEPTH = 25

# ─── API Detection Patterns ──────────────────────────────────────────────────
API_PATTERNS: dict[str, list[str]] = {
    "stripe": [
        r'require\(["\']stripe["\']\)',
        r'from\s+["\']stripe["\']',
        r'import\s+Stripe\s+from\s+["\']stripe["\']',
        r'new\s+Stripe\(',
        r'stripe\.(charges|paymentIntents|subscriptions|customers|webhooks)',
    ],
    "shopify": [
        r'require\(["\']@shopify/shopify-api["\']\)',
        r'from\s+["\']@shopify/shopify-api["\']',
        r'Shopify\.Session',
        r'shopify\.rest\.',
    ],
    "twilio": [
        r'require\(["\']twilio["\']\)',
        r'from\s+["\']twilio["\']',
        r'new\s+Twilio\(',
        r'twilio\.(messages|calls|verify)',
    ],
    "sendgrid": [
        r'require\(["\']@sendgrid/mail["\']\)',
        r'from\s+["\']@sendgrid/mail["\']',
        r'sendgrid\.send\(',
        r'SG\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    ],
    "github": [
        r'@octokit/rest',
        r'octokit\.repos\.',
        r'api\.github\.com',
        r'github\.com/repos/',
    ],
}

SCAN_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".java", ".php",
    ".json", ".yaml", ".yml", ".toml",
}

IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "target",
    "__pycache__", ".venv", "venv", ".next", ".nuxt",
    "vendor", "coverage", ".cache",
}


# ─── Request / Response Models ───────────────────────────────────────────────
class LocalScanIn(BaseModel):
    path: str


class Detection(BaseModel):
    api: str
    file: str
    matches: int
    lines: list[int]
    snippet: Optional[str] = None


class LocalScanOut(BaseModel):
    scanned_path: str
    file_count: int
    detection_count: int
    detections: list[Detection]
    summary: dict[str, int]


# ─── Endpoint ────────────────────────────────────────────────────────────────
@router.post("/local-scan", response_model=LocalScanOut)
def local_scan(body: LocalScanIn, user_id: str = Depends(get_current_user_id)):
    """Scan a local directory for third-party API usage.

    SECURITY: scans are confined to a sandbox root (`CLI_SCAN_ROOT`, defaulting
    to a temp dir). Requests for paths outside it are rejected — this prevents
    arbitrary server-side file reads (including .env / other secrets).
    """
    root_raw = settings.cli_scan_root or os.environ.get("CLI_SCAN_ROOT", "")
    scan_root = Path(root_raw).resolve() if root_raw else Path(tempfile.gettempdir()) / "autofix-cli-scan"
    scan_root.mkdir(parents=True, exist_ok=True)

    scan_path = Path(body.path).resolve()

    if not scan_path.exists():
        raise HTTPException(status_code=400, detail="Path not found in the scan sandbox")
    if not scan_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    # Confine to the sandbox root (fail closed on any resolution error).
    try:
        common = os.path.commonpath([str(scan_path), str(scan_root)])
    except ValueError:
        common = ""
    if common != str(scan_root):
        raise HTTPException(
            status_code=403,
            detail="Path is outside the allowed scan sandbox",
        )

    detections: list[dict] = []
    file_count = 0

    def walk(dir: Path, depth: int = 0):
        nonlocal file_count
        if depth > MAX_SCAN_DEPTH or file_count >= MAX_SCAN_FILES:
            return
        try:
            entries = list(dir.iterdir())
        except (PermissionError, OSError):
            return

        for entry in entries:
            if file_count >= MAX_SCAN_FILES:
                return
            # Never follow symlinks: a link inside the sandbox could otherwise
            # point at /etc, a home directory, or another tenant's files.
            if entry.is_symlink():
                continue
            if entry.is_dir():
                if entry.name not in IGNORE_DIRS:
                    walk(entry, depth + 1)
                continue

            if not entry.is_file() or entry.suffix.lower() not in SCAN_EXTENSIONS:
                continue

            file_count += 1
            try:
                if entry.stat().st_size > MAX_SCAN_FILE_BYTES:
                    continue  # skip oversized files
                content = entry.read_text(encoding="utf-8", errors="ignore")
                relative = str(entry.relative_to(scan_path)).replace("\\", "/")

                for api, patterns in API_PATTERNS.items():
                    for pat_str in patterns:
                        pattern = re.compile(pat_str, re.IGNORECASE)
                        matches = pattern.findall(content)
                        if matches:
                            lines = []
                            for i, line in enumerate(content.splitlines(), 1):
                                if pattern.search(line):
                                    lines.append(i)
                            snippet = (
                                redact_snippet(content.splitlines()[lines[0] - 1].strip()[:120])
                                if lines
                                else None
                            )
                            detections.append({
                                "api": api,
                                "file": relative,
                                "matches": len(matches),
                                "lines": lines[:5],
                                "snippet": snippet,
                            })
            except Exception:
                pass

    walk(scan_path)

    # Deduplicate by api+file
    seen = set()
    unique = []
    for d in detections:
        key = f"{d['api']}:{d['file']}"
        if key not in seen:
            seen.add(key)
            unique.append(d)

    # Summary
    summary: dict[str, int] = {}
    for d in unique:
        summary[d["api"]] = summary.get(d["api"], 0) + 1

    return LocalScanOut(
        scanned_path=str(scan_path.relative_to(scan_root)).replace("\\", "/"),
        file_count=file_count,
        detection_count=len(unique),
        detections=[Detection(**d) for d in unique],
        summary=summary,
    )
