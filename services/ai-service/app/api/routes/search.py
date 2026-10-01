"""Semantic search endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.embeddings.embedder import LocalEmbedder, get_embedder
from app.embeddings.store import InMemoryVectorStore, get_vector_store
from app.schemas.search import SearchHit, SearchRequest, SearchResponse

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
def search(
    request: SearchRequest,
    embedder: LocalEmbedder = Depends(get_embedder),
    store: InMemoryVectorStore = Depends(get_vector_store),
) -> SearchResponse:
    """Search supplied vectors or the process-local in-memory store."""
    if request.items:
        for item in request.items:
            store.upsert(item.id, item.vector, text=item.text, metadata=item.metadata)

    if request.query_vector:
        query_vector = request.query_vector
    else:
        query_vector = embedder.embed(request.query or "")

    raw_hits = store.search(query_vector, request.top_k)
    hits = [
        SearchHit(
            id=hit["id"],
            score=round(float(hit["score"]), 6),
            text=hit["text"],
            metadata=hit["metadata"],
        )
        for hit in raw_hits
    ]
    dimension = store.dimension or len(query_vector)
    return SearchResponse(hits=hits, backend=store.backend, dimension=dimension)
