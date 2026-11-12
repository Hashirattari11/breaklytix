"""Unit tests for the anonymous Instant Repo Scan engine.

Offline: GitHub, Supabase and changelog lookups are monkeypatched. These tests
also assert the security contract — no secret VALUE may ever appear in the
result payload, evidence strings, or stored rows.
"""
import json

import pytest

from app import instant_scan
from app.instant_scan import (
    InvalidRepoUrl,
    ScanRateLimited,
    aggregate_providers,
    evidence_for_line,
    is_safe_scan_file,
    manifest_detections,
    match_risks,
    parse_repo_url,
    run_instant_scan,
    select_scan_files,
)

SECRET = "sk_live_ABCDEFGHIJKLMNOP1234"


# ---------------------------------------------------------------------------
# URL validation (SSRF boundary)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("https://github.com/acme/api", "acme/api"),
        ("http://github.com/acme/api", "acme/api"),
        ("github.com/acme/api", "acme/api"),
        ("https://www.github.com/acme/api/", "acme/api"),
        ("https://github.com/acme/api.git", "acme/api"),
        ("  https://github.com/acme/api  ", "acme/api"),
    ],
)
def test_parse_repo_url_accepts_plain_github_urls(raw, expected):
    assert parse_repo_url(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "https://gitlab.com/acme/api",
        "https://github.com.evil.com/acme/api",
        "http://localhost/acme/api",
        "http://127.0.0.1/acme/api",
        "http://169.254.169.254/acme/api",
        "http://192.168.1.10/acme/api",
        "https://user:pass@github.com/acme/api",
        "https://github.com:8443/acme/api",
        "https://github.com/acme/api/tree/main",
        "https://github.com/acme",
        "https://github.com/acme/api?ref=main",
        "https://github.com/acme/api#readme",
        "javascript:alert(1)",
        "https://github.com/../etc/passwd",
        "https://github.com/acme/..",
        "https://github.com/-bad/api",
    ],
)
def test_parse_repo_url_rejects_non_github_and_traversal(raw):
    with pytest.raises(InvalidRepoUrl):
        parse_repo_url(raw)


# ---------------------------------------------------------------------------
# File exclusion rules
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "path",
    [
        ".env",
        ".env.local",
        ".env.production",
        "config/.env",
        "secrets.pem",
        "server.key",
        "credentials.json",
        "service-account.json",
        "node_modules/react/index.js",
        "vendor/lib/main.go",
        "dist/bundle.js",
        "build/main.py",
        ".git/config",
        "app/__pycache__/x.py",
        "image.png",
        "README.md",
        "Dockerfile",
    ],
)
def test_unsafe_files_are_skipped(path):
    assert is_safe_scan_file(path) is False


@pytest.mark.parametrize(
    "path",
    [
        ".env.example",
        "config/.env.example",
        "settings.example",
        "src/app.ts",
        "app/page.tsx",
        "lib/client.js",
        "api/index.jsx",
        "main.py",
        "server.go",
        "Main.java",
        "app.rb",
        "index.php",
        "Program.cs",
        "package.json",
        "requirements.txt",
    ],
)
def test_safe_source_files_are_scanned(path):
    assert is_safe_scan_file(path) is True


def test_select_scan_files_prioritises_manifests_then_source_dirs():
    tree = [
        {"path": "scripts/deploy.py", "sha": "s3", "size": 10},
        {"path": "src/pay.ts", "sha": "s2", "size": 10},
        {"path": "package.json", "sha": "s1", "size": 10},
        {"path": ".env", "sha": "s4", "size": 10},
        {"path": "node_modules/x/index.js", "sha": "s5", "size": 10},
    ]
    files, partial = select_scan_files(tree, max_files=10, max_file_bytes=1000)
    assert [f["path"] for f in files] == ["package.json", "src/pay.ts", "scripts/deploy.py"]
    assert partial is False


def test_select_scan_files_marks_partial_when_capped():
    tree = [
        {"path": f"src/file{i}.ts", "sha": str(i), "size": 10}
        for i in range(5)
    ]
    files, partial = select_scan_files(tree, max_files=2, max_file_bytes=1000)
    assert len(files) == 2
    assert partial is True


# ---------------------------------------------------------------------------
# Evidence strings
# ---------------------------------------------------------------------------
def test_evidence_uses_env_var_name_never_value():
    line = f'const client = new Stripe("{SECRET}"); // process.env.STRIPE_SECRET_KEY'
    evidence = evidence_for_line("src/pay.ts", line)
    assert evidence == "Environment variable reference: STRIPE_SECRET_KEY"
    assert SECRET not in evidence


def test_evidence_uses_package_name_for_imports():
    evidence = evidence_for_line("src/ai.ts", 'import OpenAI from "openai";')
    assert evidence == "Package reference: openai"


