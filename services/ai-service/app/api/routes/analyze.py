"""Classification endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse
from app.services.pipeline import AnalysisPipeline, get_pipeline

router = APIRouter(tags=["analyze"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(
    request: AnalyzeRequest,
    pipeline: AnalysisPipeline = Depends(get_pipeline),
) -> AnalyzeResponse:
    """Classify a file and suggest a safe filename."""
    return pipeline.analyze(request)
