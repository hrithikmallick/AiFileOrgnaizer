/**
 * Domain types shared by the UI, the Tauri bridge and the browser demo backend.
 * These intentionally mirror the Rust command payloads and the SQLite schema.
 */

export type FileStatus =
  | "pending"
  | "indexed"
  | "analyzed"
  | "error"
  | "missing";

export type ReviewStatus = "pending" | "approved" | "ignored" | "edited";

export type SuggestionSource = "rule" | "ai" | "manual" | "cache" | "fallback";

export type OperationType = "move" | "rename" | "move_and_rename";

export type OperationStatus =
  | "planned"
  | "completed"
  | "failed"
  | "undone"
  | "undo_conflict";

export interface FileRecord {
  id: string;
  path: string;
  name: string;
  extension: string | null;
  mimeType: string | null;
  size: number;
  createdAt: string | null;
  modifiedAt: string | null;
  sha256: string | null;
  status: FileStatus;
  isIgnored: boolean;
  scanSessionId: string | null;
}

export interface FileAnalysis {
  id: string;
  fileId: string;
  category: string;
  subcategory: string | null;
  summary: string | null;
  tags: string[];
  suggestedFilename: string | null;
  suggestedFolder: string | null;
  confidence: number;
  source: SuggestionSource;
  modelName: string | null;
  extractionMethod: string | null;
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewItem {
  file: FileRecord;
  analysis: FileAnalysis;
}

export interface Operation {
  id: string;
  fileId: string | null;
  batchId: string | null;
  operationType: OperationType;
  oldPath: string;
  newPath: string;
  status: OperationStatus;
  error: string | null;
  createdAt: string;
  executedAt: string | null;
  undoneAt: string | null;
}

export interface DuplicateGroup {
  sha256: string;
  size: number;
  /** The suggested file to keep (oldest / shortest path). */
  keep: FileRecord;
  duplicates: FileRecord[];
  wastedBytes: number;
}

export interface ScanProgress {
  sessionId: string;
  phase: "scanning" | "hashing" | "analyzing" | "done" | "cancelled" | "failed";
  rootPath: string;
  filesFound: number;
  filesSkipped: number;
  bytesScanned: number;
  currentPath: string | null;
  message: string | null;
}

export interface DashboardStats {
  indexedFiles: number;
  pendingReviews: number;
  duplicateGroups: number;
  duplicateWastedBytes: number;
  scannedBytes: number;
  analyzedFiles: number;
  operationsApplied: number;
  watchedFolders: number;
}

export interface SearchResult {
  file: FileRecord;
  analysis: FileAnalysis | null;
  score: number;
  matchedOn: "semantic" | "keyword" | "filename";
}

export interface AppSettings {
  ignoreGlobs: string[];
  maxFileSizeForHashing: number;
  pdfPageLimit: number;
  aiServiceUrl: string;
  llmModel: string;
  embeddingModel: string;
  autoAnalyzeAfterScan: boolean;
  theme: "dark" | "light";
}

export interface LocalModelStatus {
  state: "ready" | "starting" | "unavailable";
  modelName: string | null;
  endpoint: string | null;
  message: string | null;
}

export interface RuleRecord {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  matchType: "extension" | "filename_regex" | "mime" | "magic";
  pattern: string;
  category: string;
  subcategory: string | null;
  isBuiltin: boolean;
}

export interface WatchedFolder {
  id: string;
  path: string;
  enabled: boolean;
  autoAnalyze: boolean;
  autoApply: boolean;
}

export interface Category {
  name: string;
  subcategories: string[];
}

export interface CategoryTree {
  version: number;
  categories: Category[];
  fallback: { category: string; subcategory: string };
}

export interface ScanOptions {
  rootPath: string;
  recursive: boolean;
  computeHashes: boolean;
  analyze: boolean;
  ignoreGlobs: string[];
}

export interface ApplyRequest {
  fileId: string;
  /** Final, sanitized filename chosen by the user. */
  targetFilename: string;
  /** Category-relative folder, e.g. "Finance/Invoices". */
  targetFolder: string;
}

export interface ApplyResult {
  batchId: string;
  planned: number;
  completed: number;
  failed: number;
  operations: Operation[];
}

export interface AnalyzedFile {
  fileId: string;
  analysis: FileAnalysis;
}
