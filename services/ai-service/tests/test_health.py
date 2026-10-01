"""Health and readiness endpoint tests."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.config import Settings


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "lafo-ai-service"
    assert body["version"]
    assert set(body) == {"status", "service", "version"}


def test_ready_ok(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["category_tree_loaded"] is True
    assert body["rule_count"] > 0
    assert body["embedding_backend"] in {"hash", "sentence-transformers"}


def test_rejects_remote_llm_endpoint() -> None:
    with pytest.raises(ValueError, match="loopback"):
        Settings(llm_base_url="https://example.com/v1").validate_local_endpoints()


def test_runtime_model_configuration_is_loopback_only(client: TestClient) -> None:
    rejected = client.post(
        "/runtime/local-model",
        json={"base_url": "https://example.com/v1", "model_name": "remote"},
    )
    assert rejected.status_code == 422

    accepted = client.post(
        "/runtime/local-model",
        json={"base_url": "http://127.0.0.1:8011/v1", "model_name": "organizer-chat"},
    )
    assert accepted.status_code == 200
    assert client.post("/runtime/local-model/disable").status_code == 200
