"""Content extraction endpoint."""

from __future__ import annotations

import base64
import binascii
from pathlib import PurePosixPath

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.extractors.registry import get_extractor
from app.logging_config import get_logger
from app.schemas.extract import ExtractRequest, ExtractResponse
from app.services.content_limits import limit_text

router = APIRouter(tags=["extract"])
logger = get_logger(__name__)


def _decode(request: ExtractRequest) -> bytes:
    if request.encoding == "utf-8":
        return request.content.encode("utf-8")
    try:
        return base64.b64decode(request.content or "", validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"content is not valid base64: {exc}",
        ) from exc


@router.post("/extract", response_model=ExtractResponse)
def extract(request: ExtractRequest) -> ExtractResponse:
    """Extract text from supplied content without ever raising for optional deps."""
    data = _decode(request)
    extension = request.extension
    if not extension and request.filename:
        extension = PurePosixPath(request.filename).suffix.lstrip(".")

    extractor = get_extractor(request.mime_type, extension)
    result = extractor.extract(
        data,
        filename=request.filename,
        mime_type=request.mime_type,
        extension=extension,
    )

    limited = limit_text(result.text, get_settings().max_text_chars)
    warnings = list(result.warnings)
    if limited.truncated:
        warnings.append(f"text truncated to {get_settings().max_text_chars} characters")

    return ExtractResponse(
        text=limited.text,
        extraction_method=result.extraction_method,
        mime_type=result.mime_type or request.mime_type,
        page_count=result.page_count,
        truncated=result.truncated or limited.truncated,
        char_count=len(limited.text),
        warnings=warnings,
    )
