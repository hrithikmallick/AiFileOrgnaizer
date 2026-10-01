"""Filename and tag sanitization for safe, portable suggestions."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath, PureWindowsPath

MAX_FILENAME_LENGTH = 150
MAX_TAG_LENGTH = 40
MAX_TAGS = 25

WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

_INVALID_CHARS_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
_WHITESPACE_RE = re.compile(r"\s+")
_GENERIC_STEMS = {
    "", "untitled", "unnamed", "file", "document", "doc", "download",
    "downloads", "image", "img", "new", "temp", "tmp", "noname", "unknown",
}


@dataclass(frozen=True)
class SanitizedFilename:
    """Outcome of sanitizing a filename."""

    original: str
    sanitized: str
    changes: list[str] = field(default_factory=list)


def _split_extension(name: str) -> tuple[str, str]:
    """Split ``name`` into (stem, extension-with-dot), ignoring path parts."""
    base = PureWindowsPath(PurePosixPath(name).name).name
    stem, dot, ext = base.rpartition(".")
    if not dot or not stem:
        return base, ""
    return stem, f".{ext}"


def _sanitize_component(value: str) -> str:
    cleaned = _INVALID_CHARS_RE.sub("_", value)
    cleaned = cleaned.replace("\n", " ").replace("\r", " ")
    cleaned = _WHITESPACE_RE.sub(" ", cleaned)
    cleaned = re.sub(r"_{2,}", "_", cleaned)
    return cleaned.strip(" .")


def sanitize_filename(
    name: str,
    fallback: str = "untitled",
    max_length: int = MAX_FILENAME_LENGTH,
) -> SanitizedFilename:
    """Sanitize ``name`` into a safe, portable filename.

    - strips control characters and path separators
    - replaces Windows-illegal characters ``<>:"/\\|?*``
    - collapses whitespace and repeated underscores
    - blocks Windows reserved device names
    - enforces ``max_length`` while preserving the extension
    """
    original = name or ""
    changes: list[str] = []

    base = PureWindowsPath(PurePosixPath(original).name).name
    if base != original:
        changes.append("removed directory components")

    stem, extension = _split_extension(base)
    safe_stem = _sanitize_component(stem)
    safe_ext = _sanitize_component(extension.lstrip("."))

    if safe_stem != stem:
        changes.append("removed invalid characters from stem")
    if extension and safe_ext != extension.lstrip("."):
        changes.append("removed invalid characters from extension")

    if not safe_stem:
        safe_stem = _sanitize_component(fallback) or "untitled"
        changes.append("applied fallback stem")

    if safe_stem.upper() in WINDOWS_RESERVED_NAMES:
        safe_stem = f"_{safe_stem}"
        changes.append("prefixed Windows reserved name")

    ext_suffix = f".{safe_ext}" if safe_ext else ""
    max_stem = max_length - len(ext_suffix)
    if max_stem < 1:
        ext_suffix = ""
        max_stem = max_length
    if len(safe_stem) > max_stem:
        safe_stem = safe_stem[:max_stem].rstrip(" ._")
        if not safe_stem:
            safe_stem = "untitled"[:max_stem]
        changes.append(f"truncated to {max_length} characters")

    sanitized = f"{safe_stem}{ext_suffix}"
    return SanitizedFilename(original=original, sanitized=sanitized, changes=changes)


def sanitize_tags(
    tags: list[str],
    max_tags: int = MAX_TAGS,
    max_length: int = MAX_TAG_LENGTH,
) -> list[str]:
    """Normalize tags: lowercase, de-duplicate, drop empties, bound count/length."""
    result: list[str] = []
    seen: set[str] = set()
    for tag in tags or []:
        cleaned = _sanitize_component(str(tag)).lower().replace(" ", "-")
        if not cleaned:
            continue
        cleaned = cleaned[:max_length].strip("-_")
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
        if len(result) >= max_tags:
            break
    return result


def build_suggested_filename(
    original: str,
    category: str,
    subcategory: str,
    tags: list[str] | None = None,
    max_length: int = MAX_FILENAME_LENGTH,
) -> str:
    """Produce a sanitized filename, replacing generic stems with taxonomy hints."""
    stem, extension = _split_extension(original or "")
    if stem.strip().lower() in _GENERIC_STEMS:
        descriptor = "-".join(part for part in (category, subcategory) if part).lower()
        descriptor = descriptor or "untitled"
        candidate = f"{descriptor}{extension}"
    else:
        candidate = f"{stem}{extension}"
    return sanitize_filename(candidate, max_length=max_length).sanitized
