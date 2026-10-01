"""Liveness and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app import __version__
from app.classifiers.categories import get_category_tree
from app.classifiers.rules_engine import RuleEngine
from app.config import get_settings
from app.embeddings.embedder import get_embedder
from app.schemas.common import HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report that the process is up."""
    settings = get_settings()
    return HealthResponse(status="ok", service=settings.app_name, version=__version__)


@router.get("/ready", response_model=ReadyResponse)
def ready(response: Response) -> ReadyResponse:
    """Report readiness of local subsystems used by every request."""
    try:
        tree = get_category_tree()
        rule_count = len(RuleEngine(tree=tree).rules)
        category_tree_loaded = bool(tree.names)
    except Exception:  # noqa: BLE001 - readiness must report, not raise
        category_tree_loaded = False
        rule_count = 0

    if not category_tree_loaded:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    settings = get_settings()
    return ReadyResponse(
        status="ready" if category_tree_loaded else "not-ready",
        category_tree_loaded=category_tree_loaded,
        rule_count=rule_count,
        llm_configured=settings.llm_configured,
        embedding_backend=get_embedder().backend,
    )
