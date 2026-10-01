"""Local OCR engine backed by Tesseract when available.

The engine never raises because of a missing optional dependency; callers get
an ``available=False`` result describing why OCR could not run.
"""

from __future__ import annotations

import io
import shutil
from dataclasses import dataclass
from functools import lru_cache

from app.config import Settings, get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class OcrResult:
    """Outcome of an OCR request."""

    available: bool
    text: str = ""
    reason: str | None = None
    engine: str = "tesseract"
    language: str | None = None


class OcrEngine:
    """OCR images using pytesseract + Pillow when both are installed."""

    name = "tesseract"

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._pytesseract = None
        self._image_module = None
        self._available = False
        self._reason: str | None = None
        self._probe()

    @property
    def available(self) -> bool:
        """Whether OCR can actually run in this environment."""
        return self._available

    @property
    def reason(self) -> str | None:
        """Why OCR is unavailable, if it is."""
        return self._reason

    def _probe(self) -> None:
        try:
            import pytesseract
            from PIL import Image
        except ImportError as exc:
            self._reason = f"pytesseract/Pillow not installed ({exc})"
            logger.info("OCR unavailable: %s", self._reason)
            return

        if self._settings.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self._settings.tesseract_cmd
        elif shutil.which("tesseract") is None:
            self._reason = "tesseract binary not found on PATH"
            logger.info("OCR unavailable: %s", self._reason)
            return

        try:
            pytesseract.get_tesseract_version()
        except Exception as exc:  # pytesseract raises several error types
            self._reason = f"tesseract executable not usable ({exc})"
            logger.info("OCR unavailable: %s", self._reason)
            return

        self._pytesseract = pytesseract
        self._image_module = Image
        self._available = True

    def extract(self, data: bytes, language: str | None = None) -> OcrResult:
        """Run OCR over raw image bytes."""
        resolved_language = language or self._settings.ocr_language
        if not self._available or self._pytesseract is None or self._image_module is None:
            return OcrResult(
                available=False,
                text="",
                reason=self._reason or "OCR backend unavailable",
                engine=self.name,
                language=resolved_language,
            )
        try:
            with self._image_module.open(io.BytesIO(data)) as image:
                text = self._pytesseract.image_to_string(image, lang=resolved_language)
            return OcrResult(
                available=True,
                text=text,
                reason=None,
                engine=self.name,
                language=resolved_language,
            )
        except Exception as exc:  # noqa: BLE001 - OCR must never crash callers
            logger.warning("OCR failed: %s", exc)
            return OcrResult(
                available=False,
                text="",
                reason=f"OCR failed: {exc}",
                engine=self.name,
                language=resolved_language,
            )


@lru_cache(maxsize=1)
def get_ocr_engine() -> OcrEngine:
    """Return the process-wide OCR engine singleton."""
    return OcrEngine()


def reset_ocr_cache() -> None:
    """Clear the cached OCR engine (used by tests)."""
    get_ocr_engine.cache_clear()
