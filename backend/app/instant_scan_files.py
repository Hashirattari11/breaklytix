"""File selection, classification and monorepo helpers for the instant scanner.

Kept separate from :mod:`app.instant_scan` so the archive extractor, the scan
engine and the health-report engine can all share the same safety rules without
import cycles.

Safety contract:
  * Only public repository files are considered.
  * Secret-bearing files (.env, *.pem, *.key, credentials.json, ...) are never
    read, stored, logged or returned.
  * Vendored/build output (node_modules, vendor, dist, build, .git, ...) is
    never read.
  * Only file PATHS, line numbers, package names and redacted evidence leave
    the process.
"""
from __future__ import annotations

import os

from .config import settings

# ---------------------------------------------------------------------------
# Safety rules (shared by the tree scanner and the archive extractor)
# ---------------------------------------------------------------------------
_ALLOWED_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rb", ".php", ".cs",
    # Example env files only — a real `.env` never reaches this set because
    # its extension is `.env`, which is deliberately absent.
    ".example",
}
_ALLOWED_EXACT_FILES = {
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "requirements.txt", "pyproject.toml", "poetry.lock", "Pipfile",
    "Pipfile.lock", "go.mod", "go.sum", "Gemfile", "Gemfile.lock",
    "composer.json", "composer.lock",
}
_EXCLUDED_BASENAMES = {
    ".env", ".env.local", ".env.production", ".env.staging", ".env.development",
    ".env.test", ".env.test.local", ".env.production.local",
    "credentials.json", "service-account.json", "secrets.json",
    "secrets.yaml", "secrets.yml",
}
_EXCLUDED_SUFFIXES = (".pem", ".key", ".p12", ".pfx", ".jks", ".keystore")
_EXCLUDED_DIR_FRAGMENTS = (
    "node_modules/", "vendor/", "dist/", "build/", ".git/", ".next/", "out/",
    "venv/", ".venv/", "__pycache__/", "site-packages/", "coverage/",
    ".nuxt/", ".cache/", ".output/", ".turbo/",
)

# ---------------------------------------------------------------------------
# File classification + priority
# ---------------------------------------------------------------------------
_MANIFEST_FILES = {
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "requirements.txt", "pyproject.toml", "poetry.lock", "Pipfile",
    "Pipfile.lock", "go.mod", "go.sum", "Gemfile", "Gemfile.lock",
    "composer.json", "composer.lock", "Cargo.toml", "Cargo.lock",
    "pom.xml", "build.gradle", "build.gradle.kts", "pubspec.yaml",
    "pubspec.lock",
}
# Public alias used by the scan engine and health report.
MANIFEST_FILES = _MANIFEST_FILES
_CONFIG_FILES = {
    "next.config.js", "next.config.mjs", "next.config.ts", "next.config.cjs",
    "nuxt.config.ts", "nuxt.config.js", "astro.config.mjs", "astro.config.ts",
    "svelte.config.js", "vite.config.ts", "vite.config.js", "vue.config.js",
    "vercel.json", "netlify.toml", "Dockerfile", "dockerfile",
    "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
    "Makefile", "makefile", "tsconfig.json", "jsconfig.json",
    "webpack.config.js", "rollup.config.js", "esbuild.config.js",
    "tailwind.config.js", "tailwind.config.ts", "postcss.config.js",
    ".gitignore", ".dockerignore", ".npmrc", ".nvmrc", ".python-version",
    "renovate.json", "dependabot.yml", ".editorconfig",
}
_CONFIG_EXTENSIONS = {
    ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".config",
    ".env.example", ".env.sample", ".env.template",
}
_DOCS_EXTENSIONS = {
    ".md", ".mdx", ".rst", ".txt", ".adoc", ".asciidoc",
}
_CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rb",
    ".php", ".cs", ".java", ".kt", ".kts", ".swift", ".rs", ".c", ".h",
    ".cc", ".cpp", ".hpp", ".scala", ".dart", ".lua", ".pl", ".sh",
    ".bash", ".zsh", ".ps1", ".sql", ".html", ".htm", ".css", ".scss",
    ".sass", ".less", ".vue", ".svelte", ".astro",
}
_IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif",
    ".bmp", ".tiff", ".tif", ".psd", ".ai", ".eps",
}
_BINARY_EXTENSIONS = {
    ".pdf", ".zip", ".gz", ".tar", ".tgz", ".bz2", ".xz", ".7z", ".rar",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".mp3", ".wav",
    ".avi", ".mov", ".mkv", ".exe", ".dll", ".so", ".dylib", ".bin",
    ".pyc", ".class", ".jar", ".war", ".ear", ".parquet", ".db", ".sqlite",
    ".sqlite3", ".pkl", ".pickle", ".npy", ".npz", ".onnx", ".h5", ".pt",
    ".pth", ".wasm", ".rlib", ".o", ".a", ".obj", ".fbx", ".glb", ".gltf",
}
_MINIFIED_BASENAME_RE = (
    ".min.js", ".min.css", ".min.mjs", ".min.cjs", ".min.ts",
    ".bundle.js", ".bundle.css", ".chunk.js", ".chunk.css", ".map",
)

