"""Shared schema primitives."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness payload."""

    status: str = Field(examples=["ok"])
    service: str
    version: str


class ReadyResponse(BaseModel):
    """Readiness payload describing local subsystem availability."""

    status: str = Field(examples=["ready"])
    category_tree_loaded: bool
    rule_count: int
    llm_configured: bool
    embedding_backend: str


class ErrorResponse(BaseModel):
    """Uniform error body returned by the global exception handlers."""

    error: str
    detail: str
    status_code: int
    context: dict[str, Any] = Field(default_factory=dict)
