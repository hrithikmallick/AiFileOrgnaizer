# Local AI File Organizer - AI Service

A fully local FastAPI service that classifies files, extracts text, produces
embeddings, runs semantic search over an in-memory store, and optionally runs
OCR. No cloud services are used. The optional LLM and embedding backends are
OpenAI-compatible servers that you host locally.

## Features

- `POST /analyze` - deterministic rule classification first, local LLM second.
- `POST /extract` - text extraction for PDF/DOCX/Markdown/code/text/images.
- `POST /embed` - local embeddings with a deterministic hashing fallback.
- `POST /search` - cosine similarity over supplied vectors or the in-memory store.
- `POST /ocr` - Tesseract OCR when installed, graceful `available:false` otherwise.
- `GET /rules`, `POST /rules/evaluate` - inspect and test the rule engine.
- `GET /health`, `GET /ready` - liveness and readiness.

## Requirements

- Python 3.10+
- Runtime includes PDF, DOCX, and image extraction. `sentence-transformers`
  and `numpy` remain optional because a local hashing embedder is built in.

## Install

```bash
# Runtime, including PDF/DOCX/OCR Python packages
pip3 install --break-system-packages -r requirements.txt

# Development + tests
pip3 install --break-system-packages -r requirements.txt -r requirements-dev.txt

# Optional higher-quality embedding backend
pip3 install --break-system-packages ".[embeddings,numpy]"
```

## Run

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Then:

```bash
curl -s http://127.0.0.1:8010/health
curl -s http://127.0.0.1:8010/analyze \
  -H 'Content-Type: application/json' \
  -d '{"filename":"Invoice_2024_001.pdf","mime_type":"application/pdf","extension":"pdf","content":"invoice total 42"}'
```

## Configuration

All settings use the `LAFO_` environment prefix and have local defaults. An
optional `.env` file in the working directory is also read.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAFO_CATEGORY_TREE` | shared `category_tree.json` | Taxonomy JSON path |
| `LAFO_HOST` / `LAFO_PORT` | `127.0.0.1` / `8010` | Bind address |
| `LAFO_LOG_LEVEL` | `INFO` | Logging level |
| `LAFO_LLM_BASE_URL` | unset | OpenAI-compatible base URL, e.g. `http://127.0.0.1:11434/v1` |
| `LAFO_LLM_MODEL` | `local-model` | Model name |
| `LAFO_LLM_API_KEY` | unset | Optional key for the local server |
| `LAFO_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | sentence-transformers model |
| `LAFO_EMBEDDING_BACKEND` | `auto` | `auto`, `hash`, or `sentence-transformers` |
| `LAFO_MAX_TEXT_CHARS` | `20000` | Classification text cap |
| `LAFO_MAX_PDF_PAGES` | `5` | PDF pages read |
| `LAFO_RULE_CONFIDENCE_THRESHOLD` | `0.9` | Rule confidence needed to skip the LLM |

The service never reads any LLM key other than `LAFO_LLM_API_KEY` and never
hardcodes secrets.

Tesseract itself must be installed locally and available on `PATH` for OCR;
the service safely reports it as unavailable when it is absent.

## Graceful degradation

| Component | Missing dependency | Behaviour |
| --- | --- | --- |
| PDF | `pypdf` / `pdfminer.six` | Empty text, method `pdf-unavailable`, warning |
| DOCX | `python-docx` | Empty text, method `docx-unavailable`, warning |
| OCR | `pytesseract` / `pillow` / tesseract binary | `available:false` with a reason |
| Embeddings | `sentence-transformers` | Deterministic 256-dim hashing embedder |
| LLM | no `LAFO_LLM_BASE_URL` or request failure | Keyword heuristic classifier, `source:"fallback"` |

## Tests

```bash
cd services/ai-service
python -m pytest -q
```

Tests run offline and never load heavy models.

## Category tree

The taxonomy is owned by the application and loaded from
`local-ai-organizer/shared/categories/category_tree.json` (resolved relative to
the repository root, overridable with `LAFO_CATEGORY_TREE`). Any classification
that does not map onto the tree falls back to `Other/Unknown`.
