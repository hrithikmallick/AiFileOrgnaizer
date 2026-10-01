"""Controlled category tree.

The application owns the taxonomy; the AI may only pick from it. The tree is
loaded from the shared JSON file when readable, otherwise an embedded copy is
used so the service never fails to start.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

EMBEDDED_CATEGORY_TREE: dict[str, Any] = {
    "version": 1,
    "categories": [
        {"name": "Documents", "subcategories": ["Research", "Notes", "Reports", "Legal", "Presentations"]},
        {"name": "Development", "subcategories": ["Code", "Documentation", "Screenshots", "Configs", "Databases"]},
        {"name": "Finance", "subcategories": ["Statements", "Invoices", "Receipts", "Taxes", "Budgets"]},
        {"name": "Images", "subcategories": ["Screenshots", "Photos", "Graphics", "Scans"]},
        {"name": "Books", "subcategories": ["Ebooks", "Papers", "Manuals"]},
        {"name": "Work", "subcategories": ["Projects", "Meetings", "Contracts"]},
        {"name": "Personal", "subcategories": ["Identity", "Health", "Travel", "Education"]},
        {"name": "Software", "subcategories": ["Installers", "Portable", "Licenses"]},
        {"name": "Archives", "subcategories": ["Zip", "Compressed", "Backups"]},
        {"name": "Other", "subcategories": ["Misc", "Unknown"]},
    ],
    "fallback": {"category": "Other", "subcategory": "Unknown"},
}


@dataclass(frozen=True)
class CategoryTree:
    """Validated, immutable view over the category taxonomy."""

    version: int
    categories: dict[str, tuple[str, ...]]
    fallback_category: str
    fallback_subcategory: str
    source: str = "embedded"
    _defaults: dict[str, str] = field(default_factory=dict, repr=False)

    @property
    def names(self) -> tuple[str, ...]:
        """Category names in declaration order."""
        return tuple(self.categories.keys())

    def is_valid_category(self, category: str | None) -> bool:
        """Return whether ``category`` exists in the taxonomy."""
        return bool(category) and category in self.categories

    def is_valid_subcategory(self, category: str, subcategory: str | None) -> bool:
        """Return whether ``subcategory`` belongs to ``category``."""
        if not self.is_valid_category(category):
            return False
        return bool(subcategory) and subcategory in self.categories[category]

    def default_subcategory(self, category: str) -> str:
        """Pick a sensible subcategory for ``category`` when none is valid."""
        if not self.is_valid_category(category):
            return self.fallback_subcategory
        if category in self._defaults:
            return self._defaults[category]
        subcategories = self.categories[category]
        for preferred in ("Unknown", "Misc", "Reports", "Notes"):
            if preferred in subcategories:
                return preferred
        return subcategories[0] if subcategories else self.fallback_subcategory

    def normalize(self, category: str | None, subcategory: str | None) -> tuple[str, str]:
        """Map an arbitrary (category, subcategory) onto the taxonomy."""
        if not self.is_valid_category(category):
            return self.fallback_category, self.fallback_subcategory
        assert category is not None
        if self.is_valid_subcategory(category, subcategory):
            return category, subcategory or self.default_subcategory(category)
        return category, self.default_subcategory(category)

    def as_dict(self) -> dict[str, list[str]]:
        """Return a plain mapping of category to subcategory list."""
        return {name: list(subs) for name, subs in self.categories.items()}


def _pick_defaults(categories: dict[str, tuple[str, ...]]) -> dict[str, str]:
    defaults: dict[str, str] = {}
    for name, subs in categories.items():
        for preferred in ("Unknown", "Misc", "Reports", "Notes"):
            if preferred in subs:
                defaults[name] = preferred
                break
        else:
            if subs:
                defaults[name] = subs[0]
    return defaults


def _parse_tree(payload: dict[str, Any], source: str) -> CategoryTree:
    categories: dict[str, tuple[str, ...]] = {}
    for entry in payload.get("categories", []):
        name = entry.get("name")
        subs = entry.get("subcategories") or []
        if isinstance(name, str) and name:
            categories[name] = tuple(str(s) for s in subs)

    if not categories:
        categories = {
            entry["name"]: tuple(entry["subcategories"])
            for entry in EMBEDDED_CATEGORY_TREE["categories"]
        }

    fallback = payload.get("fallback") or {}
    fallback_category = fallback.get("category", "Other")
    fallback_subcategory = fallback.get("subcategory", "Unknown")
    if fallback_category not in categories:
        fallback_category = next(reversed(categories)) if categories else "Other"
    if fallback_subcategory not in categories.get(fallback_category, ()):
        fallback_subcategory = default_for(fallback_category, categories)

    return CategoryTree(
        version=int(payload.get("version", 1)),
        categories=categories,
        fallback_category=fallback_category,
        fallback_subcategory=fallback_subcategory,
        source=source,
        _defaults=_pick_defaults(categories),
    )


def default_for(category: str, categories: dict[str, tuple[str, ...]]) -> str:
    """Compute a default subcategory for a category within a raw mapping."""
    subs = categories.get(category, ())
    for preferred in ("Unknown", "Misc", "Reports", "Notes"):
        if preferred in subs:
            return preferred
    return subs[0] if subs else "Unknown"


def load_category_tree(path: Path | None = None) -> CategoryTree:
    """Load the category tree from ``path``, falling back to the embedded copy."""
    target = path or get_settings().category_tree
    try:
        raw = Path(target).read_text(encoding="utf-8")
        payload = json.loads(raw)
        tree = _parse_tree(payload, source=str(target))
        logger.debug("Loaded category tree from %s", target)
        return tree
    except (OSError, ValueError, TypeError) as exc:
        logger.warning("Falling back to embedded category tree: %s", exc)
        return _parse_tree(EMBEDDED_CATEGORY_TREE, source="embedded")


@lru_cache(maxsize=1)
def get_category_tree() -> CategoryTree:
    """Return the process-wide category tree singleton."""
    return load_category_tree()


def reset_category_tree_cache() -> None:
    """Clear the cached category tree (used by tests)."""
    get_category_tree.cache_clear()
