"""Base extractor contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

UNAVAILABLE = "unavailable"


@dataclass
class ExtractionResult:
    """Outcome of extracting text from a file."""

    text: str = ""
    extraction_method: str = UNAVAILABLE
    mime_type: str | None = None
    page_count: int | None = None
    truncated: bool = False
    warnings: list[str] = field(default_factory=list)


def unavailable_result(
    mime_type: str | None,
    reason: str,
    extraction_method: str = UNAVAILABLE,
) -> ExtractionResult:
    """Build an ``unavailable`` result carrying an explanatory warning."""
    return ExtractionResult(
        text="",
        extraction_method=extraction_method,
        mime_type=mime_type,
        warnings=[reason],
    )


class BaseExtractor(ABC):
    """Abstract text extractor."""

    name: str = "base"
    methods: tuple[str, ...] = ()

    @abstractmethod
    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        """Return whether this extractor handles the given type."""

    @abstractmethod
    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        """Extract text from raw bytes, never raising for optional deps."""
