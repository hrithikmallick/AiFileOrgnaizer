"""Embedding endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.embeddings.embedder import LocalEmbedder, get_embedder
from app.schemas.embed import EmbedRequest, EmbedResponse

router = APIRouter(tags=["embed"])


@router.post("/embed", response_model=EmbedResponse)
def embed(
    request: EmbedRequest,
    embedder: LocalEmbedder = Depends(get_embedder),
) -> EmbedResponse:
    """Embed texts with the active local backend."""
    vectors = embedder.embed_many(request.texts)
    dimension = len(vectors[0]) if vectors else embedder.dimension
    return EmbedResponse(
        embeddings=vectors,
        dimension=dimension,
        backend=embedder.backend,
        model_name=request.model_name or embedder.model_name,
    )
