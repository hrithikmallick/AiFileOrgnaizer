"""OCR endpoint."""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, HTTPException

from app.ocr.engine import get_ocr_engine
from app.schemas.ocr import OcrRequest, OcrResponse

router = APIRouter(tags=["ocr"])


@router.post("/ocr", response_model=OcrResponse)
def ocr(request: OcrRequest) -> OcrResponse:
    """Run local OCR, returning ``available=false`` when Tesseract is absent."""
    if request.encoding == "utf-8":
        data = request.content.encode("utf-8")
    else:
        try:
            data = base64.b64decode(request.content or "", validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail=f"content is not valid base64: {exc}",
            ) from exc

    result = get_ocr_engine().extract(data, language=request.language)
    return OcrResponse(
        available=result.available,
        text=result.text,
        reason=result.reason,
        engine=result.engine,
        language=result.language,
    )
