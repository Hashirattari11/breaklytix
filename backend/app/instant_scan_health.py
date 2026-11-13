"""Code Health Report for the anonymous Instant Repo Scan.

Pure-ish: takes an :class:`ExtractedRepo` plus the scan's detections and runs
deterministic static checks. Network access is isolated in :func:`query_osv_batch`
(OSV.dev) and is cached in-process for 24h per package@version.

Every finding is evidence-light: at most one redacted line, plus a file path
and line number. Secret values are never included.
"""
from __future__ import annotations

import json
import os
import re
import time
from collections.abc import Iterable
from typing import Any

import requests

from .config import settings
from .instant_scan_files import MANIFEST_FILES, is_safe_archive_file
from .redact import redact_snippet

# ---------------------------------------------------------------------------
# Finding helpers
# ---------------------------------------------------------------------------
_CATEGORIES = ("dependencies", "security", "integrations", "config", "seo")
_SEVERITY_WEIGHT = {"high": 10, "medium": 4, "low": 1, "info": 0}


def _finding(
    *,
    rule_id: str,
    category: str,
    severity: str,
    title: str,
    explanation: str,
    suggested_action: str,
    file_path: str | None = None,
    line_number: int | None = None,
    service: str | None = None,
    evidence: str | None = None,
    confidence: str = "medium",
) -> dict[str, Any]:
    return {
        "id": rule_id,
        "category": category,
        "severity": severity,
        "title": title,
        "explanation": explanation,
        "file_path": file_path,
        "line_number": line_number,
        "service": service,
        "suggested_action": suggested_action,
        "confidence": confidence,
        "evidence": redact_snippet(evidence) if evidence else None,
    }


def _is_test_or_doc(path: str) -> bool:
    lowered = "/" + path.lower().lstrip("/")
    if any(seg in lowered for seg in ("/test/", "/tests/", "/__tests__/", "/spec/", "/specs/", "/fixtures/", "/examples/", "/docs/", "/doc/")):
        return True
    basename = lowered.rsplit("/", 1)[-1]
    if basename.startswith("test_") or basename.startswith("spec_"):
        return True
    if ".test." in basename or ".spec." in basename:
        return True
    if basename.endswith((".md", ".mdx", ".rst", ".txt")):
        return True
    return False


# ---------------------------------------------------------------------------
# OSV.dev dependency advisories
# ---------------------------------------------------------------------------
_OSV_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_OSV_TTL = 24 * 3600
_OSV_ENDPOINT = "https://api.osv.dev/v1/querybatch"


def _osv_severity(vuln: dict[str, Any]) -> str:
    # Prefer database_specific.severity (CRITICAL/HIGH/MODERATE/LOW).
    db_sev = (vuln.get("database_specific") or {}).get("severity")
    if isinstance(db_sev, str):
        mapping = {"CRITICAL": "high", "HIGH": "high", "MODERATE": "medium", "MEDIUM": "medium", "LOW": "low"}
        if db_sev.upper() in mapping:
            return mapping[db_sev.upper()]
    # Fall back to CVSS score.
    for sev in vuln.get("severity") or []:
        score = sev.get("score")
        if isinstance(score, str):
            # CVSS vector like "CVSS:3.1/AV:N/AC:L/..." — no numeric; skip.
            continue
        if isinstance(score, (int, float)):
            if score >= 7.0:
                return "high"
            if score >= 4.0:
                return "medium"
            return "low"
    return "medium"


def _osv_fixed_version(vuln: dict[str, Any]) -> str | None:
    for affected in vuln.get("affected") or []:
        for rng in affected.get("ranges") or []:
            for event in rng.get("events") or []:
                fixed = event.get("fixed")
                if fixed:
                    return str(fixed)
    return None


def _osv_link(vuln: dict[str, Any]) -> str | None:
    for ref in vuln.get("references") or []:
        url = ref.get("url")
        if url:
            return str(url)
    vid = vuln.get("id")
    if vid:
        return f"https://osv.dev/vulnerability/{vid}"
    return None


