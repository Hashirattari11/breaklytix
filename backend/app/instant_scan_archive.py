"""Repository archive extraction for the anonymous Instant Repo Scan.

Downloads are streamed by :func:`app.github_client.download_repo_archive`; this
module turns the tarball into a small, safe, in-memory map of
``path -> text`` for the scanner and the health report.

Limits (all env-tunable):
  * archive bytes          <= INSTANT_SCAN_MAX_ARCHIVE_BYTES (50 MB)
  * decompressed text kept <= INSTANT_SCAN_MAX_EXTRACT_BYTES (60 MB)
  * files scanned          <= INSTANT_SCAN_MAX_FILES (3000)
  * bytes per file         <= INSTANT_SCAN_MAX_FILE_BYTES (300 KB)

Anything skipped is reported with a reason so the result can say exactly what
was not scanned. File contents are never persisted — only paths, line numbers,
package names and redacted evidence.
"""
from __future__ import annotations

import io
import tarfile
from dataclasses import dataclass, field

from .config import settings
from .instant_scan_files import (
    classify_file,
    detect_service_roots,
    file_rank,
    is_safe_archive_file,
    normalize_archive_path,
)


class ArchiveExtractionError(RuntimeError):
    """The downloaded archive could not be read as a tarball."""


@dataclass
class ExtractedRepo:
    files: dict[str, str] = field(default_factory=dict)
    file_paths: list[str] = field(default_factory=list)
    files_by_type: dict[str, int] = field(default_factory=dict)
    skipped: list[dict] = field(default_factory=list)
    service_roots: dict[str, str] = field(default_factory=dict)
    truncated: bool = False
    total_safe_files: int = 0


_SKIP_DESCRIPTIONS = {
    "excluded_path": "Skipped vendored, secret-bearing, binary or build paths.",
    "too_large": "Skipped files larger than the per-file limit.",
    "binary_or_non_utf8": "Skipped binary or non-UTF-8 files.",
    "file_cap": "Skipped because the file-count cap was reached.",
    "extract_memory_cap": "Skipped because the in-memory extraction cap was reached.",
}


def _skip_reason(skipped: dict[str, int], reason: str, count: int = 1) -> None:
    skipped[reason] = skipped.get(reason, 0) + count


def extract_archive(
    archive_bytes: bytes,
    *,
    max_files: int | None = None,
    max_file_bytes: int | None = None,
    max_extract_bytes: int | None = None,
) -> ExtractedRepo:
    """Extract safe text files from a GitHub tarball.

    Returns an :class:`ExtractedRepo` with the selected files (priority order),
    per-type counts, skip reasons and detected monorepo service roots.
    """
    cap_files = settings.instant_scan_max_files if max_files is None else max_files
    cap_file_bytes = (
        settings.instant_scan_max_file_bytes if max_file_bytes is None else max_file_bytes
    )
    cap_extract_bytes = (
        settings.instant_scan_max_extract_bytes
        if max_extract_bytes is None
        else max_extract_bytes
    )

    skipped: dict[str, int] = {}
    collected: list[tuple[int, str, str, int]] = []
    total_bytes = 0
    byte_cap_hit = False
    total_safe = 0

    try:
        tar = tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz")
    except (tarfile.TarError, OSError) as exc:
        raise ArchiveExtractionError(f"Could not read repository archive: {exc}") from exc

    with tar:
        for member in tar:
            if not member.isfile():
                continue
            path = normalize_archive_path(member.name)
            if not path:
                continue
            if not is_safe_archive_file(path):
                _skip_reason(skipped, "excluded_path")
                continue
            if member.size > cap_file_bytes:
                _skip_reason(skipped, "too_large")
                continue

            total_safe += 1
            if byte_cap_hit:
                _skip_reason(skipped, "extract_memory_cap")
                continue
            if total_bytes + member.size > cap_extract_bytes:
                byte_cap_hit = True
                _skip_reason(skipped, "extract_memory_cap")
                continue

            extracted = tar.extractfile(member)
            if extracted is None:
                _skip_reason(skipped, "binary_or_non_utf8")
                continue
            raw = extracted.read()
            if len(raw) > cap_file_bytes:
                _skip_reason(skipped, "too_large")
                continue
            # Cheap binary sniff: NUL bytes in the first 8 KB.
            if b"\x00" in raw[:8192]:
                _skip_reason(skipped, "binary_or_non_utf8")
                continue
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                _skip_reason(skipped, "binary_or_non_utf8")
                continue

            total_bytes += len(raw)
            collected.append((file_rank(path), path, text, len(raw)))

    collected.sort(key=lambda item: (item[0], item[1]))
    selected = collected[:cap_files]
    if len(collected) > cap_files:
        skipped["file_cap"] = skipped.get("file_cap", 0) + (len(collected) - cap_files)

    files: dict[str, str] = {}
    files_by_type: dict[str, int] = {"code": 0, "config": 0, "docs": 0, "other": 0}
    for _rank, path, text, _size in selected:
        files[path] = text
        files_by_type[classify_file(path)] = files_by_type.get(classify_file(path), 0) + 1

    file_paths = list(files.keys())
    service_roots = detect_service_roots(file_paths)
    truncated = bool(
        skipped.get("file_cap")
        or skipped.get("extract_memory_cap")
        or skipped.get("too_large")
        or byte_cap_hit
    )

    skip_rows = [
        {"reason": reason, "count": count, "description": _SKIP_DESCRIPTIONS.get(reason, reason)}
        for reason, count in sorted(skipped.items(), key=lambda kv: (-kv[1], kv[0]))
        if count
    ]

    return ExtractedRepo(
        files=files,
        file_paths=file_paths,
        files_by_type=files_by_type,
        skipped=skip_rows,
        service_roots=service_roots,
        truncated=truncated,
        total_safe_files=total_safe,
    )
