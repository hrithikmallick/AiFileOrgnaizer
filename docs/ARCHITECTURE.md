# Architecture

## Trust boundary

```
User
  |
  v
React UI  ---- suggestions, review, search ----
  |
  |  invoke()
  v
Rust core (owns the filesystem and SQLite)
  |  loopback HTTP only
  v
Python FastAPI (classify / extract / embed / OCR)
```

Python never receives a "please move this file" API. `/analyze`, `/extract`,
`/embed`, `/search`, `/ocr`, and `/rules` are read-style. The only runtime
configuration endpoint accepts a Rust-provided loopback model URL; it cannot
run processes or mutate the filesystem.

## Bundled llama.cpp model

The desktop package can contain `llama-server.exe`, its runtime DLLs, and a
release-selected GGUF file under `apps/desktop/src-tauri/resources/`. Rust is
the only component that starts or stops this process. It always binds to
`127.0.0.1:8011`, verifies the GGUF SHA-256 from `model-manifest.json`, waits
for `/health`, then tells FastAPI to use `http://127.0.0.1:8011/v1`.

Python cannot launch a model process, receive an arbitrary model path, or use
a non-loopback LLM URL. If the bundled assets are absent or fail validation,
classification safely stays on deterministic rules and the heuristic fallback.

## Processing pipeline

```
File
 -> recursive scan (skip ignores, skip inaccessible)
 -> metadata + MIME + magic bytes
 -> SHA-256 (bounded concurrency, size cap)
 -> content extraction (first pages / limited text)
 -> deterministic rule engine
 -> if confidence is low: local LLM, JSON-validated, retry once
 -> category mapped through the owned tree
 -> filename sanitized (Windows reserved names, length, illegal chars)
 -> embedding stored locally
 -> UI review
 -> on Approve: Rust plan -> record -> rename/move -> record result
 -> History / Undo
```

## Caching

Analysis is keyed by `sha256 + modified_at`. Identical files reuse the
previous suggestion (`source = cache`).

## Duplicate detection (V1)

Exact SHA-256 match. Groups are shown for review. Nothing is deleted.

## Semantic search (V1)

Extracted text -> local embedding model (or deterministic hash fallback)
-> cosine similarity over the local store. The LLM is not invoked for search.

## Folder watcher (V1)

After a write settles, the new file is scanned and queued as a suggestion.
`auto_apply` is hard-coded off.
