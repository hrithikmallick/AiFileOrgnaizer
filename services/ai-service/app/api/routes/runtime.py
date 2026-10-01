"""Loopback-only runtime configuration supplied by the Rust desktop host."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.pipeline import reset_pipeline_cache

router = APIRouter(tags=["runtime"])


class LocalModelConfig(BaseModel):
    """A local OpenAI-compatible endpoint started by the desktop app."""

    base_url: str = Field(min_length=1)
    model_name: str = Field(min_length=1, max_length=200)


@router.post("/runtime/local-model")
def configure_local_model(config: LocalModelConfig) -> dict[str, str]:
    """Use only a loopback LLM endpoint and rebuild the cached pipeline."""
    settings = get_settings()
    previous_url, previous_model = settings.llm_base_url, settings.llm_model
    settings.llm_base_url = config.base_url.rstrip("/")
    settings.llm_model = config.model_name
    try:
        settings.validate_local_endpoints()
    except ValueError as exc:
        settings.llm_base_url, settings.llm_model = previous_url, previous_model
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    reset_pipeline_cache()
    return {"base_url": settings.llm_base_url, "model_name": settings.llm_model}


@router.post("/runtime/local-model/disable")
def disable_local_model() -> dict[str, str]:
    """Return to the local heuristic when the Rust-owned server stops."""
    settings = get_settings()
    settings.llm_base_url = None
    reset_pipeline_cache()
    return {"status": "disabled"}
