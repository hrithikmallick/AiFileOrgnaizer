"""Schemas for ``POST /search``."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class SearchItem(BaseModel):
    """A vector-backed document in the local in-memory index."""

    id: str
    vector: list[float]
    text: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchRequest(BaseModel):
    """Semantic search over supplied items or the process-local store."""

    query: str | None = None
    query_vector: list[float] | None = None
    items: list[SearchItem] | None = None
    top_k: int = Field(default=5, ge=1, le=100)

    @model_validator(mode="after")
    def _require_query(self) -> "SearchRequest":
        if not self.query and not self.query_vector:
            raise ValueError("either 'query' or 'query_vector' must be provided")
        return self


class SearchHit(BaseModel):
    """A single scored search result."""

    id: str
    score: float
    text: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    """Ordered search results."""

    hits: list[SearchHit]
    backend: str
    dimension: int