# Monorepo roots we understand. Order matters: the first matching prefix wins.
_SERVICE_ROOT_PATTERNS = ("apps/", "packages/", "services/", "modules/", "libs/")


def is_safe_scan_file(path: str) -> bool:
    """True only for source/example files the anonymous scanner may read.

    This is the stricter, source-only rule used by the legacy tree scanner.
    """
    normalized = "/" + path.strip().lstrip("/").lower()
    if any(frag in normalized for frag in _EXCLUDED_DIR_FRAGMENTS):
        return False
    basename = normalized.rsplit("/", 1)[-1]
    if basename in _EXCLUDED_BASENAMES:
        return False
    if basename.endswith(_EXCLUDED_SUFFIXES):
        return False
    if basename in _ALLOWED_EXACT_FILES:
        return True
    dot = basename.rfind(".")
    if dot == -1:
        return False
    return basename[dot:] in _ALLOWED_EXTENSIONS


def is_safe_archive_file(path: str) -> bool:
    """Broader safe rule for the archive extractor.

    Allows manifests, config, docs and CI files so the health report can read
    them, while still excluding secrets, binaries, images, vendored trees and
    minified bundles.
    """
    normalized = "/" + path.strip().lstrip("/").lower().replace("\\", "/")
    if any(frag in normalized for frag in _EXCLUDED_DIR_FRAGMENTS):
        return False
    basename = normalized.rsplit("/", 1)[-1]
    if not basename or basename in (".", ".."):
        return False
    if basename in _EXCLUDED_BASENAMES:
        return False
    if basename.endswith(_EXCLUDED_SUFFIXES):
        return False
    if basename.endswith(_MINIFIED_BASENAME_RE):
        return False
    if basename in _MANIFEST_FILES or basename in _CONFIG_FILES:
        return True
    dot = basename.rfind(".")
    if dot == -1:
        # Extensionless files: allow known config/docs names, skip everything
        # else (Makefile, Dockerfile, LICENSE are already covered above).
        return basename in _CONFIG_FILES
    ext = basename[dot:]
    if ext in _IMAGE_EXTENSIONS or ext in _BINARY_EXTENSIONS:
        return False
    if ext in _CODE_EXTENSIONS or ext in _DOCS_EXTENSIONS:
        return True
    if ext in _CONFIG_EXTENSIONS:
        return True
    # Unknown extension: only allow example/env templates and lockfiles.
    return basename.endswith((".example", ".sample", ".template")) or basename.endswith(".lock")


def classify_file(path: str) -> str:
    """Return ``code`` | ``config`` | ``docs`` | ``other`` for a safe path."""
    basename = path.rsplit("/", 1)[-1].lower()
    dot = basename.rfind(".")
    ext = basename[dot:] if dot != -1 else ""
    if basename in _MANIFEST_FILES or basename in _CONFIG_FILES:
        return "config"
    if ext in _CONFIG_EXTENSIONS:
        return "config"
    if ext in _DOCS_EXTENSIONS:
        return "docs"
    if ext in _CODE_EXTENSIONS:
        return "code"
    return "other"


