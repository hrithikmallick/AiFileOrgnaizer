# Technical Guide

This guide explains how Local AI File Organizer works, in plain language. It
is useful for users who want to understand what runs on their PC and for
developers who need to maintain the project.

## 1. The main idea

The application separates **suggestions** from **file changes**:

1. It reads a selected folder and prepares organization suggestions.
2. You review those suggestions.
3. Only the Rust desktop core can apply an approved rename or move.
4. Every completed operation is stored locally and can be undone when the
   original path is still available.

The AI is deliberately not allowed to operate the filesystem.

## 2. Components

| Component | Technology | Responsibility | Can change files? |
| --- | --- | --- | --- |
| Desktop interface | React, TypeScript | Shows scans, review items, search, duplicates, history, and settings | No |
| Desktop host | Tauri and Rust | Starts local services, scans folders, hashes files, stores data, validates and applies approved operations | Yes, after approval only |
| Local database | SQLite | Stores indexed files, suggestions, embeddings, operations, and settings on the PC | Stores app data only |
| AI service | FastAPI, frozen as `ai-service.exe` | Extracts text, applies deterministic rules, requests local AI when needed, embeds text, and exposes localhost APIs | No |
| llama.cpp | `llama-server.exe` | Runs the language model efficiently on the local CPU and exposes an OpenAI-compatible API | No |
| Language model | Qwen2.5-1.5B-Instruct Q4_K_M GGUF | Produces structured organization suggestions from bounded text and metadata | No |
| Category tree | JSON in `shared/categories/` | Defines the only category and subcategory paths the app may use | No |

## 3. What llama.cpp and GGUF mean

`llama.cpp` is the local inference runtime. It is not the AI model itself. It
loads a model file, accepts a prompt, and returns a response. In this project,
Rust starts `llama-server.exe` with a loopback-only address:

```text
http://127.0.0.1:8011
```

A **GGUF** file is the model-weight file format used by llama.cpp. The bundled
`organizer-chat.gguf` contains the Qwen2.5 1.5B instruction-following model.
`Q4_K_M` means the weights are quantized: stored in a compact representation
so the model uses much less storage and memory than full precision weights.

Before llama.cpp starts, the Rust host checks the model's SHA-256 checksum
against `model-manifest.json`. If the file is missing or does not match, it is
not loaded.

## 4. Startup sequence

```text
User opens the desktop app
        |
        v
Rust finds the packaged resources
        |
        +--> starts ai-service.exe on 127.0.0.1:8010
        |
        +--> verifies organizer-chat.gguf checksum
        |
        +--> starts llama-server.exe on 127.0.0.1:8011
        |
        v
Rust gives the AI service the local model endpoint (/v1)
        |
        v
The UI is ready for scans and review
```

The installer contains all three runtime assets: `ai-service.exe`, llama.cpp
and its required DLLs, and the GGUF model. No download is needed on the other
computer after installation.

## 5. Scanning and classification flow

```text
Selected folder
  -> Rust walks files recursively
  -> skips ignored folders, inaccessible entries, and Git projects
  -> reads metadata, detects type, and calculates SHA-256 when appropriate
  -> sends a bounded file-content prefix to the local AI service
  -> extracts text and applies deterministic classification rules
  -> asks the local model only when rules are not confident enough
  -> validates category and filename suggestions
  -> saves a pending review item in SQLite
  -> user approves, edits, or ignores it
  -> Rust performs approved move/rename and records it for undo
```

The scanner excludes common build and environment folders such as `.git`,
`node_modules`, `.venv`, `target`, and `dist`. A folder that contains `.git`
is a protected project boundary: the organizer neither processes nor changes
any file below it, including documents under `docs/`.

The service receives at most a bounded prefix of a file. Large, unsupported,
or unavailable text extraction falls back safely instead of failing the scan.

## 6. How a suggestion is made

The AI service uses the least expensive reliable option first:

1. File metadata and extension help identify the content type.
2. Deterministic rules classify obvious files with high confidence.
3. When rule confidence is low, the service sends the filename, detected type,
   and extracted text to Qwen through llama.cpp.
4. The response must conform to the app's category tree and filename safety
   rules before it becomes a suggestion.
5. If the model is unavailable, the app continues with rules and a conservative
   fallback suggestion.

This is why a source file such as `billing.py` is treated as code based on its
extension and content instead of being assumed to be an invoice from its name.

## 7. Privacy and safety boundaries

All communication paths are local:

```text
React UI --Tauri invoke--> Rust core --HTTP--> AI service --HTTP--> llama.cpp
                                  all HTTP addresses are 127.0.0.1 / localhost
```

The Rust HTTP client rejects a non-loopback AI-service URL. The Python service
also rejects a non-loopback language-model URL. Therefore the normal packaged
application has no route to send document contents to a remote AI server.

Other protections include:

- The AI service has no move, rename, delete, shell, or arbitrary-path API.
- Rust validates target categories, filenames, and destination paths.
- Moves never overwrite an existing file; a collision gets a safe new name.
- Operations are written to SQLite before and after execution for history and
  undo.
- The watcher indexes new files for review only; automatic application is off.

## 8. Local data and features

SQLite lives in the application's operating-system data directory. It records
the file index, analysis suggestions, embeddings, operation history, watcher
settings, and application settings. The original files remain in their own
folders; the database stores their metadata and paths.

Feature behavior:

- **Review:** pending suggestions are shown before a change is made.
- **History / Undo:** reverses an organizer operation when it is safe to do so.
- **Duplicates:** groups exact SHA-256 matches; it never deletes duplicates.
- **Search:** uses locally stored embeddings when available, with a local
  deterministic fallback.
- **Smart watch folders:** notices settled file changes, indexes them, and
  queues review items without moving anything.
- **Storage intelligence and timeline:** summarize data already indexed in the
  local database.

## 9. Source-code map

```text
apps/desktop/src/                  React screens and UI state
apps/desktop/src-tauri/src/        Rust commands, scanner, database, safety
apps/desktop/src-tauri/resources/  Packaged model, llama.cpp, and AI service
services/ai-service/app/           FastAPI routes, extractors, rules, LLM client
shared/categories/                 Category tree owned by the application
data/schema.sql                    SQLite schema
```

Important Rust modules:

- `core/scanner.rs`: safe recursive scan and Git-project exclusion.
- `fs/ops.rs`: validated move/rename, collision handling, and undo support.
- `ai/service_manager.rs`: starts and stops the packaged AI service.
- `ai/llama_manager.rs`: verifies the model and controls llama.cpp.
- `commands.rs`: connects UI commands to scanning, review, and file actions.

## 10. Developing and releasing

For local development, run the FastAPI service on port 8010 and the Tauri app
from `apps/desktop`. The README contains the exact commands.

For a shareable Windows installer, package from `apps/desktop`:

```powershell
npm run tauri build -- --bundles nsis
```

The resulting NSIS installer includes the assets declared in
`src-tauri/tauri.conf.json`. Release assets are intentionally ignored by Git
because the model is large. Their required versions, locations, and checksum
are recorded in [Offline AI Release Assets](LOCAL_MODEL_RELEASE.md).

## 11. Troubleshooting basics

| Symptom | What to check |
| --- | --- |
| Local model is unavailable | Confirm the installer is complete and the model checksum has not changed. |
| AI suggestions use fallback rules | Wait for the model to finish starting, then scan again. |
| A folder contains no files after scan | It may be a Git project, an ignored directory, inaccessible, or empty. |
| A move is refused | Check that the file is not inside a Git project and that the destination does not already exist. |
| Installer is very large | This is expected: the GGUF model is included for offline operation. |
