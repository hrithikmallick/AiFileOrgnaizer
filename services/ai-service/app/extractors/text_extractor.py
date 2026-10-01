"""Plain-text extractor (pure Python)."""

from __future__ import annotations

from app.extractors.base import BaseExtractor, ExtractionResult

TEXT_EXTENSIONS = {
    "txt", "text", "log", "csv", "tsv", "ini", "cfg", "conf", "env", "json",
    "jsonl", "ndjson", "yaml", "yml", "toml", "xml", "html", "htm", "rtf",
    "srt", "vtt", "tex",
}

TEXT_MIME_PREFIXES = ("text/",)
TEXT_MIMES = {
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/yaml",
    "application/toml",
}


def decode_text(data: bytes) -> str:
    """Decode bytes as UTF-8 with a lossless fallback to latin-1."""
    if not data:
        return ""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")


class TextExtractor(BaseExtractor):
    """Decode textual files into Unicode."""

    name = "text"

    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        ext = (extension or "").lstrip(".").lower()
        mime = (mime_type or "").lower()
        if ext in TEXT_EXTENSIONS:
            return True
        if any(mime.startswith(prefix) for prefix in TEXT_MIME_PREFIXES):
            return True
        return mime in TEXT_MIMES

    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        text = decode_text(data)
        return ExtractionResult(
            text=text,
            extraction_method=self.name,
            mime_type=mime_type,
            page_count=1,
            warnings=[],
        )
