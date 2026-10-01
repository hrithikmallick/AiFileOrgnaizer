"""Image extractor that delegates to the local OCR engine."""

from __future__ import annotations

from app.extractors.base import BaseExtractor, ExtractionResult, unavailable_result
from app.logging_config import get_logger
from app.ocr.engine import OcrEngine, get_ocr_engine

logger = get_logger(__name__)

IMAGE_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "heic", "heif",
}


class ImageOcrExtractor(BaseExtractor):
    """Extract text from images via OCR when available."""

    name = "image-ocr"

    def __init__(self, engine: OcrEngine | None = None) -> None:
        self._engine = engine or get_ocr_engine()

    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        ext = (extension or "").lstrip(".").lower()
        mime = (mime_type or "").lower()
        return ext in IMAGE_EXTENSIONS or mime.startswith("image/")

    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        result = self._engine.extract(data)
        if not result.available:
            logger.warning("Image OCR unavailable: %s", result.reason)
            return unavailable_result(
                mime_type,
                result.reason or "OCR unavailable",
                extraction_method="ocr-unavailable",
            )
        return ExtractionResult(
            text=result.text,
            extraction_method=self.name,
            mime_type=mime_type,
            page_count=1,
            warnings=[],
        )
