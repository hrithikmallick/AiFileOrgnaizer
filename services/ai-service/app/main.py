"""FastAPI application factory and entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.router import api_router
from app.classifiers.categories import get_category_tree
from app.classifiers.rules_engine import RuleEngine
from app.config import get_settings
from app.logging_config import configure_logging, get_logger

logger = get_logger(__name__)

_LOCALHOST_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Warm local, network-free subsystems on startup."""
    settings = get_settings()
    configure_logging(settings.log_level)
    tree = get_category_tree()
    rule_count = len(RuleEngine(tree=tree).rules)
    logger.info(
        "Warmed %s: %s categories, %s rules, llm_configured=%s",
        settings.app_name,
        len(tree.names),
        rule_count,
        settings.llm_configured,
    )
    yield
    logger.info("%s shutting down", settings.app_name)


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation_error",
                "detail": "Request payload failed validation.",
                "status_code": 422,
                "context": {"errors": _jsonable(exc.errors())},
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "http_error",
                "detail": str(exc.detail),
                "status_code": exc.status_code,
                "context": {},
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_error",
                "detail": "An unexpected internal error occurred.",
                "status_code": 500,
                "context": {},
            },
        )


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    settings.validate_local_endpoints()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Local AI File Organizer - AI Service",
        description="Fully local classification, extraction, embedding and OCR service.",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=_LOCALHOST_ORIGIN_REGEX,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    _register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()


def run() -> None:
    """Run the service with uvicorn (console-script entrypoint)."""
    import uvicorn

    settings = get_settings()
    settings.validate_local_endpoints()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":  # pragma: no cover
    run()
