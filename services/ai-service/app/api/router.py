"""Aggregate all route modules into a single router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import analyze, embed, extract, health, ocr, rules, runtime, search

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(analyze.router)
api_router.include_router(extract.router)
api_router.include_router(embed.router)
api_router.include_router(search.router)
api_router.include_router(ocr.router)
api_router.include_router(rules.router)
api_router.include_router(runtime.router)

__all__ = ["api_router"]
