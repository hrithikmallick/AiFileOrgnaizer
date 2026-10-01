"""Filename and tag sanitization tests."""

from __future__ import annotations

from app.services.validation import (
    build_suggested_filename,
    sanitize_filename,
    sanitize_tags,
)


def test_removes_invalid_characters() -> None:
    result = sanitize_filename('a<b>c:d"e|h?i*j.txt')
    assert result.sanitized == "a_b_c_d_e_h_i_j.txt"
    assert result.changes


def test_removes_directory_components() -> None:
    result = sanitize_filename("../../etc/passwd")
    assert "/" not in result.sanitized
    assert "removed directory components" in result.changes


def test_collapses_whitespace_and_trims() -> None:
    result = sanitize_filename("   my   file   .txt   ")
    assert result.sanitized == "my file.txt"


def test_blocks_windows_reserved_names() -> None:
    result = sanitize_filename("CON.txt")
    assert result.sanitized == "_CON.txt"
    assert "prefixed Windows reserved name" in result.changes

    for reserved in ("PRN", "AUX", "NUL", "COM1", "LPT9"):
        assert sanitize_filename(f"{reserved}.log").sanitized.startswith("_")


def test_preserves_extension_and_enforces_max_length() -> None:
    long_name = "x" * 400 + ".pdf"
    result = sanitize_filename(long_name)
    assert result.sanitized.endswith(".pdf")
    assert len(result.sanitized) <= 150
    assert "truncated to 150 characters" in result.changes


def test_empty_name_uses_fallback() -> None:
    result = sanitize_filename("...")
    assert result.sanitized == "untitled"
    assert "applied fallback stem" in result.changes


def test_control_characters_removed() -> None:
    result = sanitize_filename("bad\x00name.txt")
    assert "\x00" not in result.sanitized


def test_sanitize_tags_dedupes_and_bounds() -> None:
    tags = sanitize_tags([" Finance ", "finance", "", "Invoices", "a" * 100])
    assert tags[0] == "finance"
    assert tags.count("finance") == 1
    assert all(len(tag) <= 40 for tag in tags)


def test_build_suggested_filename_replaces_generic_stem() -> None:
    suggested = build_suggested_filename("download.pdf", "Finance", "Invoices")
    assert suggested == "finance-invoices.pdf"


def test_build_suggested_filename_keeps_specific_stem() -> None:
    suggested = build_suggested_filename("Invoice_2024_001.pdf", "Finance", "Invoices")
    assert suggested == "Invoice_2024_001.pdf"