def file_rank(path: str) -> int:
    """Relevance rank: manifests/lockfiles first, then config, then src/app/
    lib/api/server/backend, then everything else."""
    lowered = path.lower()
    basename = lowered.rsplit("/", 1)[-1]
    if basename in _MANIFEST_FILES:
        return 0
    if basename in _CONFIG_FILES or basename.endswith((".config.js", ".config.mjs", ".config.ts")):
        return 1
    segments = lowered.split("/")
    if any(seg in ("src", "app", "lib", "api", "server", "backend") for seg in segments[:-1]):
        return 2
    if lowered.startswith(("src/", "app/", "lib/", "api/", "server/", "backend/")):
        return 2
    if basename in _CONFIG_FILES or basename.endswith((".json", ".yaml", ".yml", ".toml")):
        return 3
    if basename.endswith(tuple(_DOCS_EXTENSIONS)):
        return 5
    return 4


def select_scan_files(
    tree: list[dict],
    *,
    max_files: int | None = None,
    max_file_bytes: int | None = None,
) -> tuple[list[dict], bool]:
    """Filter + order a GitHub tree. Returns ``(files, partial)``.

    ``partial`` is True when scannable files were dropped because of a cap.
    """
    cap_files = settings.instant_scan_max_files if max_files is None else max_files
    cap_bytes = (
        settings.instant_scan_max_file_bytes if max_file_bytes is None else max_file_bytes
    )
    candidates: list[dict] = []
    for entry in tree or []:
        path = str(entry.get("path") or "")
        size = int(entry.get("size") or 0)
        if not path or size <= 0 or size > cap_bytes:
            continue
        if not is_safe_scan_file(path):
            continue
        candidates.append({"path": path, "sha": entry.get("sha"), "size": size})

    # Stable relevance order: manifests first, then src/app/lib/api, then rest.
    candidates.sort(key=lambda e: (file_rank(e["path"]), e["path"]))
    partial = len(candidates) > cap_files
    return candidates[:cap_files], partial


# ---------------------------------------------------------------------------
# Monorepo service detection
# ---------------------------------------------------------------------------
def detect_service_roots(paths: list[str]) -> dict[str, str]:
    """Return ``{prefix: service_name}`` for monorepo package roots.

    A service root is ``apps/<name>``, ``packages/<name>``, ``services/<name>``,
    ``modules/<name>`` or ``libs/<name>`` that contains a manifest/lockfile.
    """
    roots: dict[str, str] = {}
    for path in paths:
        parts = path.split("/")
        if len(parts) < 2:
            continue
        for pattern in _SERVICE_ROOT_PATTERNS:
            if parts[0] + "/" != pattern:
                continue
            name = parts[1]
            if not name or name.startswith("."):
                continue
            prefix = f"{parts[0]}/{name}"
            basename = parts[-1]
            if basename in _MANIFEST_FILES or basename in _CONFIG_FILES:
                roots.setdefault(prefix, name)
                break
    return roots


def service_for_path(path: str, roots: dict[str, str]) -> str:
    """Return the monorepo service prefix for ``path`` (or ``""``)."""
    if not roots:
        return ""
    parts = path.split("/")
    if len(parts) < 2:
        return ""
    prefix = f"{parts[0]}/{parts[1]}"
    return prefix if prefix in roots else ""


def normalize_archive_path(raw_name: str) -> str:
    """Strip the leading ``owner-repo-sha/`` directory GitHub adds to tarballs."""
    name = raw_name.replace("\\", "/").lstrip("./")
    parts = [p for p in name.split("/") if p and p not in (".", "..")]
    if not parts:
        return ""
    # GitHub tarballs always wrap everything in one top-level directory.
    if len(parts) > 1:
        parts = parts[1:]
    return "/".join(parts)