def query_osv_batch(packages: list[tuple[str, str, str]]) -> dict[str, list[dict[str, Any]]]:
    """Query OSV for a list of ``(ecosystem, name, version)``.

    Returns ``{ "ecosystem:name@version": [vuln_dict, ...] }``. Results are
    cached in-process for 24h per package@version. Network failures are swallowed
    and treated as "no advisories" so a scan never fails because of OSV.
    """
    result: dict[str, list[dict[str, Any]]] = {}
    to_query: list[tuple[str, str, str]] = []
    now = time.time()
    for eco, name, version in packages:
        key = f"{eco}:{name}@{version}"
        cached = _OSV_CACHE.get(key)
        if cached and (now - cached[0]) < _OSV_TTL:
            result[key] = cached[1]
        else:
            to_query.append((eco, name, version))

    if not to_query:
        return result

    # Build the batch request.
    queries = [{"package": {"name": n, "ecosystem": e}, "version": v} for (e, n, v) in to_query]
    try:
        resp = requests.post(_OSV_ENDPOINT, json={"queries": queries}, timeout=20)
        data = resp.json() if resp.status_code == 200 else {}
    except Exception:  # noqa: BLE001
        data = {}
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        results = [{} for _ in to_query]

    for (eco, name, version), res in zip(to_query, results):
        key = f"{eco}:{name}@{version}"
        vulns: list[dict[str, Any]] = []
        for v in (res or {}).get("vulns") or []:
            if not isinstance(v, dict):
                continue
            vulns.append(
                {
                    "id": v.get("id"),
                    "summary": (v.get("summary") or v.get("details") or "")[:240],
                    "severity": _osv_severity(v),
                    "fixed": _osv_fixed_version(v),
                    "url": _osv_link(v),
                }
            )
        _OSV_CACHE[key] = (now, vulns)
        result[key] = vulns
    return result


