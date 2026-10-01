"""Category tree loading and normalization tests."""

from __future__ import annotations

from pathlib import Path

from app.classifiers.categories import (
    EMBEDDED_CATEGORY_TREE,
    load_category_tree,
)
from app.config import default_category_tree_path


def test_default_tree_path_points_at_shared_file() -> None:
    path = default_category_tree_path()
    assert path.name == "category_tree.json"
    assert path.parent.name == "categories"


def test_loads_shared_tree() -> None:
    tree = load_category_tree(default_category_tree_path())
    assert len(tree.names) == 10
    assert "Documents" in tree.names
    assert tree.is_valid_subcategory("Finance", "Invoices")
    assert tree.fallback_category == "Other"
    assert tree.fallback_subcategory == "Unknown"
    assert tree.source != "embedded"


def test_normalize_unknown_values() -> None:
    tree = load_category_tree(default_category_tree_path())
    assert tree.normalize("Nope", "Whatever") == ("Other", "Unknown")
    assert tree.normalize("Finance", "Nope") == ("Finance", "Statements")


def test_normalize_valid_values_preserved() -> None:
    tree = load_category_tree(default_category_tree_path())
    assert tree.normalize("Images", "Photos") == ("Images", "Photos")


def test_missing_file_falls_back_to_embedded() -> None:
    tree = load_category_tree(Path("/nonexistent/category_tree.json"))
    assert tree.source == "embedded"
    assert len(tree.names) == len(EMBEDDED_CATEGORY_TREE["categories"])
    assert tree.default_subcategory("Other") == "Unknown"
