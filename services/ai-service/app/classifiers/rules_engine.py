"""Deterministic rule engine.

Rules are evaluated in ascending priority order (lower runs first). The first
matching enabled rule wins, which makes classification reproducible without any
model calls.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.classifiers.categories import CategoryTree
from app.logging_config import get_logger

logger = get_logger(__name__)

MatchType = str

MAGIC_SIGNATURES: dict[str, bytes] = {
    "pdf": b"%PDF",
    "zip": b"PK\x03\x04",
    "rar": b"Rar!",
    "7z": b"7z\xbc\xaf\x27\x1c",
    "gzip": b"\x1f\x8b",
    "png": b"\x89PNG\r\n\x1a\n",
    "jpeg": b"\xff\xd8\xff",
    "gif": b"GIF8",
    "exe": b"MZ",
    "elf": b"\x7fELF",
}


def _normalize_extension(extension: str | None) -> str:
    if not extension:
        return ""
    return extension.strip().lower().lstrip(".")


def extension_from_name(filename: str) -> str:
    """Return the lowercase extension (without dot) of ``filename``."""
    suffix = PurePosixPath(filename or "").suffix
    return suffix.lstrip(".").lower()


@dataclass(frozen=True)
class Rule:
    """A single deterministic classification rule."""

    id: str
    name: str
    priority: int
    match_type: MatchType
    pattern: str
    category: str
    subcategory: str | None = None
    confidence: float = 0.95
    enabled: bool = True
    is_builtin: bool = True


@dataclass(frozen=True)
class RuleMatch:
    """A successful rule evaluation."""

    rule: Rule
    confidence: float

    @property
    def category(self) -> str:
        return self.rule.category

    @property
    def subcategory(self) -> str:
        return self.rule.subcategory or ""


def default_rules() -> list[Rule]:
    """Return the built-in rule set."""
    return [
        Rule("builtin-screenshot", "Screenshot filenames", 10, "filename_regex",
             r"screenshot|screen[\s_-]?shot|snip", "Images", "Screenshots", 0.95),
        Rule("builtin-code", "Source code", 15, "extension",
             "py,rs,ts,tsx,js,jsx,go,java,kt,kts,c,cc,cpp,cxx,h,hpp,cs,rb,php,swift,scala,"
             "sh,bash,zsh,ps1,sql,pl,lua,r,ex,exs,clj,hs,elm,dart,vue,svelte",
             "Development", "Code", 0.96),
        Rule("builtin-invoice", "Invoice documents", 20, "filename_regex",
             r"\binvoice|\bbill(?:ing)?\b", "Finance", "Invoices", 0.95),
        Rule("builtin-statement", "Bank/account statements", 21, "filename_regex",
             r"\bstatement\b|\bbank[\s_-]?statement", "Finance", "Statements", 0.95),
        Rule("builtin-receipt", "Receipts", 22, "filename_regex",
             r"\breceipt\b", "Finance", "Receipts", 0.95),
        Rule("builtin-tax", "Tax documents", 23, "filename_regex",
             r"\btax(?:es)?\b|\bw-?2\b|\b1099\b", "Finance", "Taxes", 0.93),
        Rule("builtin-resume", "Resumes and CVs", 30, "filename_regex",
             r"\bresume\b|\bcv\b|curriculum[\s_-]?vitae", "Personal", "Identity", 0.93),
        Rule("builtin-docker", "Docker documentation", 40, "filename_regex",
             r"docker|compose\.ya?ml", "Development", "Documentation", 0.92),
        Rule("builtin-installer-ext", "Installer packages", 50, "extension",
             "exe,msi,dmg,pkg,deb,rpm,apk,appimage", "Software", "Installers", 0.98),
        Rule("builtin-installer-magic", "Executable magic bytes", 51, "magic",
             "exe", "Software", "Installers", 0.97),
        Rule("builtin-archive-zip", "ZIP archives", 60, "extension",
             "zip", "Archives", "Zip", 0.97),
        Rule("builtin-archive-compressed", "Compressed archives", 61, "extension",
             "rar,7z,tar,gz,tgz,bz2,tbz2,xz,txz,lz,lzma,iso", "Archives", "Compressed", 0.96),
        Rule("builtin-archive-magic", "Archive magic bytes", 62, "magic",
             "zip,rar,7z,gzip", "Archives", "Compressed", 0.92),
        Rule("builtin-markdown", "Markdown notes", 80, "extension",
             "md,markdown,mdx", "Documents", "Notes", 0.9),
        Rule("builtin-image-ext", "Images", 90, "extension",
             "jpg,jpeg,png,gif,bmp,tiff,tif,webp,heic,heif,svg,raw,cr2,nef",
             "Images", "Photos", 0.9),
        Rule("builtin-image-mime", "Image MIME types", 91, "mime",
             "image/*", "Images", "Photos", 0.9),
        Rule("builtin-pdf-ext", "PDF documents", 100, "extension",
             "pdf", "Documents", "Reports", 0.9),
        Rule("builtin-pdf-mime", "PDF MIME type", 101, "mime",
             "application/pdf", "Documents", "Reports", 0.9),
        Rule("builtin-pdf-magic", "PDF magic bytes", 102, "magic",
             "pdf", "Documents", "Reports", 0.9),
    ]


class RuleEngine:
    """Evaluate deterministic rules over a candidate file."""

    def __init__(self, rules: list[Rule] | None = None, tree: CategoryTree | None = None) -> None:
        self._rules: list[Rule] = sorted(
            rules if rules is not None else default_rules(),
            key=lambda rule: (rule.priority, rule.id),
        )
        self._tree = tree

    @property
    def rules(self) -> list[Rule]:
        """Rules ordered by evaluation priority."""
        return list(self._rules)

    def evaluate(
        self,
        filename: str,
        mime_type: str | None = None,
        extension: str | None = None,
        data: bytes | None = None,
    ) -> RuleMatch | None:
        """Return the first matching rule, or ``None``."""
        ext = _normalize_extension(extension) or extension_from_name(filename)
        mime = (mime_type or "").strip().lower()
        # Treat separators (``_``, ``-``, ``.``, ...) as word boundaries so
        # ``\b`` patterns like ``\breceipt\b`` match ``receipt_2024.pdf``.
        name = re.sub(r"[^a-z0-9]+", " ", (filename or "").lower())
        blob = data if data is not None else b""

        for rule in self._rules:
            if not rule.enabled:
                continue
            if self._matches(rule, name, mime, ext, blob):
                category, subcategory = self._resolve(rule)
                resolved = Rule(
                    id=rule.id,
                    name=rule.name,
                    priority=rule.priority,
                    match_type=rule.match_type,
                    pattern=rule.pattern,
                    category=category,
                    subcategory=subcategory,
                    confidence=rule.confidence,
                    enabled=rule.enabled,
                    is_builtin=rule.is_builtin,
                )
                logger.debug("Rule %s matched %s", rule.id, filename)
                return RuleMatch(rule=resolved, confidence=rule.confidence)
        return None

    def _resolve(self, rule: Rule) -> tuple[str, str | None]:
        if self._tree is None:
            return rule.category, rule.subcategory
        return self._tree.normalize(rule.category, rule.subcategory)

    @staticmethod
    def _matches(
        rule: Rule,
        name: str,
        mime: str,
        ext: str,
        blob: bytes,
    ) -> bool:
        match_type = rule.match_type
        if match_type == "extension":
            allowed = {_normalize_extension(part) for part in rule.pattern.split(",")}
            return bool(ext) and ext in allowed
        if match_type == "filename_regex":
            try:
                pattern = re.compile(rule.pattern, re.IGNORECASE)
            except re.error:
                logger.warning("Invalid regex in rule %s", rule.id)
                return False
            return bool(pattern.search(name))
        if match_type == "mime":
            pattern = rule.pattern.strip().lower()
            if not mime:
                return False
            if pattern.endswith("/*"):
                return mime.startswith(pattern[:-1])
            return mime == pattern
        if match_type == "magic":
            signatures = [_normalize_extension(part) for part in rule.pattern.split(",")]
            return any(
                sig in MAGIC_SIGNATURES and blob.startswith(MAGIC_SIGNATURES[sig])
                for sig in signatures
            )
        return False
