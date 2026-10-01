"""Markdown extractor (pure Python)."""

from __future__ import annotations

import re

from app.extractors.base import BaseExtractor, ExtractionResult
from app.extractors.text_extractor import decode_text

_EXTENSIONS = {"md", "markdown", "mdx", "mdown", "mkd"}
_FRONT_MATTER_RE = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)


class MarkdownExtractor(BaseExtractor):
    """Extract Markdown text while stripping YAML front matter."""

    name = "markdown"

    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        ext = (extension or "").lstrip(".").lower()
        mime = (mime_type or "").lower()
        return ext in _EXTENSIONS or mime in {"text/markdown", "text/x-markdown"}

    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        raw = decode_text(data)
        text = _FRONT_MATTER_RE.sub("", raw)
        return ExtractionResult(
            text=text,
            extraction_method=self.name,
            mime_type=mime_type,
            page_count=1,
            warnings=[],
        )
