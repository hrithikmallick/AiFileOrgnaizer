"""Logging helpers."""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    """Configure a single stdout handler for the process.

    Idempotent: repeated calls only adjust the level, so the API and the
    uvicorn workers do not stack duplicate handlers.
    """
    global _CONFIGURED
    resolved = getattr(logging, level.upper(), logging.INFO)

    if _CONFIGURED:
        logging.getLogger().setLevel(resolved)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s")
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(resolved)
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger."""
    return logging.getLogger(name)
