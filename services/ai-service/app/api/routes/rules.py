"""Rule inspection and evaluation endpoints."""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter

from app.classifiers.categories import get_category_tree
from app.classifiers.rules_engine import Rule, RuleEngine
from app.schemas.rules import (
    RuleEvaluateRequest,
    RuleEvaluateResponse,
    RuleModel,
    RulesResponse,
)

router = APIRouter(tags=["rules"])


def _to_model(rule: Rule) -> RuleModel:
    return RuleModel(
        id=rule.id,
        name=rule.name,
        priority=rule.priority,
        enabled=rule.enabled,
        match_type=rule.match_type,  # type: ignore[arg-type]
        pattern=rule.pattern,
        category=rule.category,
        subcategory=rule.subcategory,
        confidence=rule.confidence,
        is_builtin=rule.is_builtin,
    )


def _decode_bytes(payload: str | None) -> bytes | None:
    if not payload:
        return None
    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        return None


@router.get("/rules", response_model=RulesResponse)
def list_rules() -> RulesResponse:
    """List all built-in rules ordered by priority."""
    engine = RuleEngine(tree=get_category_tree())
    return RulesResponse(rules=[_to_model(rule) for rule in engine.rules])


@router.post("/rules/evaluate", response_model=RuleEvaluateResponse)
def evaluate_rules(request: RuleEvaluateRequest) -> RuleEvaluateResponse:
    """Evaluate the rule engine against a candidate file."""
    tree = get_category_tree()
    engine = RuleEngine(tree=tree)
    data = _decode_bytes(request.content_base64)
    if data is None and request.content:
        data = request.content.encode("utf-8", errors="replace")

    match = engine.evaluate(
        filename=request.filename,
        mime_type=request.mime_type,
        extension=request.extension,
        data=data,
    )
    if match is None:
        return RuleEvaluateResponse(
            matched=False,
            rule=None,
            category=tree.fallback_category,
            subcategory=tree.fallback_subcategory,
            confidence=0.0,
        )
    return RuleEvaluateResponse(
        matched=True,
        rule=_to_model(match.rule),
        category=match.category,
        subcategory=match.subcategory or tree.default_subcategory(match.category),
        confidence=match.confidence,
    )
