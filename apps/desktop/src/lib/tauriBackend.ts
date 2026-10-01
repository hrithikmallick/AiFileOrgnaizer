import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  ApplyRequest,
  ApplyResult,
  CategoryTree,
  DashboardStats,
  DuplicateGroup,
  FileAnalysis,
  FileRecord,
  LocalModelStatus,
  Operation,
  ReviewItem,
  ReviewStatus,
  RuleRecord,
  ScanOptions,
  ScanProgress,
  SearchResult,
  WatchedFolder,
} from "../types";
import type { Backend } from "./backend";

/** Name of the Tauri event emitted by the Rust scanner. */
export const SCAN_PROGRESS_EVENT = "scan://progress";
export const WATCH_FOLDER_EVENT = "watch://indexed";

function joinPath(root: string, folder: string, filename: string): string {
  const normalized = folder.replace(/[\\/]+/g, "\\").replace(/^\\+|\\+$/g, "");
  const base = root.replace(/[\\/]+$/, "");
  return normalized ? `${base}\\${normalized}\\${filename}` : `${base}\\${filename}`;
}

/** {@link Backend} implementation backed by the Rust core via Tauri IPC. */
export class TauriBackend implements Backend {
  readonly kind = "tauri" as const;

  private lastRoot = "";

  async getCategoryTree(): Promise<CategoryTree> {
    return invoke<CategoryTree>("get_category_tree");
  }

  async getLocalModelStatus(): Promise<LocalModelStatus> {
    return invoke<LocalModelStatus>("get_local_model_status");
  }

  async startLocalModel(): Promise<LocalModelStatus> {
    return invoke<LocalModelStatus>("start_local_model");
  }

  async stopLocalModel(): Promise<void> {
    await invoke("stop_local_model");
  }

  async getStats(): Promise<DashboardStats> {
    return invoke<DashboardStats>("get_stats");
  }

  async listFiles(limit = 500): Promise<FileRecord[]> {
    return invoke<FileRecord[]>("list_files", { limit });
  }

  async listReviewItems(status: ReviewStatus | "all" = "pending"): Promise<ReviewItem[]> {
    return invoke<ReviewItem[]>("list_review_items", { status });
  }

  async updateAnalysis(analysisId: string, patch: Partial<FileAnalysis>): Promise<FileAnalysis> {
    return invoke<FileAnalysis>("update_analysis", { analysisId, patch });
  }

  async setReviewStatus(analysisIds: string[], status: ReviewStatus): Promise<number> {
    return invoke<number>("set_review_status", { analysisIds, status });
  }

  async startScan(options: ScanOptions): Promise<{ sessionId: string }> {
    this.lastRoot = options.rootPath;
    return invoke<{ sessionId: string }>("start_scan", { options });
  }

  async cancelScan(): Promise<void> {
    await invoke("cancel_scan");
  }

  onScanProgress(handler: (progress: ScanProgress) => void): () => void {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    void listen<ScanProgress>(SCAN_PROGRESS_EVENT, (event) => handler(event.payload)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }

  onWatchedFolderIndexed(handler: (count: number) => void): () => void {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    void listen<number>(WATCH_FOLDER_EVENT, (event) => handler(event.payload)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }

  async applyChanges(requests: ApplyRequest[]): Promise<ApplyResult> {
    return invoke<ApplyResult>("apply_changes", { requests });
  }

  async listOperations(limit = 200): Promise<Operation[]> {
    return invoke<Operation[]>("list_operations", { limit });
  }

  async undoBatch(batchId: string): Promise<{ undone: number; conflicts: number }> {
    return invoke<{ undone: number; conflicts: number }>("undo_batch", { batchId });
  }

  async undoOperation(operationId: string): Promise<void> {
    await invoke("undo_operation", { operationId });
  }

  async findDuplicates(): Promise<DuplicateGroup[]> {
    return invoke<DuplicateGroup[]>("find_duplicates");
  }

  async search(query: string): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("semantic_search", { query });
  }

  async getSettings(): Promise<AppSettings> {
    return invoke<AppSettings>("get_settings");
  }

  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return invoke<AppSettings>("save_settings", { patch });
  }

  async listRules(): Promise<RuleRecord[]> {
    return invoke<RuleRecord[]>("list_rules");
  }

  async updateRule(ruleId: string, patch: Partial<RuleRecord>): Promise<RuleRecord> {
    return invoke<RuleRecord>("update_rule", { ruleId, patch });
  }

  async listWatchedFolders(): Promise<WatchedFolder[]> {
    return invoke<WatchedFolder[]>("list_watched_folders");
  }

  async toggleWatchedFolder(folderId: string, enabled: boolean): Promise<WatchedFolder> {
    return invoke<WatchedFolder>("toggle_watched_folder", { folderId, enabled });
  }

  async addWatchedFolder(path: string): Promise<WatchedFolder> {
    return invoke<WatchedFolder>("add_watched_folder", { path });
  }

  previewTarget(folder: string, filename: string): string {
    return joinPath(this.lastRoot || "<root>", folder, filename);
  }
}
