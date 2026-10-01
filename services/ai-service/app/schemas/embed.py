"""Schemas for ``POST /embed``."""

from __future__ import annotations

from pydantic import BaseModel, Field


class EmbedRequest(BaseModel):
    """Texts to embed locally."""

    texts: list[str] = Field(min_length=1)
    model_name: str | None = None


class EmbedResponse(BaseModel):
    """Embedding vectors plus backend metadata."""

    embeddings: list[list[float]]
    dimension: int
    backend: str
    model_name: str
