"""Schemas for ``POST /extract``."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExtractRequest(BaseModel):
    """Raw content to extract text from."""

    content: str = Field(description="Text, or base64-encoded bytes.")
    encoding: Literal["utf-8", "base64"] = "utf-8"
    filename: str | None = None
    mime_type: str | None = None
    extension: str | None = None


class ExtractResponse(BaseModel):
    """Extraction result, always returned (never raises for optional deps)."""

    text: str
    extraction_method: str
    mime_type: str | None = None
    page_count: int | None = None
    truncated: bool = False
    char_count: int = 0
    warnings: list[str] = Field(default_factory=list)
