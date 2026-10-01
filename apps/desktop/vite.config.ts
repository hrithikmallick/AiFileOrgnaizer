import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8010";

// Tauri expects a fixed dev port and does not want Vite to clear the screen.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: true,
    port: 1420,
    strictPort: false,
    watch: {
      // Cargo creates and locks executable build artifacts under this directory.
      ignored: ["**/src-tauri/target/**"],
    },
    proxy: {
      "/api/ai": {
        target: AI_SERVICE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, ""),
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    sourcemap: true,
    outDir: "dist",
  },
});
