import type {
  AppSettings,
  ApplyRequest,
  ApplyResult,
  DashboardStats,
  DuplicateGroup,
  FileAnalysis,
  FileRecord,
  Operation,
  ReviewItem,
  ReviewStatus,
  RuleRecord,
  ScanOptions,
  ScanProgress,
  SearchResult,
  WatchedFolder,
  CategoryTree,
  LocalModelStatus,
} from "../types";

export interface AnalyzeProgress {
  fileId: string;
  analyzed: number;
  total: number;
  current: string;
}

/**
 * The single contract the UI depends on. Two implementations exist:
 *  - `tauriBackend`: talks to the Rust core through Tauri `invoke`.
 *  - `mockBackend`: an in-browser demo used when running under a plain browser.
 *
 * The Rust core is always the component that performs filesystem mutations.
 */
export interface Backend {
  readonly kind: "tauri" | "demo";

  getCategoryTree(): Promise<CategoryTree>;

  getLocalModelStatus(): Promise<LocalModelStatus>;

  startLocalModel(): Promise<LocalModelStatus>;

  stopLocalModel(): Promise<void>;

  getStats(): Promise<DashboardStats>;

  listFiles(limit?: number): Promise<FileRecord[]>;

  listReviewItems(status?: ReviewStatus | "all"): Promise<ReviewItem[]>;

  updateAnalysis(analysisId: string, patch: Partial<FileAnalysis>): Promise<FileAnalysis>;

  setReviewStatus(analysisIds: string[], status: ReviewStatus): Promise<number>;

  startScan(options: ScanOptions): Promise<{ sessionId: string }>;

  cancelScan(): Promise<void>;

  onScanProgress(handler: (progress: ScanProgress) => void): () => void;

  /** Called after a changed file in a watched folder is safely indexed. */
  onWatchedFolderIndexed(handler: (count: number) => void): () => void;

  applyChanges(requests: ApplyRequest[]): Promise<ApplyResult>;

  listOperations(limit?: number): Promise<Operation[]>;

  undoBatch(batchId: string): Promise<{ undone: number; conflicts: number }>;

  undoOperation(operationId: string): Promise<void>;

  findDuplicates(): Promise<DuplicateGroup[]>;

  search(query: string): Promise<SearchResult[]>;

  getSettings(): Promise<AppSettings>;

  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  listRules(): Promise<RuleRecord[]>;

  updateRule(ruleId: string, patch: Partial<RuleRecord>): Promise<RuleRecord>;

  listWatchedFolders(): Promise<WatchedFolder[]>;

  toggleWatchedFolder(folderId: string, enabled: boolean): Promise<WatchedFolder>;

  addWatchedFolder(path: string): Promise<WatchedFolder>;

  /** Suggested folder for a target, used to preview the operation. */
  previewTarget(folder: string, filename: string): string;
}
