"""Source-code extractor (pure Python)."""

from __future__ import annotations

from app.extractors.base import BaseExtractor, ExtractionResult
from app.extractors.text_extractor import decode_text

CODE_EXTENSIONS = {
    "py", "pyi", "rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "go", "java",
    "kt", "kts", "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "cs", "rb", "php",
    "swift", "scala", "sh", "bash", "zsh", "fish", "ps1", "psm1", "sql", "pl",
    "pm", "lua", "r", "ex", "exs", "clj", "cljs", "hs", "elm", "dart", "vue",
    "svelte", "groovy", "gradle", "tf", "proto", "asm", "v", "zig", "nim",
}


class CodeExtractor(BaseExtractor):
    """Extract source code as text."""

    name = "code"

    def supports(self, mime_type: str | None, extension: str | None) -> bool:
        ext = (extension or "").lstrip(".").lower()
        mime = (mime_type or "").lower()
        if ext in CODE_EXTENSIONS:
            return True
        return mime.startswith("text/x-") or mime == "application/javascript"

    def extract(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
    ) -> ExtractionResult:
        text = decode_text(data)
        return ExtractionResult(
            text=text,
            extraction_method=self.name,
            mime_type=mime_type,
            page_count=1,
            warnings=[],
        )
