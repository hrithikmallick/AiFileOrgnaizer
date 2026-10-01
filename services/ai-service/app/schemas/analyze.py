"""Schemas for ``POST /analyze``."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ContentEncoding = Literal["text", "base64"]


class AnalyzeRequest(BaseModel):
    """Input describing a single file to classify."""

    filename: str = Field(min_length=1, max_length=1024)
    mime_type: str | None = None
    content: str = Field(default="", description="File text, or base64 bytes.")
    content_encoding: ContentEncoding = "text"
    extension: str | None = None
    size: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    """Strict classification result."""

    category: str
    subcategory: str
    suggested_filename: str
    tags: list[str] = Field(default_factory=list)
    summary: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: Literal["rule", "ai", "fallback"]
    model_name: str