def test_evidence_falls_back_to_path_only():
    evidence = evidence_for_line("src/util.ts", "const x = 1;")
    assert evidence == "API usage reference in src/util.ts"


def test_manifest_detections_map_packages_to_providers():
    dets = manifest_detections(
        "package.json",
        '{\n  "dependencies": {\n    "stripe": "^14.0.0",\n    "openai": "^4.0.0"\n  }\n}',
    )
    apis = {d["api_name"] for d in dets}
    assert apis == {"stripe", "openai"}
    assert all(d["evidence"].startswith("Package dependency: ") for d in dets)
    stripe = next(d for d in dets if d["api_name"] == "stripe")
    assert stripe["line_number"] == 3


def test_aggregate_providers_confidence_and_redaction():
    detections = [
        {
            "api_name": "stripe",
            "file_path": "src/pay.ts",
            "line_number": 2,
            "matched_snippet": f'new Stripe("{SECRET}")',
            "evidence": "Environment variable reference: STRIPE_SECRET_KEY",
        },
        {
            "api_name": "stripe",
            "file_path": "package.json",
            "line_number": 3,
            "matched_snippet": "stripe",
            "evidence": "Package dependency: stripe",
        },
    ]
    providers = aggregate_providers(detections)
    assert len(providers) == 1
    stripe = providers[0]
    assert stripe["confidence"] == "high"
    assert stripe["evidence_count"] == 2
    assert stripe["file_count"] == 2
    payload = json.dumps(providers)
    assert SECRET not in payload


# ---------------------------------------------------------------------------
# Risk matching wording + confidence
# ---------------------------------------------------------------------------
def test_match_risks_uses_official_event_and_may_affect_wording():
    providers = [{"api_name": "stripe"}]
    detections = [
        {
            "api_name": "stripe",
            "file_path": "src/pay.ts",
            "matched_snippet": "stripe.Charge.create(amount=100)",
            "symbols": ["charge"],
        }
    ]
    events = [
        {
            "id": "evt-1",
            "api_name": "stripe",
            "change_type": "BREAKING_CHANGE",
            "description": "Charge.source is being removed",
            "source_url": "https://stripe.com/docs/upgrades",
            "symbols": "charge,source",
            "detected_at": "2026-10-01T00:00:00+00:00",
        }
    ]
    risks = match_risks(providers, detections, events, repo_packages=["stripe"])
    assert len(risks) == 1
    risk = risks[0]
    assert risk["confidence"] in {"high", "medium", "low"}
    assert risk["source_url"] == "https://stripe.com/docs/upgrades"
    assert "may affect" in risk["wording"].lower()
    assert "will break" not in risk["wording"].lower()


