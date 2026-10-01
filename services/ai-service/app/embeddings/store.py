"""In-memory cosine-similarity vector store."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

try:  # optional acceleration
    import numpy as _np
except ImportError:  # pragma: no cover - numpy is an optional extra
    _np = None


@dataclass
class _Entry:
    vector: list[float]
    text: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    if _np is not None:
        va = _np.asarray(a, dtype="float32")
        vb = _np.asarray(b, dtype="float32")
        denom = float(_np.linalg.norm(va) * _np.linalg.norm(vb))
        return float(_np.dot(va, vb) / denom) if denom > 0.0 else 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    denom = norm_a * norm_b
    return dot / denom if denom > 0.0 else 0.0


class InMemoryVectorStore:
    """A small process-local vector index keyed by document id."""

    def __init__(self) -> None:
        self._entries: dict[str, _Entry] = {}
        self._dimension = 0

    @property
    def backend(self) -> str:
        """Vector math backend identifier."""
        return "numpy" if _np is not None else "python"

    @property
    def dimension(self) -> int:
        """Dimension of the stored vectors (0 when empty)."""
        return self._dimension

    def __len__(self) -> int:
        return len(self._entries)

    def upsert(
        self,
        item_id: str,
        vector: list[float],
        text: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Insert or replace a document vector."""
        self._entries[item_id] = _Entry(vector=list(vector), text=text, metadata=metadata or {})
        if not self._dimension:
            self._dimension = len(vector)

    def get(self, item_id: str) -> _Entry | None:
        """Return the stored entry or ``None``."""
        return self._entries.get(item_id)

    def search(self, query_vector: list[float], top_k: int = 5) -> list[dict[str, Any]]:
        """Return the ``top_k`` most similar entries, best score first."""
        scored = [
            {
                "id": item_id,
                "score": _cosine(query_vector, entry.vector),
                "text": entry.text,
                "metadata": dict(entry.metadata),
            }
            for item_id, entry in self._entries.items()
        ]
        scored.sort(key=lambda hit: (-hit["score"], hit["id"]))
        return scored[: max(0, top_k)]

    def clear(self) -> None:
        """Remove every stored entry."""
        self._entries.clear()
        self._dimension = 0


@lru_cache(maxsize=1)
def get_vector_store() -> InMemoryVectorStore:
    """Return the process-wide vector store singleton."""
    return InMemoryVectorStore()


def reset_vector_store() -> None:
    """Clear the cached vector store (used by tests)."""
    get_vector_store.cache_clear()
