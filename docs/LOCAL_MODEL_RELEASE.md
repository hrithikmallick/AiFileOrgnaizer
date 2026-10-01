# Bundled offline AI release assets

The Windows installer includes the complete local AI stack. Its release assets
are deliberately ignored by Git because the model is approximately 1.04 GiB.
Before creating an installer, place these files in:

```text
apps/desktop/src-tauri/resources/ai-service/ai-service.exe
apps/desktop/src-tauri/resources/llama/llama-server.exe
apps/desktop/src-tauri/resources/llama/<required DLLs>
apps/desktop/src-tauri/resources/models/organizer-chat.gguf
```

The current release uses these pinned assets:

- `llama.cpp` Windows CPU x64 binary release `b11277`.
- `Qwen2.5-1.5B-Instruct-Q4_K_M` from Qwen's GGUF release.
- GGUF SHA-256: `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
- `ai-service.exe`, a frozen local FastAPI service built from
  `services/ai-service/run_service.py` with PyInstaller. It embeds the shared
  category tree and has no cloud dependency.

The desktop host refuses to load a mismatched model. On application launch it
starts the AI service on `127.0.0.1:8010`, starts llama.cpp on
`127.0.0.1:8011`, and configures the service with llama.cpp's loopback
OpenAI-compatible endpoint. There are no downloads or internet calls at
install or runtime.

Build the installer from `apps/desktop` after the assets are present:

```powershell
npm run tauri build -- --bundles nsis
```

The resulting shareable installer is written to
`src-tauri/target/release/bundle/nsis/`. It is intentionally about the size of
the GGUF model plus the application and runtime binaries.
