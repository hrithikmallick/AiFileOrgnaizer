"""Application configuration.

Every value has a local default. Configuration is read from environment
variables prefixed with ``LAFO_`` (and an optional local ``.env`` file).
No cloud credentials are ever required; the optional LLM/embedding backends
run against locally hosted OpenAI-compatible servers.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import sys
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_CATEGORY_TREE_RELATIVE = Path("shared") / "categories" / "category_tree.json"


def find_repo_root(start: Path | None = None) -> Path:
    """Locate the repository root by walking upwards from ``start``.

    The root is the first ancestor that contains ``shared/categories/category_tree.json``.
    Falls back to the first ancestor containing ``.git`` and finally to the
    current working directory.
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    origin = (start or Path(__file__)).resolve()
    candidates = [origin.parent, *origin.parents]
    for candidate in candidates:
        if (candidate / _CATEGORY_TREE_RELATIVE).is_file():
            return candidate
    for candidate in candidates:
        if (candidate / ".git").exists():
            return candidate
    return Path.cwd()


def default_category_tree_path() -> Path:
    """Default absolute path to the shared category tree JSON."""
    return find_repo_root() / _CATEGORY_TREE_RELATIVE


class Settings(BaseSettings):
    """Runtime settings for the AI service."""

    model_config = SettingsConfigDict(
        env_prefix="LAFO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "lafo-ai-service"
    environment: str = "local"
    log_level: str = "INFO"

    host: str = "127.0.0.1"
    port: int = 8010

    category_tree: Path = Field(default_factory=default_category_tree_path)

    llm_base_url: str | None = None
    llm_model: str = "local-model"
    llm_api_key: str | None = None
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 1
    llm_max_tokens: int = 512
    llm_temperature: float = 0.0

    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_backend: str = "auto"

    max_text_chars: int = 20000
    max_pdf_pages: int = 5
    rule_confidence_threshold: float = 0.9

    ocr_language: str = "eng"
    tesseract_cmd: str | None = None

    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
    )

    @property
    def llm_configured(self) -> bool:
        """Whether an OpenAI-compatible chat endpoint has been configured."""
        return bool(self.llm_base_url and self.llm_base_url.strip())

    def validate_local_endpoints(self) -> None:
        """Refuse configurations that could send private content off-device."""
        if self.host not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("LAFO_HOST must be a loopback address")
        if not self.llm_base_url:
            return
        parsed = urlparse(self.llm_base_url)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
            "127.0.0.1",
            "localhost",
            "::1",
        }:
            raise ValueError("LAFO_LLM_BASE_URL must use a loopback host")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()


def reset_settings_cache() -> None:
    """Clear the cached settings (used by tests and reload scenarios)."""
    get_settings.cache_clear()
