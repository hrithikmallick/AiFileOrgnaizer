"""Shared pytest fixtures.

The tests must run offline and deterministically, so any ``LAFO_`` overrides
from the host environment are removed before the application is imported.
"""

from __future__ import annotations

import os

for _key in [key for key in os.environ if key.startswith("LAFO_")]:
    os.environ.pop(_key, None)

import pytest
from fastapi.testclient import TestClient

from app.embeddings.store import get_vector_store
from app.main import create_app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """A TestClient bound to a freshly built application."""
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _isolated_store() -> None:
    """Keep the process-local vector store empty between tests."""
    store = get_vector_store()
    store.clear()
    yield
    store.clear()
