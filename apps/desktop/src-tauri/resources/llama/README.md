# Bundled llama.cpp runtime

Place the signed Windows llama.cpp release runtime here before packaging:

```text
llama-server.exe
required runtime DLLs
```

The Rust desktop host starts only `llama-server.exe`, with a fixed bundled GGUF
path and loopback address. Do not enable llama.cpp tools, agent mode, remote
model downloads, or non-loopback binding.
