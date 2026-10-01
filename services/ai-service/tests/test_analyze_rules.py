"""Rule-driven classification tests for ``POST /analyze``."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

ANALYZE_KEYS = {
    "category",
    "subcategory",
    "suggested_filename",
    "tags",
    "summary",
    "confidence",
    "source",
    "model_name",
}

CASES = [
    ("Screenshot 2024-01-01.png", "image/png", "png", "Images", "Screenshots"),
    ("setup.exe", "application/x-msdownload", "exe", "Software", "Installers"),
    ("Invoice_2024_001.pdf", "application/pdf", "pdf", "Finance", "Invoices"),
    ("bank_statement_2024.pdf", "application/pdf", "pdf", "Finance", "Statements"),
    ("receipt_amazon.pdf", "application/pdf", "pdf", "Finance", "Receipts"),
    ("taxes_2023.pdf", "application/pdf", "pdf", "Finance", "Taxes"),
    ("John_Doe_Resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", "Personal", "Identity"),
    ("docker-compose.yml", "text/yaml", "yml", "Development", "Documentation"),
    ("main.py", "text/x-python", "py", "Development", "Code"),
    ("billing.py", "text/x-python", "py", "Development", "Code"),
    ("notes.md", "text/markdown", "md", "Documents", "Notes"),
    ("holiday.jpg", "image/jpeg", "jpg", "Images", "Photos"),
    ("report.pdf", "application/pdf", "pdf", "Documents", "Reports"),
    ("backup.zip", "application/zip", "zip", "Archives", "Zip"),
]


@pytest.mark.parametrize(
    ("filename", "mime_type", "extension", "category", "subcategory"),
    CASES,
)
def test_rule_classification(
    client: TestClient,
    filename: str,
    mime_type: str,
    extension: str,
    category: str,
    subcategory: str,
) -> None:
    response = client.post(
        "/analyze",
        json={
            "filename": filename,
            "mime_type": mime_type,
            "extension": extension,
            "content": "irrelevant content",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == ANALYZE_KEYS
    assert body["category"] == category
    assert body["subcategory"] == subcategory
    assert body["source"] == "rule"
    assert body["confidence"] >= 0.9
    assert body["suggested_filename"]


def test_unknown_content_falls_back(client: TestClient) -> None:
    response = client.post(
        "/analyze",
        json={
            "filename": "qwerty",
            "mime_type": "application/octet-stream",
            "content": "zzzz qqqq",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == ANALYZE_KEYS
    assert body["source"] == "fallback"
    assert body["category"] == "Other"
    assert body["subcategory"] == "Unknown"
    assert body["confidence"] == 0.0
    assert body["model_name"] == "heuristic-fallback"


def test_heuristic_fallback_classifies_keywords(client: TestClient) -> None:
    response = client.post(
        "/analyze",
        json={
            "filename": "scan",
            "mime_type": "text/plain",
            "content": "This invoice shows the amount due for services.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "fallback"
    assert body["category"] == "Finance"
    assert body["subcategory"] == "Invoices"
    assert 0.0 < body["confidence"] < 0.9


def test_validation_error_is_json(client: TestClient) -> None:
    response = client.post("/analyze", json={"mime_type": "text/plain"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "validation_error"
    assert body["status_code"] == 422


def test_base64_content_is_extracted(client: TestClient) -> None:
    import base64

    payload = base64.b64encode(b"hello from a text file").decode()
    response = client.post(
        "/analyze",
        json={
            "filename": "readme.txt",
            "mime_type": "text/plain",
            "extension": "txt",
            "content": payload,
            "content_encoding": "base64",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]
