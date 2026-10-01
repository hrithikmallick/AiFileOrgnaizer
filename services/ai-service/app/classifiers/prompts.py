"""Prompt construction for the local OpenAI-compatible classifier."""

from __future__ import annotations

from app.classifiers.categories import CategoryTree

_JSON_CONTRACT = (
    "Reply with a single JSON object and nothing else. Required keys: "
    '"category" (string), "subcategory" (string), "tags" (array of short strings), '
    '"summary" (one or two sentences), "confidence" (number between 0 and 1).'
)

_RULES = (
    "You classify files for a local file organizer. Choose exactly one category and "
    "one of its subcategories from the allowed tree. Never invent categories, "
    "subcategories, or filesystem paths. If the content is insufficient, use the "
    "fallback category."
)


def build_category_block(tree: CategoryTree) -> str:
    """Render the allowed taxonomy as an indented text block."""
    lines: list[str] = []
    for name, subcategories in tree.as_dict().items():
        lines.append(f"- {name}: {', '.join(subcategories)}")
    return "\n".join(lines)


def build_system_prompt(tree: CategoryTree) -> str:
    """Build the classifier system prompt for a given tree."""
    return (
        f"{_RULES}\n\nAllowed categories (category: subcategories):\n"
        f"{build_category_block(tree)}\n\n"
        f"Fallback: {tree.fallback_category}/{tree.fallback_subcategory}.\n\n"
        f"{_JSON_CONTRACT}"
    )


def build_user_prompt(
    filename: str,
    mime_type: str | None,
    extension: str | None,
    content: str,
    tags: list[str],
) -> str:
    """Build the per-file user prompt."""
    parts = [
        f"Filename: {filename}",
        f"MIME type: {mime_type or 'unknown'}",
        f"Extension: {extension or 'unknown'}",
        f"Existing tags: {', '.join(tags) if tags else 'none'}",
        "Content (may be truncated):",
        content or "(empty)",
    ]
    return "\n".join(parts)
