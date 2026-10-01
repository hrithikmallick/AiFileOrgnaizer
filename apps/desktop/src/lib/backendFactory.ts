import type { Backend } from "./backend";
import { MockBackend } from "./mockBackend";

/** True when the app runs inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let instance: Backend | null = null;

/**
 * Resolves the active backend. The Tauri module is imported lazily so the
 * browser bundle never pulls in the native IPC layer.
 */
export async function getBackend(): Promise<Backend> {
  if (instance) return instance;
  if (isTauri()) {
    const { TauriBackend } = await import("./tauriBackend");
    instance = new TauriBackend();
  } else {
    instance = new MockBackend();
  }
  return instance;
}
