# Local AI File Organizer

Local AI File Organizer is a Windows desktop app that helps you review,
rename, categorize, search, and find duplicate files. It works on your device:
your files are not uploaded to a cloud service.

The AI makes suggestions only. Nothing is moved, renamed, or deleted until you
review and approve it.

## What it does

- Scans a folder and identifies file type, metadata, and duplicate hashes.
- Extracts supported document text and suggests a category, filename, tags,
  and summary.
- Lets you approve, edit, ignore, or undo file operations.
- Searches indexed content, shows duplicate groups, and records a timeline.
- Watches selected folders and adds new files to review. It never auto-moves
  files.
- Completely protects Git projects: a folder containing `.git`, and every
  file below it, is never scanned for organization or moved.

## Install and use

1. Run [the Windows installer](apps/desktop/src-tauri/target/release/bundle/nsis/Local%20AI%20File%20Organizer_0.1.0_x64-setup.exe).
2. Open **Local AI File Organizer** from the Start menu.
3. Select a non-project folder to scan.
4. Review the suggestions in **Review**.
5. Select files and approve only the changes you want.

The installer is about 1.1 GB because it already contains the local AI model.
It does not download Python, llama.cpp, a model, or any cloud component after
installation.

## How private local AI works

At startup the desktop app launches these bundled, local components:

```text
Desktop app
  -> Local AI service (127.0.0.1:8010)
  -> llama.cpp model server (127.0.0.1:8011)
  -> Qwen2.5-1.5B-Instruct Q4_K_M GGUF model
```

All connections are restricted to `localhost`. The Rust desktop core owns file
operations; the AI service has no API that can move, rename, delete, or execute
files.

For the full explanation of every component and the data flow, read
[Technical Guide](docs/TECHNICAL_GUIDE.md). For the exact packaged model and
runtime assets, read [Offline AI Release Assets](docs/LOCAL_MODEL_RELEASE.md).

## Project layout

```text
apps/desktop/             React user interface and Tauri/Rust desktop host
services/ai-service/      Local FastAPI extraction and classification service
shared/categories/        Allowed category tree
data/schema.sql           SQLite database schema
docs/                     User, architecture, and release documentation
```

## Development

Prerequisites: Node.js, Rust (with the MSVC build tools on Windows), and
Python 3.

```powershell
# Terminal 1: local AI service
cd services/ai-service
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Terminal 2: desktop app
cd apps/desktop
npm install
npm run tauri dev
```

To create a Windows installer with the bundled local runtime and model:

```powershell
cd apps/desktop
npm run tauri build -- --bundles nsis
```

The release assets must be present first; see
[Offline AI Release Assets](docs/LOCAL_MODEL_RELEASE.md).

## Safety promises

| The app can do | The app will not do |
| --- | --- |
| Suggest categories and filenames | Upload files for AI processing |
| Extract and index local text | Auto-apply a move or rename |
| Move or rename after approval | Overwrite an existing file |
| Undo completed organizer operations | Touch files inside a Git project |

## License

Private / local use. No telemetry, accounts, or cloud requirement.
