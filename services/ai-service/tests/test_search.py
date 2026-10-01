"""Embedding and semantic search tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.embeddings.embedder import HashingEmbedder, LocalEmbedder
from app.embeddings.store import InMemoryVectorStore


def test_hashing_embedder_is_deterministic_and_normalized() -> None:
    embedder = HashingEmbedder(dimension=64)
    first = embedder.embed("hello world")
    second = embedder.embed("hello world")
    assert first == second
    assert len(first) == 64
    norm = sum(value * value for value in first) ** 0.5
    assert abs(norm - 1.0) < 1e-9


def test_local_embedder_reports_backend() -> None:
    embedder = LocalEmbedder(backend="hash")
    assert embedder.backend == "hash"
    assert embedder.dimension == 256


def test_vector_store_orders_by_similarity() -> None:
    store = InMemoryVectorStore()
    store.upsert("a", [1.0, 0.0], text="first")
    store.upsert("b", [0.0, 1.0], text="second")
    hits = store.search([1.0, 0.0], top_k=2)
    assert [hit["id"] for hit in hits] == ["a", "b"]
    assert hits[0]["score"] > hits[1]["score"]


def test_embed_endpoint(client: TestClient) -> None:
    response = client.post("/embed", json={"texts": ["alpha", "beta"]})
    assert response.status_code == 200
    body = response.json()
    assert len(body["embeddings"]) == 2
    assert body["dimension"] == len(body["embeddings"][0])
    assert body["backend"] in {"hash", "sentence-transformers"}


def test_search_endpoint_with_query(client: TestClient) -> None:
    embedder = LocalEmbedder(backend="hash")
    items = [
        {"id": "doc-1", "vector": embedder.embed("invoice payment amount"), "text": "invoice"},
        {"id": "doc-2", "vector": embedder.embed("vacation photos"), "text": "photos"},
    ]
    response = client.post(
        "/search",
        json={"query": "invoice payment", "items": items, "top_k": 2},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["hits"][0]["id"] == "doc-1"
    assert body["dimension"] > 0


def test_search_requires_query(client: TestClient) -> None:
    response = client.post("/search", json={"top_k": 3})
    assert response.status_code == 422
