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


def test_match_risks_ignores_provider_only_notice():
    """A notice with no endpoint/SDK/symbol/value overlap is not a risk."""
    providers = [{"api_name": "clerk"}]
    detections = [
        {
            "api_name": "clerk",
            "file_path": "app/page.tsx",
            "matched_snippet": "<SignIn />",
            "symbols": [],
        }
    ]
    events = [
        {
            "id": "evt-3",
            "api_name": "clerk",
            "change_type": "BEHAVIOR_CHANGE",
            "description": "Application Logs now group sign-ins",
            "source_url": "https://clerk.com/changelog/example",
            "detected_at": "2026-11-06T00:00:00+00:00",
        }
    ]
    assert match_risks(providers, detections, events) == []


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
    monkeypatch.setattr(
        instant_scan, "get_branch_sha", lambda token, full, branch: "deadbeef"
    )
    monkeypatch.setattr(
        instant_scan, "download_repo_archive", lambda token, full, branch, max_bytes=None: b"fake"
    )
    from app.instant_scan_archive import ExtractedRepo

    safe_files = {
        "package.json": BLOBS["p1"],
        "src/pay.ts": BLOBS["p2"],
        "src/ai.ts": BLOBS["p3"],
    }
    extracted = ExtractedRepo(
        files=safe_files,
        file_paths=list(safe_files),
        files_by_type={"code": 2, "config": 1, "docs": 0, "other": 0},
        skipped=[],
        service_roots={},
        truncated=False,
        total_safe_files=3,
    )
    monkeypatch.setattr(instant_scan, "extract_archive", lambda data: extracted)


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


def test_scan_public_repo_uses_canonical_repo_after_redirect(monkeypatch):
    """GitHub 301s renamed repos; tree/blob calls must use the canonical name."""
    seen: dict = {"archive": None}
    monkeypatch.setattr(
        instant_scan,
        "get_repo",
        lambda token, full: {"full_name": "react/react", "default_branch": "main", "private": False},
    )
    monkeypatch.setattr(
        instant_scan, "get_branch_sha", lambda token, full, branch: "deadbeef"
    )

    def fake_download(token, full, branch, max_bytes=None):
        seen["archive"] = full
        return b"fake"

    monkeypatch.setattr(instant_scan, "download_repo_archive", fake_download)
    from app.instant_scan_archive import ExtractedRepo

    extracted = ExtractedRepo(
        files={"package.json": '{"dependencies": {"react": "^18.0.0"}}'},
        file_paths=["package.json"],
        files_by_type={"code": 0, "config": 1, "docs": 0, "other": 0},
        skipped=[],
        service_roots={},
        truncated=False,
        total_safe_files=1,
    )
    monkeypatch.setattr(instant_scan, "extract_archive", lambda data: extracted)
    _patch_db(monkeypatch)
    _patch_events(monkeypatch)

    result = instant_scan.scan_public_repo("facebook/react")

    assert seen["archive"] == "react/react"
    assert result["repo"] == "react/react"
    assert result["repo_url"] == "https://github.com/react/react"


def test_scan_public_repo_explains_unmatched_notices(monkeypatch):
    """When notices exist but nothing overlaps, say so instead of claiming none."""
    _patch_github(monkeypatch)
    _patch_db(monkeypatch)
    monkeypatch.setattr(
        instant_scan,
        "_fetch_events",
        lambda providers: [
            {
                "id": "evt-generic",
                "api_name": "stripe",
                "change_type": "BEHAVIOR_CHANGE",
                "description": "Dashboard now groups payments differently",
                "source_url": "https://stripe.com/changelog/example",
                "detected_at": "2026-10-01T00:00:00+00:00",
            }
        ],
    )
    # Isolate the summary wording: no notice overlaps this fixture's evidence.
    monkeypatch.setattr(instant_scan, "match_risks", lambda *a, **k: [])

    result = instant_scan.scan_public_repo("acme/api")

    assert result["summary"]["possible_risk_count"] == 0
    assert result["risks"] == []
    assert "none mentioned the endpoints" in result["no_risk_message"]


def test_parse_repo_url_normalizes_owner_and_repo_case():
    """GitHub names are case-insensitive -> one canonical (lowercase) cache key."""
    assert parse_repo_url("https://github.com/OpenAI/OpenAI-Quickstart-Node.GIT/") == "openai/openai-quickstart-node"
    assert parse_repo_url("http://www.GitHub.com/Acme/Payments.git") == "acme/payments"


