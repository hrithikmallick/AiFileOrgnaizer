"""End-to-end analysis pipeline: extract -> limit -> classify -> validate."""

from __future__ import annotations

import base64
import binascii
from functools import lru_cache
from pathlib import PurePosixPath

from app.classifiers.categories import CategoryTree, get_category_tree
from app.classifiers.orchestrator import ClassifierOrchestrator
from app.config import Settings, get_settings
from app.extractors.base import ExtractionResult
from app.extractors.registry import ExtractorRegistry
from app.logging_config import get_logger
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse
from app.services.content_limits import limit_text
from app.services.validation import build_suggested_filename, sanitize_tags

logger = get_logger(__name__)

_PROVIDED_TEXT_METHOD = "provided-text"


class AnalysisPipeline:
    """Coordinates extraction, classification and filename suggestion."""

    def __init__(
        self,
        settings: Settings | None = None,
        tree: CategoryTree | None = None,
        orchestrator: ClassifierOrchestrator | None = None,
        registry: ExtractorRegistry | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._tree = tree or get_category_tree()
        self._orchestrator = orchestrator or ClassifierOrchestrator(self._settings, self._tree)
        self._registry = registry or ExtractorRegistry()

    def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        """Run the full analysis pipeline for a single file."""
        extraction = self._extract(request)
        limited = limit_text(extraction.text, self._settings.max_text_chars)

        classification = self._orchestrator.classify(
            filename=request.filename,
            mime_type=request.mime_type,
            extension=request.extension,
            content=limited.text,
            tags=request.tags,
        )

        category, subcategory = self._tree.normalize(
            classification.category, classification.subcategory
        )
        tags = sanitize_tags([*request.tags, *classification.tags])
        suggested = build_suggested_filename(
            request.filename, category, subcategory, tags
        )
        summary = classification.summary or "No summary available."

        return AnalyzeResponse(
            category=category,
            subcategory=subcategory,
            suggested_filename=suggested,
            tags=tags,
            summary=summary,
            confidence=round(min(max(classification.confidence, 0.0), 1.0), 4),
            source=classification.source,  # type: ignore[arg-type]
            model_name=classification.model_name,
        )

    def _extract(self, request: AnalyzeRequest) -> ExtractionResult:
        if request.content_encoding == "text":
            return ExtractionResult(
                text=request.content or "",
                extraction_method=_PROVIDED_TEXT_METHOD,
                mime_type=request.mime_type,
                page_count=None,
            )

        try:
            data = base64.b64decode(request.content or "", validate=True)
        except (binascii.Error, ValueError) as exc:
            logger.warning("Invalid base64 content for %s: %s", request.filename, exc)
            return ExtractionResult(
                text="",
                extraction_method="invalid-base64",
                mime_type=request.mime_type,
                warnings=[f"content was not valid base64: {exc}"],
            )

        extension = request.extension or PurePosixPath(request.filename).suffix.lstrip(".")
        extractor = self._registry.get_extractor(request.mime_type, extension)
        return extractor.extract(
            data,
            filename=request.filename,
            mime_type=request.mime_type,
            extension=extension,
        )


@lru_cache(maxsize=1)
def get_pipeline() -> AnalysisPipeline:
    """Return the process-wide analysis pipeline singleton."""
    return AnalysisPipeline()


def reset_pipeline_cache() -> None:
    """Clear the cached pipeline (used by tests)."""
    get_pipeline.cache_clear()