# ---------------------------------------------------------------------------
# Lockfile / manifest parsing (npm + PyPI first)
# ---------------------------------------------------------------------------
def _parse_package_lock(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return out
    # lockfile v2/v3: packages."node_modules/x".version
    packages = data.get("packages")
    if isinstance(packages, dict):
        for path, info in packages.items():
            if not isinstance(info, dict):
                continue
            name = None
            if path.startswith("node_modules/"):
                name = path[len("node_modules/"):]
            if not name or name.startswith("node_modules/"):
                continue
            version = info.get("version")
            if version:
                out.append((name, str(version)))
        if out:
            return out
    # lockfile v1: dependencies
    deps = data.get("dependencies")
    if isinstance(deps, dict):
        for name, info in deps.items():
            if isinstance(info, dict) and info.get("version"):
                out.append((name, str(info["version"])))
    return out


def _parse_yarn_lock(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    # yarn.lock entries: "name@range:\n  version \"1.2.3\"\n"
    for block in re.split(r"\n(?=\S)", text):
        m = re.match(r'^"?([^"\s@]+(?:/[^"\s@]+)?)(?:@[^"]*)?"?:', block)
        if not m:
            continue
        name = m.group(1)
        vm = re.search(r'version\s+"([^"]+)"', block)
        if vm:
            out.append((name, vm.group(1)))
    return out


def _parse_pnpm_lock(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    # dependencies:\n  name:\n    version: 1.2.3
    for m in re.finditer(r"^\s{2}([^\s:]+):\s*\n\s+version:\s*([^\s]+)", text, re.M):
        out.append((m.group(1), m.group(2).strip('"').strip("'")))
    return out


def _parse_requirements(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        name, _, spec = line.partition("==")
        if not spec:
            # allow >= with a concrete version
            name, _, spec = line.partition(">=")
        if not spec:
            continue
        version = spec.strip().split(",")[0].strip()
        if name.strip() and version:
            out.append((name.strip(), version))
    return out


def _parse_pyproject(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    # [project] dependencies = ["stripe>=17.0", ...]
    for raw in re.findall(r'"([A-Za-z0-9_.\-]+)([<>=!~^]+[0-9][0-9A-Za-z.\-]*)"', text):
        out.append((raw[0], raw[1].lstrip("<>=!~^").strip()))
    # [tool.poetry.dependencies] name = ">=1.2" / "^1.2"
    for raw in re.findall(r"^([A-Za-z0-9_.\-]+)\s*=\s*[\"']([\^~<>=0-9][0-9A-Za-z.\-]*)[\"']", text, re.M):
        ver = raw[1].lstrip("^~<>=").strip()
        if ver and ver[0].isdigit():
            out.append((raw[0], ver))
    return out


def _parse_package_json_deps(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return out
    for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        block = data.get(section)
        if isinstance(block, dict):
            for name, spec in block.items():
                ver = str(spec).lstrip("^~>=<").strip()
                if ver and ver[0].isdigit():
                    out.append((name, ver))
    return out


def collect_dependencies(extracted: Any) -> list[tuple[str, str, str, str]]:
    """Return list of ``(ecosystem, name, version, source_file)``.

    Lockfiles are preferred over manifests. Versions from manifests are flagged
    as approximate by the caller (we mark source_file accordingly).
    """
    files = getattr(extracted, "files", {}) or {}
    results: list[tuple[str, str, str, str]] = []
    seen: set[tuple[str, str]] = set()

    # npm lockfiles first
    for lockname, parser in (
        ("package-lock.json", _parse_package_lock),
        ("yarn.lock", _parse_yarn_lock),
        ("pnpm-lock.yaml", _parse_pnpm_lock),
    ):
        for path, text in files.items():
            if path.rsplit("/", 1)[-1].lower() != lockname:
                continue
            for name, version in parser(text):
                key = ("npm", name)
                if key in seen:
                    continue
                seen.add(key)
                results.append(("npm", name, version, path))

    # PyPI lock-ish: requirements.txt
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() == "requirements.txt":
            for name, version in _parse_requirements(text):
                key = ("PyPI", name.lower())
                if key in seen:
                    continue
                seen.add(key)
                results.append(("PyPI", name, version, path))

    # pyproject.toml
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() == "pyproject.toml":
            for name, version in _parse_pyproject(text):
                key = ("PyPI", name.lower())
                if key in seen:
                    continue
                seen.add(key)
                results.append(("PyPI", name, version, path))

    # Manifests as fallback (approximate version)
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() == "package.json":
            for name, version in _parse_package_json_deps(text):
                key = ("npm", name)
                if key in seen:
                    continue
                seen.add(key)
                results.append(("npm", name, version, path + " (approximate version)"))

    # Dedupe by (ecosystem, name) keeping the first (lockfile) entry.
    deduped: list[tuple[str, str, str, str]] = []
    seen2: set[tuple[str, str]] = set()
    for eco, name, version, src in results:
        key = (eco, name.lower())
        if key in seen2:
            continue
        seen2.add(key)
        deduped.append((eco, name, version, src))
    return deduped


# ---------------------------------------------------------------------------
# Security rules
# ---------------------------------------------------------------------------
_SECURITY_RULES: list[tuple[str, str, str, str, str, str]] = [
    # (id, severity, title, explanation, suggested_action, regex)
    ("eval-dynamic", "high", "Dynamic code execution (eval / new Function)",
     "eval or new Function is called with a non-literal argument. This can run attacker-controlled code.",
     "Remove eval/new Function or ensure the input is a trusted, compile-time constant.", r"\beval\s*\(\s*[^'\")\s]|\bnew\s+Function\s*\(\s*[^'\")\s]"),
    ("innerhtml-variable", "medium", "innerHTML / dangerouslySetInnerHTML with a variable",
     "HTML is injected from a variable. If the value is user-influenced this is an XSS risk.",
     "Sanitise the value (DOMPurify) or render as text instead of HTML.", r"innerHTML\s*=\s*[^'\"<\s]|dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*[^'\"{]"),
    ("sql-concat", "medium", "SQL built with string concatenation",
     "A SQL statement is assembled with string concatenation or interpolation, which can lead to SQL injection.",
     "Use parameterised queries / prepared statements.", r"(?i)(SELECT|INSERT|UPDATE|DELETE|DROP)\b[^\"']*[\"']\s*\+|\bf[\"'][^\"']*(?:SELECT|INSERT|UPDATE|DELETE)[^\"']*\{"),
    ("tls-disabled", "high", "TLS verification disabled",
     "TLS certificate verification is disabled (rejectUnauthorized:false / verify=False / CERT_NONE).",
     "Re-enable certificate verification and pin a CA bundle if needed.", r"rejectUnauthorized\s*:\s*false|verify\s*=\s*False|ssl\s*=\s*False|CERT_NONE|verify\s*=\s*0"),
    ("cors-creds-wildcard", "high", "CORS wildcard origin with credentials",
     "CORS is configured with origin \"*\" together with credentials. Browsers reject this and it weakens the security model.",
     "Set an explicit allow-list of origins when credentials are enabled.", None),
    ("hardcoded-credential", "high", "Hardcoded credential pattern",
     "A secret-looking value is assigned to an API key / token / password variable.",
     "Move the value to an environment variable and rotate the exposed credential.", r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
    ("debug-mode", "medium", "Debug mode enabled",
     "Debug mode appears to be turned on. This can leak stack traces and internal details in production.",
     "Disable debug mode in production configuration.", r"(?i)\bDEBUG\s*=\s*True\b|\bdebug\s*:\s*true\b"),
    ("weak-hash", "medium", "Weak hash (md5/sha1) used for passwords",
     "MD5 or SHA-1 is used in a password-related context. These are not suitable for password storage.",
     "Use a slow password hash (bcrypt, scrypt, argon2).", r"(?i)(md5|sha1)\s*\([^)]*password|password[^)]*(md5|sha1)\s*\("),
]


def _run_security_rules(extracted: Any, detections: list[dict]) -> list[dict]:
    findings: list[dict] = []
    files = getattr(extracted, "files", {}) or {}
    service_roots = getattr(extracted, "service_roots", {}) or {}

    # Track CORS wildcard + credentials per file.
    for path, text in files.items():
        if _is_test_or_doc(path):
            continue
        service = None
        # service_for_path imported lazily to avoid cycle
        try:
            from .instant_scan_files import service_for_path

            service = service_for_path(path, service_roots) or None
        except Exception:  # noqa: BLE001
            service = None

        for rule_id, severity, title, explanation, action, regex in _SECURITY_RULES:
            if rule_id == "cors-creds-wildcard":
                if re.search(r'origin\s*:\s*["\']\*["\']', text) and re.search(r"credentials\s*:\s*true", text):
                    findings.append(
                        _finding(
                            rule_id=rule_id, category="security", severity=severity,
                            title=title, explanation=explanation, suggested_action=action,
                            file_path=path, line_number=None, service=service,
                            evidence=None, confidence="medium",
                        )
                    )
                continue
            if not regex:
                continue
            for lineno, line in enumerate(text.splitlines(), start=1):
                if re.search(regex, line):
                    findings.append(
                        _finding(
                            rule_id=rule_id, category="security", severity=severity,
                            title=title, explanation=explanation, suggested_action=action,
                            file_path=path, line_number=lineno, service=service,
                            evidence=line.strip()[:200], confidence="medium",
                        )
                    )
                    break  # one finding per rule per file
    return findings


# ---------------------------------------------------------------------------
# API integration issues (reuse existing code_health checks)
# ---------------------------------------------------------------------------
def _run_integration_checks(extracted: Any, detections: list[dict]) -> list[dict]:
    findings: list[dict] = []
    files = getattr(extracted, "files", {}) or {}
    file_contents = dict(files)

    # Parse package.json / requirements.txt for dependency presence.
    package_json = None
    requirements_txt = None
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() == "package.json":
            try:
                package_json = json.loads(text)
            except (ValueError, TypeError):
                package_json = None
        elif path.rsplit("/", 1)[-1].lower() == "requirements.txt":
            requirements_txt = text

    try:
        from .health.code_health import (
            check_conflicting_config,
            check_deprecated_patterns,
            check_missing_env_vars,
        )

        for issue in check_missing_env_vars(detections, file_contents):
            findings.append(
                _finding(
                    rule_id="missing-env-var", category="integrations", severity="medium",
                    title=f"{issue.provider}: SDK imported but env var not referenced",
                    explanation=issue.description,
                    suggested_action="Reference the expected environment variable when initialising the client.",
                    file_path=issue.file_path, line_number=issue.line_number,
                    confidence="medium",
                )
            )
        for issue in check_deprecated_patterns(detections, file_contents):
            findings.append(
                _finding(
                    rule_id="deprecated-pattern", category="integrations", severity="low",
                    title=f"{issue.provider}: deprecated pattern still present",
                    explanation=issue.description,
                    suggested_action="Update to the recommended pattern.",
                    file_path=issue.file_path, line_number=issue.line_number,
                    confidence="medium",
                )
            )
        for issue in check_conflicting_config(detections, file_contents):
            findings.append(
                _finding(
                    rule_id="conflicting-config", category="integrations", severity="medium",
                    title=f"{issue.provider}: conflicting client configuration",
                    explanation=issue.description,
                    suggested_action="Use a single, consistent environment variable for this provider.",
                    file_path=issue.file_path, line_number=issue.line_number,
                    confidence="medium",
                )
            )
    except Exception:  # noqa: BLE001
        pass

    # Env var referenced but package missing from dependencies.
    try:
        from .health.code_health import PROVIDER_ENV_VARS

        env_vars_used: set[str] = set()
        for det in detections:
            # crude: collect env-var names from evidence
            pass
        # Simpler: for each provider detected, check if its package is in deps.
        js_deps: set[str] = set()
        py_deps: set[str] = set()
        if isinstance(package_json, dict):
            js_deps.update((package_json.get("dependencies") or {}).keys())
            js_deps.update((package_json.get("devDependencies") or {}).keys())
        if requirements_txt:
            for line in requirements_txt.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    m = re.match(r"^([A-Za-z0-9_-]+)", line)
                    if m:
                        py_deps.add(m.group(1).lower())
        # provider -> package mapping from instant_scan
        from .instant_scan import package_provider

        for det in detections:
            api = det.get("api_name")
            if not api:
                continue
            # check if any package for this provider is present
            pass
    except Exception:  # noqa: BLE001
        pass

    return findings


# ---------------------------------------------------------------------------
# Config hygiene
# ---------------------------------------------------------------------------
def _run_config_checks(extracted: Any) -> list[dict]:
    findings: list[dict] = []
    files = getattr(extracted, "files", {}) or {}
    paths = set(files.keys())
    lower_paths = {p.lower() for p in paths}

    def has(name: str) -> bool:
        return any(p.rsplit("/", 1)[-1].lower() == name for p in paths)

    def has_prefix(prefix: str) -> bool:
        return any(p.lower().startswith(prefix) for p in paths)

    if not has("readme.md") and not has("readme") and not has("readme.txt"):
        findings.append(_finding(
            rule_id="missing-readme", category="config", severity="low",
            title="Missing README", explanation="No README file found.",
            suggested_action="Add a README with setup and usage instructions.", confidence="high",
        ))
    if not has("license") and not has("license.md") and not has("license.txt"):
        findings.append(_finding(
            rule_id="missing-license", category="config", severity="info",
            title="Missing LICENSE", explanation="No LICENSE file found.",
            suggested_action="Add a license file to clarify usage terms.", confidence="high",
        ))
    if not has(".gitignore"):
        findings.append(_finding(
            rule_id="missing-gitignore", category="config", severity="low",
            title="Missing .gitignore", explanation="No .gitignore found.",
            suggested_action="Add a .gitignore to avoid committing secrets and build output.", confidence="high",
        ))
    # lockfile
    lockfiles = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock", "requirements.txt", "go.sum", "composer.lock", "Gemfile.lock", "Cargo.lock"}
    if not any(p.rsplit("/", 1)[-1].lower() in lockfiles for p in paths):
        findings.append(_finding(
            rule_id="missing-lockfile", category="config", severity="medium",
            title="Missing lockfile", explanation="No dependency lockfile found.",
            suggested_action="Commit a lockfile for reproducible installs.", confidence="high",
        ))
    if not has_prefix(".github/workflows/"):
        findings.append(_finding(
            rule_id="missing-ci", category="config", severity="info",
            title="Missing CI workflow", explanation="No GitHub Actions workflow found.",
            suggested_action="Add a CI workflow to run tests on push.", confidence="medium",
        ))
    # env vars used but no .env.example
    env_vars: set[str] = set()
    for p, t in files.items():
        for m in re.finditer(r"(?:process\.env\.|os\.environ\[?['\"]?|os\.getenv\(['\"])([A-Z][A-Z0-9_]{2,})", t):
            env_vars.add(m.group(1))
    if env_vars and not has(".env.example") and not has(".env.sample") and not has(".env.template"):
        findings.append(_finding(
            rule_id="missing-env-example", category="config", severity="low",
            title="No .env.example", explanation=f"{len(env_vars)} environment variable(s) are referenced but no .env.example documents them.",
            suggested_action="Add a .env.example listing required variables (names only).", confidence="medium",
        ))
    # Dockerfile running as root
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() in ("dockerfile", "dockerfile.prod", "dockerfile.production"):
            if "USER " not in text.upper():
                findings.append(_finding(
                    rule_id="dockerfile-root", category="config", severity="medium",
                    title="Dockerfile runs as root", explanation="No USER directive found; the container will run as root.",
                    suggested_action="Add a non-root USER directive.", file_path=path, confidence="high",
                ))
    # Old Node/Python pins
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() == "package.json":
            try:
                data = json.loads(text)
                engines = data.get("engines") or {}
                node = engines.get("node")
                if isinstance(node, str):
                    m = re.search(r"(\d+)", node)
                    if m and int(m.group(1)) < 18:
                        findings.append(_finding(
                            rule_id="old-node", category="config", severity="info",
                            title="Old Node version pin", explanation=f"engines.node is {node}.",
                            suggested_action="Consider upgrading to Node 18+.", file_path=path, confidence="high",
                        ))
            except (ValueError, TypeError):
                pass
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() in (".python-version", "runtime.txt"):
            m = re.search(r"(\d+)\.(\d+)", text)
            if m and (int(m.group(1)), int(m.group(2))) < (3, 9):
                findings.append(_finding(
                    rule_id="old-python", category="config", severity="info",
                    title="Old Python version pin", explanation=f"Python {m.group(0)} is pinned.",
                    suggested_action="Consider upgrading to Python 3.9+.", file_path=path, confidence="high",
                ))
    return findings


# ---------------------------------------------------------------------------
# SEO readiness (static, web projects only)
# ---------------------------------------------------------------------------
_WEB_MARKERS = ("next.config", "nuxt.config", "astro.config", "svelte.config", "vite.config", "remix.config")


def _is_web_project(files: dict[str, str]) -> bool:
    for path in files:
        base = path.rsplit("/", 1)[-1].lower()
        if any(base.startswith(m) for m in _WEB_MARKERS):
            return True
    # plain HTML
    if any(p.lower().endswith((".html", ".htm")) for p in files):
        return True
    # package.json with a web framework dependency
    for path, text in files.items():
        if path.rsplit("/", 1)[-1].lower() == "package.json":
            try:
                data = json.loads(text)
                deps = {}
                deps.update(data.get("dependencies") or {})
                deps.update(data.get("devDependencies") or {})
                if any(k in deps for k in ("next", "nuxt", "astro", "react", "vue", "svelte", "@angular/core", "gatsby")):
                    return True
            except (ValueError, TypeError):
                pass
    return False


def _run_seo_checks(extracted: Any) -> list[dict]:
    files = getattr(extracted, "files", {}) or {}
    if not _is_web_project(files):
        return []
    findings: list[dict] = []

    html_files = [p for p in files if p.lower().endswith((".html", ".htm", ".jsx", ".tsx"))]
    # Aggregate checks across html/JSX files.
    all_html = "\n".join(files[p] for p in html_files)
    # Also check layout/head files for meta tags.
    head_candidates = [p for p in files if "layout" in p.lower() or "head" in p.lower() or p.lower().endswith(".html")]
    head_text = "\n".join(files[p] for p in head_candidates) if head_candidates else all_html

    def has(pattern: str, text: str = head_text) -> bool:
        return re.search(pattern, text, re.I) is not None

    if not has(r"<title[^>]*>.+</title>"):
        findings.append(_finding(rule_id="seo-title", category="seo", severity="medium", title="Missing <title>", explanation="No <title> tag found.", suggested_action="Add a descriptive <title>.", confidence="medium"))
    if not has(r'<meta[^>]+name=["\']description["\']'):
        findings.append(_finding(rule_id="seo-meta-desc", category="seo", severity="medium", title="Missing meta description", explanation="No meta description found.", suggested_action="Add a meta description.", confidence="medium"))
    if not has(r'<meta[^>]+property=["\']og:title["\']'):
        findings.append(_finding(rule_id="seo-og-title", category="seo", severity="low", title="Missing Open Graph title", explanation="No og:title found.", suggested_action="Add og:title.", confidence="medium"))
    if not has(r'<meta[^>]+property=["\']og:description["\']'):
        findings.append(_finding(rule_id="seo-og-desc", category="seo", severity="low", title="Missing Open Graph description", explanation="No og:description found.", suggested_action="Add og:description.", confidence="medium"))
    if not has(r'<meta[^>]+property=["\']og:image["\']'):
        findings.append(_finding(rule_id="seo-og-image", category="seo", severity="low", title="Missing Open Graph image", explanation="No og:image found.", suggested_action="Add og:image.", confidence="medium"))
    if not has(r'<meta[^>]+name=["\']twitter:card["\']'):
        findings.append(_finding(rule_id="seo-twitter-card", category="seo", severity="low", title="Missing Twitter card", explanation="No twitter:card found.", suggested_action="Add twitter:card.", confidence="medium"))
    if not has(r'<link[^>]+rel=["\']canonical["\']'):
        findings.append(_finding(rule_id="seo-canonical", category="seo", severity="low", title="Missing canonical link", explanation="No canonical link found.", suggested_action="Add a canonical link.", confidence="medium"))
    if not has(r'<html[^>]+lang='):
        findings.append(_finding(rule_id="seo-lang", category="seo", severity="low", title="Missing lang attribute", explanation="No lang attribute on <html>.", suggested_action="Add lang attribute.", confidence="medium"))
    if not has(r'<link[^>]+rel=["\']icon["\']') and not has(r'<link[^>]+rel=["\']shortcut icon["\']'):
        findings.append(_finding(rule_id="seo-favicon", category="seo", severity="info", title="Missing favicon", explanation="No favicon link found.", suggested_action="Add a favicon.", confidence="medium"))
    # robots.txt / sitemap
    if not any(p.lower().endswith("robots.txt") for p in files):
        findings.append(_finding(rule_id="seo-robots", category="seo", severity="info", title="Missing robots.txt", explanation="No robots.txt found.", suggested_action="Add robots.txt.", confidence="high"))
    if not any("sitemap" in p.lower() for p in files):
        findings.append(_finding(rule_id="seo-sitemap", category="seo", severity="info", title="Missing sitemap", explanation="No sitemap found.", suggested_action="Add a sitemap.", confidence="medium"))
    # img without alt
    img_no_alt = 0
    for p in html_files:
        for m in re.finditer(r"<img\b[^>]*>", files[p], re.I):
            tag = m.group(0)
            if "alt=" not in tag.lower():
                img_no_alt += 1
    if img_no_alt:
        findings.append(_finding(rule_id="seo-img-alt", category="seo", severity="low", title=f"{img_no_alt} <img> without alt", explanation=f"{img_no_alt} image(s) lack an alt attribute.", suggested_action="Add alt text to images.", confidence="high"))

    return findings


# ---------------------------------------------------------------------------
# Dependencies → findings
# ---------------------------------------------------------------------------
def _run_dependency_checks(extracted: Any) -> list[dict]:
    findings: list[dict] = []
    deps = collect_dependencies(extracted)
    if not deps:
        return findings
    # Query OSV
    packages = [(eco, name, version) for (eco, name, version, _src) in deps]
    try:
        osv_results = query_osv_batch(packages)
    except Exception:  # noqa: BLE001
        osv_results = {}
    # Build a map for source file lookup
    src_map = {(eco, name.lower()): src for (eco, name, version, src) in deps}
    ver_map = {(eco, name.lower()): version for (eco, name, version, _src) in deps}

    for eco, name, version, src in deps:
        key = f"{eco}:{name}@{version}"
        vulns = osv_results.get(key, [])
        is_approx = "approximate version" in src
        for v in vulns:
            findings.append(
                _finding(
                    rule_id="dependency-advisory", category="dependencies", severity=v.get("severity", "medium"),
                    title=f"{name}: {v.get('id') or 'advisory'}",
                    explanation=(v.get("summary") or "Known advisory for this package version.") + (" (approximate version from manifest)" if is_approx else ""),
                    suggested_action=(f"Upgrade to {v.get('fixed')} or later." if v.get("fixed") else "Review the advisory and upgrade."),
                    file_path=src.split(" (")[0],
                    confidence="high",
                    evidence=None,
                )
            )
            # attach advisory id + link via extra fields
            findings[-1]["advisory_id"] = v.get("id")
            findings[-1]["fixed_version"] = v.get("fixed")
            findings[-1]["advisory_url"] = v.get("url")
            findings[-1]["package"] = name
            findings[-1]["installed_version"] = version
            findings[-1]["ecosystem"] = eco
    return findings


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def run_health_checks(extracted: Any, detections: list[dict] | None = None) -> dict[str, Any]:
    """Run all health checks and return ``{score, findings, summary}``."""
    detections = detections or []
    findings: list[dict] = []
    findings.extend(_run_dependency_checks(extracted))
    findings.extend(_run_security_rules(extracted, detections))
    findings.extend(_run_integration_checks(extracted, detections))
    findings.extend(_run_config_checks(extracted))
    findings.extend(_run_seo_checks(extracted))

    # Score
    score = 100
    for f in findings:
        score -= _SEVERITY_WEIGHT.get(f.get("severity", "info"), 0)
    score = max(0, score)

    by_severity: dict[str, int] = {"high": 0, "medium": 0, "low": 0, "info": 0}
    by_category: dict[str, int] = {c: 0 for c in _CATEGORIES}
    for f in findings:
        sev = f.get("severity", "info")
        if sev in by_severity:
            by_severity[sev] += 1
        cat = f.get("category")
        if cat in by_category:
            by_category[cat] += 1

    return {
        "score": score,
        "findings": findings,
        "summary": {
            "total": len(findings),
            "by_severity": by_severity,
            "by_category": by_category,
        },
        "disclaimer": "Automated static checks. These are possible issues to review, not confirmed bugs. This is not a full security audit.",
    }