def test_scan_two_different_repos_are_distinct_and_repeat_is_cached(monkeypatch):
    """Two different repos must never share a scan result; repeats must hit cache."""
    store: dict[str, dict] = {}

    def fake_find(repo: str):
        return store.get(repo)

    monkeypatch.setattr(instant_scan, "find_cached_scan", fake_find)

    def fake_persist(repo: str, result: dict, **kwargs):
        scan_id = f"scan-{repo.replace('/', '-')}"
        store[repo] = {"id": scan_id, "result": result, "created_at": "2026-11-12T00:00:00Z"}
        return scan_id

    monkeypatch.setattr(instant_scan, "persist_scan", fake_persist)
    monkeypatch.setattr(instant_scan, "scan_public_repo", lambda repo: {"repo": repo, "summary": {"provider_count": 1, "integration_count": 1, "possible_risk_count": 0}})
    monkeypatch.setattr(
        instant_scan,
        "_scan_slots",
        type(
            "FakeSlots",
            (),
            {
                "acquire": lambda self, timeout=None: True,
                "release": lambda self: None,
            },
        )(),
    )
    monkeypatch.setattr(instant_scan, "count_recent_scans", lambda ip_hash: 0)

    first = run_instant_scan("https://github.com/acme/api", ip="1.2.3.4")
    second = run_instant_scan("https://github.com/acme/payments", ip="1.2.3.5")
    third = run_instant_scan("https://github.com/acme/api", ip="1.2.3.6")

    assert first["cached"] is False and first["scan_id"] == "scan-acme-api"
    assert second["cached"] is False and second["scan_id"] == "scan-acme-payments"
    assert second["result"]["repo"] == "acme/payments"
    assert third["cached"] is True and third["scan_id"] == first["scan_id"]
    assert third["result"] == first["result"]


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


def test_run_instant_scan_enforces_ip_rate_limit_when_configured(monkeypatch):
    """The per-IP cap is opt-in via INSTANT_SCAN_RATE_LIMIT > 0."""
    monkeypatch.setattr(instant_scan.settings, "instant_scan_rate_limit", 5)
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


def test_run_instant_scan_rate_limit_default_is_five(monkeypatch):
    assert instant_scan.settings.instant_scan_rate_limit == 5


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


# ---------------------------------------------------------------------------
# Post-scan sign-up continuation: link scan -> user + arm monitoring
# ---------------------------------------------------------------------------
class _RecordingDB:
    def __init__(self):
        self.calls = []

    def table(self, name):
        recorder = self

        class _Query:
            def update(self, row):
                recorder.calls.append(("update", name, dict(row)))
                return self

            def upsert(self, row, on_conflict=None):
                recorder.calls.append(("upsert", name, dict(row)))
                return self

            def eq(self, *args, **kwargs):
                return self

            def execute(self):
                return _Resp([{"id": "repo-1"}])

        return _Query()


def test_link_scan_to_user_arms_monitoring(monkeypatch):
    recorder = _RecordingDB()
    monkeypatch.setattr(
        instant_scan, "get_scan", lambda scan_id: {"id": scan_id, "repo_full_name": "acme/api"}
    )
    monkeypatch.setattr(
        instant_scan, "fetch_one", lambda table, filters: {"id": "user-1", "email": "user@example.com", "github_access_token": ""}
    )
    monkeypatch.setattr(instant_scan, "db", lambda: recorder)

    out = instant_scan.link_scan_to_user("scan-1", "user-1")

    assert out["ok"] is True
    assert out["repo_full_name"] == "acme/api"
    assert ("update", "instant_scans", {"user_id": "user-1"}) in recorder.calls
    assert any(c[0] == "update" and c[1] == "users" and c[2].get("notify_daily_status") for c in recorder.calls)
    assert (
        "upsert",
        "leads",
        {"email": "user@example.com", "repo": "acme/api", "source": "instant_scan"},
    ) in recorder.calls


def test_link_scan_to_user_returns_none_for_missing_scan(monkeypatch):
    monkeypatch.setattr(instant_scan, "get_scan", lambda scan_id: None)
    assert instant_scan.link_scan_to_user("missing", "user-1") is None
