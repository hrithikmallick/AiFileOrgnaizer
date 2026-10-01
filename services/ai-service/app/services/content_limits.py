"""Bounds on how much extracted content is fed into classification."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LimitedText:
    """A possibly-truncated text plus truncation metadata."""

    text: str
    truncated: bool
    original_length: int


def limit_text(text: str, max_chars: int) -> LimitedText:
    """Cap ``text`` to ``max_chars`` characters, recording truncation."""
    original = text or ""
    if max_chars <= 0 or len(original) <= max_chars:
        return LimitedText(text=original, truncated=False, original_length=len(original))
    return LimitedText(text=original[:max_chars], truncated=True, original_length=len(original))


def limit_page_texts(
    pages: list[str],
    max_pages: int,
    max_chars: int,
) -> LimitedText:
    """Join at most ``max_pages`` pages and cap the total character count."""
    selected = pages[: max(1, max_pages)]
    joined = "\n".join(selected)
    limited = limit_text(joined, max_chars)
    truncated = limited.truncated or len(pages) > len(selected)
    return LimitedText(
        text=limited.text,
        truncated=truncated,
        original_length=limited.original_length,
    )
