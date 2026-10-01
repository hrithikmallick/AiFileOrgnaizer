# Bundled llama.cpp release assets

The source tree deliberately contains no LLM binary or model weights. Before
creating an installer, the release pipeline must place these files in:

```text
apps/desktop/src-tauri/resources/llama/llama-server.exe
apps/desktop/src-tauri/resources/llama/<required DLLs>
apps/desktop/src-tauri/resources/models/organizer-chat.gguf
```

Then replace the placeholder in `model-manifest.json` with the model's exact
SHA-256, name, and tested context size.

The desktop host refuses to load an unpinned or mismatched model. It starts
llama.cpp with a fixed model path, `127.0.0.1:8011`, and no remote downloads.
The FastAPI service receives only the loopback OpenAI-compatible endpoint.
