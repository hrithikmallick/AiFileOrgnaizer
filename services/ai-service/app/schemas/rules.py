"""Schemas for the rules endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

MatchType = Literal["extension", "filename_regex", "mime", "magic"]


class RuleModel(BaseModel):
    """A deterministic classification rule."""

    id: str
    name: str
    priority: int
    enabled: bool = True
    match_type: MatchType
    pattern: str
    category: str
    subcategory: str | None = None
    confidence: float = Field(default=0.95, ge=0.0, le=1.0)
    is_builtin: bool = True


class RulesResponse(BaseModel):
    """All rules, ordered by priority."""

    rules: list[RuleModel]


class RuleEvaluateRequest(BaseModel):
    """Evaluate the rule engine against a single candidate file."""

    filename: str
    mime_type: str | None = None
    extension: str | None = None
    content: str = ""
    content_base64: str | None = None


class RuleEvaluateResponse(BaseModel):
    """Result of a rule evaluation."""

    matched: bool
    rule: RuleModel | None = None
    category: str
    subcategory: str
    confidence: float = Field(ge=0.0, le=1.0)
