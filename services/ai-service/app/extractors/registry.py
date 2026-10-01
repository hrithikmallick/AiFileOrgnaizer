"""Extractor registry and MIME/extension dispatch."""

from __future__ import annotations

from app.extractors.base import BaseExtractor, ExtractionResult, unavailable_result
from app.extractors.code_extractor import CodeExtractor
from app.extractors.docx_extractor import DocxExtractor
from app.extractors.image_ocr_extractor import ImageOcrExtractor
from app.extractors.markdown_extractor import MarkdownExtractor
from app.extractors.pdf_extractor import PdfExtractor
from app.extractors.text_extractor import TextExtractor


class FallbackExtractor(BaseExtractor):
    """Last-resort extractor that reports unsupported binary content."""

    name = "unsupported"

    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        return True

    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        return unavailable_result(
            mime_type,
            f"No extractor registered for mime={mime_type!r} extension={extension!r}",
            extraction_method="unsupported",
        )


class ExtractorRegistry:
    """Resolve the best extractor for a file type."""

    def __init__(self, extractors: list[BaseExtractor] | None = None) -> None:
        self._extractors = extractors or default_extractors()
        self._fallback = FallbackExtractor()

    @property
    def extractors(self) -> list[BaseExtractor]:
        """Registered extractors in resolution order."""
        return list(self._extractors)

    def get_extractor(
        self, mime_type: str | None, extension: str | None
    ) -> BaseExtractor:
        """Return the first extractor that supports the type, else fallback."""
        for extractor in self._extractors:
            if extractor.supports(mime_type, extension):
                return extractor
        return self._fallback


def default_extractors() -> list[BaseExtractor]:
    """Return extractors in priority order (specific before generic)."""
    return [
        PdfExtractor(),
        DocxExtractor(),
        ImageOcrExtractor(),
        MarkdownExtractor(),
        CodeExtractor(),
        TextExtractor(),
    ]


_REGISTRY = ExtractorRegistry()


def get_extractor(mime_type: str | None, extension: str | None) -> BaseExtractor:
    """Module-level registry lookup used by the API and pipeline."""
    return _REGISTRY.get_extractor(mime_type, extension)
