"""PDF extractor using pypdf or pdfminer.six when installed."""

from __future__ import annotations

from app.config import get_settings
from app.extractors.base import BaseExtractor, ExtractionResult, unavailable_result
from app.logging_config import get_logger

logger = get_logger(__name__)


class PdfExtractor(BaseExtractor):
    """Extract text from the first N pages of a PDF."""

    name = "pdf"

    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        ext = (extension or "").lstrip(".").lower()
        mime = (mime_type or "").lower()
        return ext == "pdf" or mime == "application/pdf"

    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        max_pages = max(1, get_settings().max_pdf_pages)
        text, page_count, warnings = self._extract_pypdf(data, max_pages)
        if text is not None:
            return ExtractionResult(
                text=text,
                extraction_method="pypdf",
                mime_type=mime_type or "application/pdf",
                page_count=page_count,
                truncated=page_count is not None and page_count >= max_pages,
                warnings=warnings,
            )

        text, page_count, warnings = self._extract_pdfminer(data, max_pages)
        if text is not None:
            return ExtractionResult(
                text=text,
                extraction_method="pdfminer",
                mime_type=mime_type or "application/pdf",
                page_count=page_count,
                truncated=page_count is not None and page_count >= max_pages,
                warnings=warnings,
            )

        logger.warning("No PDF backend available (pypdf/pdfminer.six missing)")
        return unavailable_result(
            mime_type or "application/pdf",
            "pypdf or pdfminer.six is not installed",
            extraction_method="pdf-unavailable",
        )

    @staticmethod
    def _extract_pypdf(data: bytes, max_pages: int) -> tuple[str | None, int | None, list[str]]:
        try:
            import io

            from pypdf import PdfReader
        except ImportError:
            return None, None, []

        warnings: list[str] = []
        try:
            reader = PdfReader(io.BytesIO(data))
            total = len(reader.pages)
            chunks: list[str] = []
            for index, page in enumerate(reader.pages[:max_pages]):
                try:
                    chunks.append(page.extract_text() or "")
                except Exception as exc:  # noqa: BLE001 - a bad page must not abort
                    warnings.append(f"page {index + 1} failed: {exc}")
            text = "\n".join(chunks).strip()
            if total > max_pages:
                warnings.append(f"truncated to first {max_pages} of {total} pages")
            return text, total, warnings
        except Exception as exc:  # noqa: BLE001 - corrupt PDFs must not 500
            logger.warning("pypdf failed: %s", exc)
            return None, None, []

    @staticmethod
    def _extract_pdfminer(data: bytes, max_pages: int) -> tuple[str | None, int | None, list[str]]:
        try:
            import io

            from pdfminer.high_level import extract_text
        except ImportError:
            return None, None, []

        try:
            text = extract_text(io.BytesIO(data), page_numbers=list(range(max_pages))).strip()
            return text, None, []
        except Exception as exc:  # noqa: BLE001
            logger.warning("pdfminer failed: %s", exc)
            return None, None, []
