# Local AI File Organizer

Privacy-first desktop assistant that organizes, classifies, renames, searches and
detects duplicate files **entirely on your machine**. Files are never uploaded.

```
Scan -> extract -> classify (rules first, AI if needed)
     -> suggest filename / category
     -> you review
     -> Rust applies only approved moves/renames
     -> every change is undoable
```

AI **only suggests**. It never moves, renames, deletes, overwrites or executes files.

## Architecture

```
Tauri + React (this folder's UI)
      |
Rust core  -- scanner, metadata, SHA-256, MIME/magic, SQLite,
           -- safe move/rename, undo, folder watcher
      |
Python FastAPI AI service (localhost only)
           -- extractors, rule engine, local LLM, embeddings, OCR
```

The Rust core is the only component allowed to mutate the filesystem. The AI
service is refused unless its URL is loopback (`127.0.0.1` / `localhost`).

## Layout

```
local-ai-organizer/
  apps/desktop/            React + TypeScript UI + Tauri/Rust core
  services/ai-service/     FastAPI classification / extraction / search
  shared/categories/       Application-owned category tree (AI cannot invent paths)
  data/schema.sql          SQLite schema
  docs/                    Architecture and safety notes
```

## Quick start (browser demo)

The UI runs as a full desktop app under Tauri. For development without a Rust
toolchain it also runs in the browser against a local in-memory demo index
that follows the same contracts (suggestions only, undo, duplicates, search).

```bash
# AI service (optional for the demo UI)
cd services/ai-service
pip3 install --break-system-packages -r requirements.txt
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# UI
cd apps/desktop
npm install
npm run dev
```

Native desktop build (requires Rust + Tauri):

```bash
cd apps/desktop
npm install
npm run tauri dev
```

## Safety boundary

| AI can | AI cannot |
| --- | --- |
| Classify, summarize, tag | Move or rename files |
| Suggest a filename | Delete or overwrite |
| Suggest a category/subcategory from the owned tree | Execute commands |
| | Invent arbitrary filesystem paths |

Every classification is validated against `shared/categories/category_tree.json`.
Every filesystem mutation is recorded in SQLite and can be undone without
overwriting existing files.

## Default ignore list

`.git`, `node_modules`, `.venv`, `venv`, `__pycache__`, `target`, `dist`, `build`

## License

Private / local use. No telemetry, no accounts, no cloud.
