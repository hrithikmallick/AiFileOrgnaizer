"""Classification orchestration: cheap deterministic rules first, LLM second."""

from __future__ import annotations

import hashlib
from collections import OrderedDict

from app.classifiers.categories import CategoryTree, get_category_tree
from app.classifiers.llm_classifier import (
    ClassificationResult,
    LocalLLMClassifier,
    summarize_content,
)
from app.classifiers.rules_engine import RuleEngine
from app.config import Settings, get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

_CACHE_MAX_ENTRIES = 2048

_RULE_MODEL = "rules-engine"


class ClassifierOrchestrator:
    """Coordinate the rule engine and the local LLM with an LRU cache."""

    def __init__(
        self,
        settings: Settings | None = None,
        tree: CategoryTree | None = None,
        rule_engine: RuleEngine | None = None,
        llm_classifier: LocalLLMClassifier | None = None,
        confidence_threshold: float | None = None,
        cache_size: int = _CACHE_MAX_ENTRIES,
    ) -> None:
        self._settings = settings or get_settings()
        self._tree = tree or get_category_tree()
        self._rules = rule_engine or RuleEngine(tree=self._tree)
        self._llm = llm_classifier or LocalLLMClassifier(self._settings, self._tree)
        self._threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else self._settings.rule_confidence_threshold
        )
        self._cache: OrderedDict[str, ClassificationResult] = OrderedDict()
        self._cache_size = max(0, cache_size)

    @property
    def confidence_threshold(self) -> float:
        """Rule confidence required to skip the LLM."""
        return self._threshold

    def classify(
        self,
        filename: str,
        mime_type: str | None = None,
        extension: str | None = None,
        content: str = "",
        tags: list[str] | None = None,
        data: bytes | None = None,
    ) -> ClassificationResult:
        """Classify a file, returning a taxonomy-valid result."""
        tags = tags or []
        cache_key = self._cache_key(filename, mime_type, content)
        cached = self._cache.get(cache_key)
        if cached is not None:
            self._cache.move_to_end(cache_key)
            return cached

        match = self._rules.evaluate(
            filename=filename,
            mime_type=mime_type,
            extension=extension,
            data=data,
        )
        if match is not None and match.confidence >= self._threshold:
            category, subcategory = self._tree.normalize(match.category, match.subcategory)
            result = ClassificationResult(
                category=category,
                subcategory=subcategory,
                tags=self._derive_tags(subcategory, tags),
                summary=summarize_content(content),
                confidence=match.confidence,
                source="rule",
                model_name=_RULE_MODEL,
            )
        else:
            result = self._llm.classify(filename, mime_type, extension, content, tags)

        self._store(cache_key, result)
        return result

    def clear_cache(self) -> None:
        """Drop all cached classifications."""
        self._cache.clear()

    def _store(self, key: str, result: ClassificationResult) -> None:
        if self._cache_size <= 0:
            return
        self._cache[key] = result
        self._cache.move_to_end(key)
        while len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)

    @staticmethod
    def _derive_tags(subcategory: str, tags: list[str]) -> list[str]:
        merged = [*tags]
        if subcategory:
            merged.append(subcategory.lower())
        seen: set[str] = set()
        result: list[str] = []
        for tag in merged:
            cleaned = tag.strip()
            key = cleaned.lower()
            if cleaned and key not in seen:
                seen.add(key)
                result.append(cleaned)
        return result

    @staticmethod
    def _cache_key(filename: str, mime_type: str | None, content: str) -> str:
        digest = hashlib.sha256()
        digest.update((filename or "").encode("utf-8", errors="replace"))
        digest.update(b"\x00")
        digest.update((mime_type or "").encode("utf-8", errors="replace"))
        digest.update(b"\x00")
        digest.update((content or "").encode("utf-8", errors="replace"))
        return digest.hexdigest()


__all__ = ["ClassificationResult", "ClassifierOrchestrator"]
