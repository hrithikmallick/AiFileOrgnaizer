"""Local embedding backends.

Prefers ``sentence-transformers`` (CPU only, model from ``LAFO_EMBEDDING_MODEL``);
otherwise falls back to a deterministic pure-Python hashing embedder so the
service always produces vectors without downloading anything.
"""

from __future__ import annotations

import hashlib
import math
import re
from functools import lru_cache

from app.config import Settings, get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

HASH_DIMENSION = 256
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase alphanumeric tokenization, stable across runs."""
    return _TOKEN_RE.findall((text or "").lower())


class HashingEmbedder:
    """Deterministic feature-hashing embedder (no external dependencies)."""

    backend = "hash"

    def __init__(self, dimension: int = HASH_DIMENSION, model_name: str | None = None) -> None:
        self._dimension = dimension
        self.model_name = model_name or f"hashing-{dimension}"

    @property
    def dimension(self) -> int:
        return self._dimension

    def embed(self, text: str) -> list[float]:
        """Return an L2-normalized hashed vector for ``text``."""
        vector = [0.0] * self._dimension
        for token in tokenize(text):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:8], "big") % self._dimension
            sign = 1.0 if digest[8] & 1 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(value * value for value in vector))
        if norm > 0.0:
            return [value / norm for value in vector]
        return vector

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts."""
        return [self.embed(text) for text in texts]


class _SentenceTransformerBackend:
    """Thin adapter over a CPU-only SentenceTransformer model."""

    backend = "sentence-transformers"

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self._model = SentenceTransformer(model_name, device="cpu")
        dimension = self._model.get_sentence_embedding_dimension()
        self._dimension = int(dimension) if dimension else 0

    @property
    def dimension(self) -> int:
        return self._dimension

    def embed(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return [[float(value) for value in row] for row in vectors]


class LocalEmbedder:
    """Facade that selects and delegates to the best available backend."""

    def __init__(
        self,
        settings: Settings | None = None,
        model_name: str | None = None,
        backend: str | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        requested_model = model_name or self._settings.embedding_model
        requested_backend = (backend or self._settings.embedding_backend or "auto").lower()
        self._impl = self._build_backend(requested_model, requested_backend)

    @staticmethod
    def _build_backend(model_name: str, backend: str):
        wants_hash = backend in {"hash", "hashing", "fallback"}
        if not wants_hash:
            try:
                impl = _SentenceTransformerBackend(model_name)
                logger.info("Embeddings backend: sentence-transformers (%s)", model_name)
                return impl
            except ImportError:
                logger.info(
                    "sentence-transformers not installed; using deterministic hashing embedder"
                )
            except Exception as exc:  # noqa: BLE001 - model load failures degrade gracefully
                logger.warning(
                    "Failed to load sentence-transformers model %s (%s); using hashing embedder",
                    model_name,
                    exc,
                )
        return HashingEmbedder(model_name="hashing-256")

    @property
    def backend(self) -> str:
        """Active backend identifier."""
        return self._impl.backend

    @property
    def dimension(self) -> int:
        """Embedding dimension of the active backend."""
        return self._impl.dimension

    @property
    def model_name(self) -> str:
        """Active model name."""
        return self._impl.model_name

    def embed(self, text: str) -> list[float]:
        """Embed a single string."""
        return self._impl.embed(text)

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of strings."""
        return self._impl.embed_many(texts)


@lru_cache(maxsize=1)
def get_embedder() -> LocalEmbedder:
    """Return the process-wide embedder singleton."""
    return LocalEmbedder()


def reset_embedder_cache() -> None:
    """Clear the cached embedder (used by tests)."""
    get_embedder.cache_clear()
