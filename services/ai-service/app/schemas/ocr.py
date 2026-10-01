"""Schemas for ``POST /ocr``."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class OcrRequest(BaseModel):
    """Image payload to run OCR against."""

    content: str = Field(description="Base64 image bytes.")
    encoding: Literal["base64", "utf-8"] = "base64"
    language: str | None = None


class OcrResponse(BaseModel):
    """OCR result; ``available`` is false when local OCR is not installed."""

    available: bool
    text: str = ""
    reason: str | None = None
    engine: str = "tesseract"
    language: str | None = None