def test_match_risks_ignores_non_risk_change_types():
    providers = [{"api_name": "stripe"}]
    detections = [
        {"api_name": "stripe", "file_path": "x.py", "matched_snippet": "stripe.Charge.create()", "symbols": []}
    ]
    events = [
        {
            "id": "evt-2",
            "api_name": "stripe",
            "change_type": "NEW_FEATURE",
            "description": "New endpoint",
            "source_url": "https://stripe.com/changelog",
        }
    ]
    assert match_risks(providers, detections, events) == []


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------
class _Resp:
    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class _FakeQuery:
    def __init__(self, rows=None):
        self._rows = rows or []
        self._insert = None
        self._count = None

    def select(self, *args, **kwargs):
        self._count = kwargs.get("count")
        return self

    def eq(self, *args, **kwargs):
        return self

    def gte(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def insert(self, row):
        self._insert = row
        return self

    def upsert(self, row, on_conflict=None):
        self._insert = row
        return self

    def update(self, row):
        return self

    def execute(self):
        if self._insert is not None:
            row = dict(self._insert)
            row.setdefault("id", "scan-test-id")
            return _Resp([row])
        if self._count == "exact":
            return _Resp([], count=0)
        return _Resp(list(self._rows))


class _FakeDB:
    def __init__(self, rows=None):
        self._rows = rows or {}

    def table(self, name):
        return _FakeQuery(self._rows.get(name))

    def __call__(self):
        return self


# ---------------------------------------------------------------------------
# End-to-end scan (no network) + no secret leakage
# ---------------------------------------------------------------------------
TREE = [
    {"path": "package.json", "sha": "p1", "size": 100},
    {"path": "src/pay.ts", "sha": "p2", "size": 200},
    {"path": "src/ai.ts", "sha": "p3", "size": 200},
    {"path": ".env", "sha": "e1", "size": 50},
    {"path": "node_modules/react/index.js", "sha": "n1", "size": 50},
    {"path": "logo.png", "sha": "img", "size": 50},
]
BLOBS = {
    "p1": '{"dependencies": {"stripe": "^14.0.0", "openai": "^4.0.0"}}',
    "p2": (
        'import Stripe from "stripe";\n'
        f'const stripe = new Stripe("{SECRET}");\n'
        "const key = process.env.STRIPE_SECRET_KEY;\n"
    ),
    "p3": (
        'import OpenAI from "openai";\n'
        "const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n"
    ),
    "e1": f"STRIPE_SECRET_KEY={SECRET}\n",
    "n1": 'require("stripe")',
}


def _patch_github(monkeypatch):
    monkeypatch.setattr(
        instant_scan,
        "get_repo",
        lambda token, full: {"full_name": full, "default_branch": "main", "private": False},
    )
    monkeypatch.setattr(instant_scan, "list_repo_tree", lambda token, full, branch: list(TREE))
    monkeypatch.setattr(instant_scan, "get_blob_text", lambda token, full, sha: BLOBS.get(sha))


def _patch_db(monkeypatch, rows=None):
    fake = _FakeDB(rows)
    monkeypatch.setattr(instant_scan, "db", fake)
    return fake


def _patch_events(monkeypatch):
    monkeypatch.setattr(
        instant_scan,
        "_fetch_events",
        lambda providers: [
            {
                "id": "evt-stripe",
                "api_name": "stripe",
                "change_type": "DEPRECATION",
                "description": "Charge.source is deprecated",
                "source_url": "https://stripe.com/docs/upgrades",
                "symbols": "charge,source",
                "detected_at": "2026-10-01T00:00:00+00:00",
            }
        ],
    )


def test_scan_public_repo_end_to_end_never_leaks_secret(monkeypatch):
    _patch_github(monkeypatch)
    _patch_db(monkeypatch)
    _patch_events(monkeypatch)

    result = instant_scan.scan_public_repo("acme/api")

    assert result["repo"] == "acme/api"
    assert result["partial"] is False
    # `.env` and node_modules are excluded, so only 3 safe files are read.
    assert result["files_scanned"] == 3
    assert result["summary"]["provider_count"] == 2
    assert {p["api_name"] for p in result["providers"]} == {"stripe", "openai"}
    assert result["summary"]["possible_risk_count"] == 1

    serialized = json.dumps(result)
    assert SECRET not in serialized
    assert "STRIPE_SECRET_KEY" in serialized
    assert "will break" not in serialized.lower()

    for provider in result["providers"]:
        for file in provider["files"]:
            for evidence in file["evidence"]:
                assert evidence.startswith(
                    (
                        "Environment variable reference:",
                        "Package reference:",
                        "Package dependency:",
                        "Package dependency listed in",
                        "Python dependency listed in",
                        "API usage reference in",
                    )
                )


def test_run_instant_scan_cache_hit_skips_network(monkeypatch):
    cached_payload = {
        "repo": "acme/api",
        "summary": {"provider_count": 1, "integration_count": 2, "possible_risk_count": 0},
    }
    monkeypatch.setattr(
        instant_scan,
        "find_cached_scan",
        lambda repo: {"id": "cached-1", "result": cached_payload, "created_at": "2026-11-01"},
    )
    monkeypatch.setattr(
        instant_scan,
        "scan_public_repo",
        lambda *a, **k: pytest.fail("network scan must not run on a cache hit"),
    )
    payload = run_instant_scan("https://github.com/acme/api", ip="1.2.3.4")
    assert payload["cached"] is True
    assert payload["scan_id"] == "cached-1"
    assert payload["result"] == cached_payload


def test_run_instant_scan_enforces_ip_rate_limit(monkeypatch):
    monkeypatch.setattr(instant_scan, "find_cached_scan", lambda repo: None)
    monkeypatch.setattr(instant_scan, "count_recent_scans", lambda ip_hash: 5)
    monkeypatch.setattr(
        instant_scan,
        "scan_public_repo",
        lambda *a, **k: pytest.fail("scan must not run once the IP limit is reached"),
    )
    with pytest.raises(ScanRateLimited) as exc:
        run_instant_scan("https://github.com/acme/api", ip="1.2.3.4")
    assert exc.value.retry_after > 0


def test_run_instant_scan_persists_and_returns_id(monkeypatch):
    _patch_github(monkeypatch)
    _patch_db(monkeypatch)
    _patch_events(monkeypatch)
    monkeypatch.setattr(instant_scan, "find_cached_scan", lambda repo: None)
    monkeypatch.setattr(instant_scan, "count_recent_scans", lambda ip_hash: 0)

    payload = run_instant_scan("https://github.com/acme/api", ip="1.2.3.4")
    assert payload["cached"] is False
    assert payload["scan_id"] == "scan-test-id"
    assert SECRET not in json.dumps(payload)
