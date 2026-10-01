"""Extractor dispatch and resilience tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.extractors.code_extractor import CodeExtractor
from app.extractors.markdown_extractor import MarkdownExtractor
from app.extractors.pdf_extractor import PdfExtractor
from app.extractors.registry import ExtractorRegistry, get_extractor
from app.extractors.text_extractor import TextExtractor


def test_text_extractor_roundtrip() -> None:
    extractor = TextExtractor()
    assert extractor.supports("text/plain", "txt")
    result = extractor.extract("héllo".encode("utf-8"), mime_type="text/plain", extension="txt")
    assert result.text == "héllo"
    assert result.extraction_method == "text"


def test_code_extractor() -> None:
    extractor = CodeExtractor()
    assert extractor.supports(None, "py")
    result = extractor.extract(b"print('hi')", extension="py")
    assert result.extraction_method == "code"


def test_markdown_extractor_strips_front_matter() -> None:
    extractor = MarkdownExtractor()
    payload = b"---\ntitle: x\n---\n# Heading\nbody"
    result = extractor.extract(payload, extension="md")
    assert result.text.startswith("# Heading")
    assert "title" not in result.text


def test_pdf_without_backend_is_graceful() -> None:
    extractor = PdfExtractor()
    assert extractor.supports("application/pdf", "pdf")
    result = extractor.extract(b"%PDF-1.4 not really a pdf", mime_type="application/pdf", extension="pdf")
    assert result.text == ""
    assert result.extraction_method in {
        "pdf-unavailable",
        "pypdf",
        "pdfminer",
        "pypdf-error",
    }


def test_registry_dispatch() -> None:
    assert isinstance(get_extractor("application/pdf", "pdf"), PdfExtractor)
    assert isinstance(get_extractor("text/markdown", "md"), MarkdownExtractor)
    assert isinstance(get_extractor("text/x-python", "py"), CodeExtractor)
    assert isinstance(get_extractor("text/plain", "txt"), TextExtractor)


def test_registry_fallback_for_unknown_type() -> None:
    registry = ExtractorRegistry()
    extractor = registry.get_extractor("application/octet-stream", "bin")
    result = extractor.extract(b"\x00\x01\x02", mime_type="application/octet-stream", extension="bin")
    assert result.extraction_method == "unsupported"
    assert result.warnings


def test_extract_endpoint_text(client: TestClient) -> None:
    response = client.post(
        "/extract",
        json={"content": "hello world", "encoding": "utf-8", "filename": "a.txt"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "hello world"
    assert body["char_count"] == 11
    assert body["extraction_method"] == "text"


def test_extract_endpoint_bad_base64(client: TestClient) -> None:
    response = client.post(
        "/extract",
        json={"content": "not-base64!!!", "encoding": "base64"},
    )
    assert response.status_code == 422


def test_extract_endpoint_truncates(client: TestClient, monkeypatch) -> None:
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_text_chars", 5, raising=False)
    response = client.post(
        "/extract",
        json={"content": "0123456789", "encoding": "utf-8", "filename": "a.txt"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "01234"
    assert body["truncated"] is True
