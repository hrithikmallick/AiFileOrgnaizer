"""Local LLM classifier plus a deterministic heuristic fallback.

The LLM backend is any OpenAI-compatible chat completions server reachable on
localhost. It is configured exclusively through ``LAFO_LLM_BASE_URL``,
``LAFO_LLM_MODEL`` and ``LAFO_LLM_API_KEY``. When the backend is missing or
misbehaves the heuristic classifier keeps the service functional.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.classifiers.categories import CategoryTree, get_category_tree
from app.classifiers.prompts import build_system_prompt, build_user_prompt
from app.config import Settings, get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

_CODE_FENCE_RE = re.compile(r"```(?:json)?(.*?)```", re.DOTALL | re.IGNORECASE)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class ClassificationResult:
    """Normalized classification output shared by all backends."""

    category: str
    subcategory: str
    tags: list[str] = field(default_factory=list)
    summary: str = ""
    confidence: float = 0.0
    source: str = "fallback"
    model_name: str = "heuristic-fallback"


@dataclass(frozen=True)
class _KeywordRule:
    pattern: re.Pattern[str]
    category: str
    subcategory: str
    confidence: float
    tags: tuple[str, ...]


def _compile_keyword_rules() -> list[_KeywordRule]:
    raw: list[tuple[str, str, str, float, tuple[str, ...]]] = [
        (r"invoice|billing|amount due", "Finance", "Invoices", 0.55, ("invoice", "finance")),
        (r"statement|account balance|bank", "Finance", "Statements", 0.5, ("statement", "finance")),
        (r"receipt|purchase order", "Finance", "Receipts", 0.5, ("receipt", "finance")),
        (r"tax|1099|w-2|deduction", "Finance", "Taxes", 0.5, ("tax", "finance")),
        (r"budget|expense", "Finance", "Budgets", 0.45, ("budget", "finance")),
        (r"screenshot|screen shot|snip", "Images", "Screenshots", 0.5, ("screenshot", "image")),
        (r"photo|image|picture|jpeg|png", "Images", "Photos", 0.4, ("image",)),
        (r"resume|curriculum vitae|\bcv\b|passport|identity", "Personal", "Identity", 0.5, ("identity",)),
        (r"medical|prescription|health", "Personal", "Health", 0.45, ("health",)),
        (r"flight|itinerary|booking|travel", "Personal", "Travel", 0.45, ("travel",)),
        (r"docker|kubernetes|readme|api docs|documentation", "Development", "Documentation", 0.5, ("docs", "development")),
        (r"def |class |import |function |public static|fn main|console\.log", "Development", "Code", 0.45, ("code",)),
        (r"config|yaml|toml|settings", "Development", "Configs", 0.4, ("config",)),
        (r"contract|agreement|nda", "Work", "Contracts", 0.5, ("contract", "work")),
        (r"meeting|minutes|agenda", "Work", "Meetings", 0.45, ("meeting", "work")),
        (r"report|analysis|findings", "Documents", "Reports", 0.4, ("report",)),
        (r"note|todo|journal", "Documents", "Notes", 0.4, ("notes",)),
        (r"ebook|novel|manuscript", "Books", "Ebooks", 0.45, ("book",)),
        (r"installer|setup|install", "Software", "Installers", 0.45, ("installer",)),
    ]
    return [
        _KeywordRule(re.compile(pattern, re.IGNORECASE), cat, sub, conf, tags)
        for pattern, cat, sub, conf, tags in raw
    ]


def summarize_content(content: str, limit: int = 240) -> str:
    """Return a compact single-line summary of ``content``."""
    collapsed = re.sub(r"\s+", " ", (content or "").strip())
    if not collapsed:
        return "No textual content was available for analysis."
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "\u2026"


class HeuristicClassifier:
    """Keyword-based fallback used when no local LLM is reachable."""

    model_name = "heuristic-fallback"

    def __init__(self, tree: CategoryTree | None = None) -> None:
        self._tree = tree or get_category_tree()
        self._rules = _compile_keyword_rules()

    def classify(
        self,
        filename: str,
        mime_type: str | None,
        extension: str | None,
        content: str,
        tags: list[str],
    ) -> ClassificationResult:
        """Classify using keyword overlaps between filename and content."""
        haystack = f"{filename} {content}".lower()
        for rule in self._rules:
            if rule.pattern.search(haystack):
                category, subcategory = self._tree.normalize(rule.category, rule.subcategory)
                merged = _dedupe([*tags, *rule.tags, subcategory.lower()])
                return ClassificationResult(
                    category=category,
                    subcategory=subcategory,
                    tags=merged,
                    summary=summarize_content(content),
                    confidence=rule.confidence,
                    source="fallback",
                    model_name=self.model_name,
                )

        category, subcategory = self._tree.normalize(None, None)
        return ClassificationResult(
            category=category,
            subcategory=subcategory,
            tags=_dedupe(tags),
            summary=summarize_content(content),
            confidence=0.0,
            source="fallback",
            model_name=self.model_name,
        )


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = value.strip()
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def parse_model_json(raw: str) -> dict | None:
    """Best-effort extraction of a JSON object from a model response."""
    if not raw:
        return None
    candidate = raw.strip()
    fenced = _CODE_FENCE_RE.search(candidate)
    if fenced:
        candidate = fenced.group(1).strip()
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        match = _JSON_OBJECT_RE.search(candidate)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None


class LocalLLMClassifier:
    """Classify via an OpenAI-compatible chat completions endpoint."""

    def __init__(
        self,
        settings: Settings | None = None,
        tree: CategoryTree | None = None,
        heuristic: HeuristicClassifier | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._tree = tree or get_category_tree()
        self._heuristic = heuristic or HeuristicClassifier(self._tree)

    def classify(
        self,
        filename: str,
        mime_type: str | None,
        extension: str | None,
        content: str,
        tags: list[str],
    ) -> ClassificationResult:
        """Classify using the local LLM, falling back to heuristics on any error."""
        if not self._settings.llm_configured:
            logger.debug("LLM not configured; using heuristic classifier")
            return self._heuristic.classify(filename, mime_type, extension, content, tags)

        attempts = max(0, self._settings.llm_max_retries) + 1
        for attempt in range(1, attempts + 1):
            raw = self._request_completion(filename, mime_type, extension, content, tags)
            parsed = parse_model_json(raw) if raw else None
            result = self._to_result(parsed, content, tags)
            if result is not None:
                return result
            logger.warning("LLM response rejected (attempt %s/%s)", attempt, attempts)

        logger.warning("LLM classification failed; using heuristic classifier")
        return self._heuristic.classify(filename, mime_type, extension, content, tags)

    def _request_completion(
        self,
        filename: str,
        mime_type: str | None,
        extension: str | None,
        content: str,
        tags: list[str],
    ) -> str | None:
        try:
            import httpx
        except ImportError:  # pragma: no cover - httpx is a declared dependency
            logger.warning("httpx is not installed; cannot call the LLM backend")
            return None

        base_url = (self._settings.llm_base_url or "").rstrip("/")
        url = f"{base_url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self._settings.llm_api_key:
            headers["Authorization"] = f"Bearer {self._settings.llm_api_key}"
        payload = {
            "model": self._settings.llm_model,
            "messages": [
                {"role": "system", "content": build_system_prompt(self._tree)},
                {
                    "role": "user",
                    "content": build_user_prompt(filename, mime_type, extension, content, tags),
                },
            ],
            "temperature": self._settings.llm_temperature,
            "max_tokens": self._settings.llm_max_tokens,
            "stream": False,
        }
        try:
            with httpx.Client(timeout=self._settings.llm_timeout_seconds) as client:
                response = client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                body = response.json()
            return body["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
            logger.warning("LLM request failed: %s", exc)
            return None

    def _to_result(
        self,
        parsed: dict | None,
        content: str,
        tags: list[str],
    ) -> ClassificationResult | None:
        if not parsed:
            return None
        category = parsed.get("category")
        subcategory = parsed.get("subcategory")
        if not isinstance(category, str) or not category.strip():
            return None

        raw_tags = parsed.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [part for part in re.split(r"[,\n]", raw_tags) if part.strip()]
        if not isinstance(raw_tags, list):
            raw_tags = []

        summary = parsed.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            summary = summarize_content(content)

        try:
            confidence = float(parsed.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = min(max(confidence, 0.0), 1.0)

        resolved_category, resolved_sub = self._tree.normalize(
            category.strip(), subcategory if isinstance(subcategory, str) else None
        )
        return ClassificationResult(
            category=resolved_category,
            subcategory=resolved_sub,
            tags=_dedupe([*tags, *[str(tag) for tag in raw_tags]]),
            summary=summary.strip(),
            confidence=confidence,
            source="ai",
            model_name=self._settings.llm_model,
        )
