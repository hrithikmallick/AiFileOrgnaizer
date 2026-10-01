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
import { CATEGORY_TREE, isValidCategory, isValidSubcategory, normalizeCategory } from "./categories";
import { buildDemoState, DEMO_ROOT } from "./demoData";
import { sanitizeFilename } from "./filename";
import { basename, dirname } from "./format";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "demo-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function joinPath(root: string, folder: string, filename: string): string {
  const normalized = folder.replace(/[\\/]+/g, "\\").replace(/^\\+|\\+$/g, "");
  const base = root.replace(/[\\/]+$/, "");
  return normalized ? `${base}\\${normalized}\\${filename}` : `${base}\\${filename}`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

const DEFAULT_SETTINGS: AppSettings = {
  ignoreGlobs: [".git", "node_modules", ".venv", "venv", "__pycache__", "target", "dist", "build"],
  maxFileSizeForHashing: 512 * 1024 * 1024,
  pdfPageLimit: 5,
  aiServiceUrl: "http://127.0.0.1:8010",
  llmModel: "qwen2.5-3b-instruct",
  embeddingModel: "all-MiniLM-L6-v2",
  autoAnalyzeAfterScan: true,
  theme: "dark",
};

/**
 * In-browser implementation of the {@link Backend} contract. It mirrors the
 * semantics of the Rust core (including the "suggestions only, Rust applies"
 * boundary) so the UI can be developed and previewed without a native build.
 */
export class MockBackend implements Backend {
  readonly kind = "demo" as const;

  async getLocalModelStatus(): Promise<LocalModelStatus> {
    return {
      state: "unavailable",
      modelName: null,
      endpoint: null,
      message: "The bundled local model is available only in the desktop app.",
    };
  }

  async startLocalModel(): Promise<LocalModelStatus> {
    return this.getLocalModelStatus();
  }

  async stopLocalModel(): Promise<void> {}

  private files: FileRecord[];
  private analyses: FileAnalysis[];
  private operations: Operation[];
  private rules: RuleRecord[];
  private folders: WatchedFolder[];
  private settings: AppSettings = { ...DEFAULT_SETTINGS };

  private progressHandlers = new Set<(progress: ScanProgress) => void>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private activeSession: string | null = null;

  constructor() {
    const state = buildDemoState();
    this.files = state.files;
    this.analyses = state.analyses;
    this.operations = state.operations;
    this.rules = state.rules;
    this.folders = state.folders;
  }

  async getCategoryTree(): Promise<CategoryTree> {
    return CATEGORY_TREE;
  }

  async getStats(): Promise<DashboardStats> {
    const duplicateGroups = await this.findDuplicates();
    const scannedBytes = this.files.reduce((sum, file) => sum + file.size, 0);
    return {
      indexedFiles: this.files.length,
      pendingReviews: this.analyses.filter((a) => a.reviewStatus === "pending").length,
      duplicateGroups: duplicateGroups.length,
      duplicateWastedBytes: duplicateGroups.reduce((sum, group) => sum + group.wastedBytes, 0),
      scannedBytes,
      analyzedFiles: this.analyses.length,
      operationsApplied: this.operations.filter((op) => op.status === "completed").length,
      watchedFolders: this.folders.filter((folder) => folder.enabled).length,
    };
  }

  async listFiles(limit = 500): Promise<FileRecord[]> {
    return [...this.files].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  }

  async listReviewItems(status: ReviewStatus | "all" = "pending"): Promise<ReviewItem[]> {
    const byFile = new Map(this.analyses.map((analysis) => [analysis.fileId, analysis]));
    return this.files
      .map((file) => ({ file, analysis: byFile.get(file.id) }))
      .filter((item): item is ReviewItem => Boolean(item.analysis))
      .filter((item) => status === "all" || item.analysis.reviewStatus === status)
      .sort((a, b) => b.analysis.confidence - a.analysis.confidence);
  }

  async updateAnalysis(analysisId: string, patch: Partial<FileAnalysis>): Promise<FileAnalysis> {
    const analysis = this.analyses.find((item) => item.id === analysisId);
    if (!analysis) throw new Error(`Analysis ${analysisId} not found`);

    if (patch.category !== undefined || patch.subcategory !== undefined) {
      const normalized = normalizeCategory(
        patch.category ?? analysis.category,
        patch.subcategory ?? analysis.subcategory,
      );
      analysis.category = normalized.category;
      analysis.subcategory = normalized.subcategory;
      analysis.suggestedFolder = `${normalized.category}/${normalized.subcategory}`;
    }
    if (patch.suggestedFilename != null) {
      analysis.suggestedFilename = sanitizeFilename(patch.suggestedFilename);
    }
    if (patch.tags !== undefined) analysis.tags = patch.tags;
    if (patch.summary !== undefined) analysis.summary = patch.summary;
    analysis.source = "manual";
    analysis.reviewStatus = "edited";
    analysis.updatedAt = new Date().toISOString();
    return { ...analysis };
  }

  async setReviewStatus(analysisIds: string[], status: ReviewStatus): Promise<number> {
    const ids = new Set(analysisIds);
    let count = 0;
    for (const analysis of this.analyses) {
      if (ids.has(analysis.id)) {
        analysis.reviewStatus = status;
        analysis.updatedAt = new Date().toISOString();
        count += 1;
      }
    }
    return count;
  }

  async startScan(options: ScanOptions): Promise<{ sessionId: string }> {
    if (this.scanTimer) throw new Error("A scan is already running");
    const sessionId = `demo-session-${uuid().slice(0, 8)}`;
    this.activeSession = sessionId;

    const total = this.files.length;
    let found = 0;
    let bytes = 0;

    const emit = (phase: ScanProgress["phase"], message: string | null, currentPath: string | null) => {
      const progress: ScanProgress = {
        sessionId,
        phase,
        rootPath: options.rootPath,
        filesFound: found,
        filesSkipped: 0,
        bytesScanned: bytes,
        currentPath,
        message,
      };
      this.progressHandlers.forEach((handler) => handler(progress));
    };

    emit("scanning", "Walking directory tree", options.rootPath);

    this.scanTimer = setInterval(() => {
      if (found >= total) {
        if (this.scanTimer) clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.activeSession = null;
        emit("done", `Scan complete: ${found} files`, null);
        return;
      }
      const file = this.files[found];
      found += 1;
      if (file) {
        bytes += file.size;
      }
      if (options.computeHashes) {
        emit("hashing", "Computing SHA-256", file?.path ?? null);
      } else {
        emit("scanning", "Collecting metadata", file?.path ?? null);
      }
      if (found === total) {
        emit("analyzing", "Running rules and AI analysis", null);
      }
    }, 90);

    const skipNotice = options.ignoreGlobs.length > 0 ? ` ignoring ${options.ignoreGlobs.join(", ")}` : "";
    emit("scanning", `Scanning ${options.rootPath}${skipNotice}`, options.rootPath);
    return { sessionId };
  }

  async cancelScan(): Promise<void> {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    const sessionId = this.activeSession;
    this.activeSession = null;
    if (sessionId) {
      for (const handler of this.progressHandlers) {
        handler({
          sessionId,
          phase: "cancelled",
          rootPath: DEMO_ROOT,
          filesFound: 0,
          filesSkipped: 0,
          bytesScanned: 0,
          currentPath: null,
          message: "Scan cancelled by user",
        });
      }
    }
  }

  onScanProgress(handler: (progress: ScanProgress) => void): () => void {
    this.progressHandlers.add(handler);
    return () => this.progressHandlers.delete(handler);
  }

  async applyChanges(requests: ApplyRequest[]): Promise<ApplyResult> {
    const batchId = `demo-batch-${uuid().slice(0, 8)}`;
    const now = new Date().toISOString();
    const taken = new Set(this.files.map((file) => file.path.toLowerCase()));
    const operations: Operation[] = [];

    for (const request of requests) {
      const file = this.files.find((item) => item.id === request.fileId);
      if (!file) continue;
      const analysis = this.analyses.find((item) => item.fileId === file.id);
      const filename = sanitizeFilename(request.targetFilename);
      const folder = request.targetFolder;
      if (!isValidCategory(folder.split("/")[0] ?? "")) continue;

      const target = joinPath(DEMO_ROOT, folder, filename);
      if (target.toLowerCase() === file.path.toLowerCase()) continue;

      let finalTarget = target;
      if (taken.has(finalTarget.toLowerCase())) {
        const { stem } = splitExtensionLocal(filename);
        const ext = filename.slice(stem.length);
        let index = 2;
        while (taken.has(joinPath(DEMO_ROOT, folder, `${stem}_${index}${ext}`).toLowerCase())) index += 1;
        finalTarget = joinPath(DEMO_ROOT, folder, `${stem}_${index}${ext}`);
      }
      taken.add(finalTarget.toLowerCase());

      const operation: Operation = {
        id: `demo-op-${uuid().slice(0, 8)}`,
        fileId: file.id,
        batchId,
        operationType: dirname(file.path) === dirname(finalTarget) ? "rename" : "move_and_rename",
        oldPath: file.path,
        newPath: finalTarget,
        status: "completed",
        error: null,
        createdAt: now,
        executedAt: now,
        undoneAt: null,
      };
      operations.push(operation);

      file.path = finalTarget;
      file.name = basename(finalTarget);
      file.extension = finalTarget.includes(".") ? finalTarget.split(".").pop() ?? null : null;
      file.modifiedAt = now;
      if (analysis) {
        analysis.reviewStatus = "approved";
        analysis.suggestedFilename = basename(finalTarget);
        analysis.suggestedFolder = folder;
        analysis.updatedAt = now;
      }
    }

    this.operations.unshift(...operations);
    return {
      batchId,
      planned: operations.length,
      completed: operations.length,
      failed: 0,
      operations,
    };
  }

  async listOperations(limit = 200): Promise<Operation[]> {
    return [...this.operations]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  async undoBatch(batchId: string): Promise<{ undone: number; conflicts: number }> {
    const batch = this.operations
      .filter((operation) => operation.batchId === batchId && operation.status === "completed")
      .reverse();
    let undone = 0;
    let conflicts = 0;
    const now = new Date().toISOString();
    const occupied = new Set(this.files.map((file) => file.path.toLowerCase()));

    for (const operation of batch) {
      const target = operation.oldPath;
      if (occupied.has(target.toLowerCase()) || !operation.newPath) {
        operation.status = "undo_conflict";
        operation.error = "Original path now occupied; skipped to avoid overwrite.";
        conflicts += 1;
        continue;
      }
      const file = this.files.find((item) => item.id === operation.fileId);
      if (file) {
        occupied.delete(file.path.toLowerCase());
        file.path = target;
        file.name = basename(target);
        file.modifiedAt = now;
        const analysis = this.analyses.find((item) => item.fileId === file.id);
        if (analysis) analysis.reviewStatus = "pending";
      }
      operation.status = "undone";
      operation.undoneAt = now;
      undone += 1;
    }
    return { undone, conflicts };
  }

  async undoOperation(operationId: string): Promise<void> {
    const operation = this.operations.find((item) => item.id === operationId);
    if (!operation) throw new Error(`Operation ${operationId} not found`);
    if (operation.status !== "completed") throw new Error("Only completed operations can be undone");
    await this.undoBatch(operation.batchId ?? operation.id);
  }

  async findDuplicates(): Promise<DuplicateGroup[]> {
    const byHash = new Map<string, FileRecord[]>();
    for (const file of this.files) {
      if (!file.sha256 || file.isIgnored) continue;
      const group = byHash.get(file.sha256) ?? [];
      group.push(file);
      byHash.set(file.sha256, group);
    }

    const groups: DuplicateGroup[] = [];
    for (const [sha256, group] of byHash) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => {
        const byDate = Date.parse(a.createdAt ?? "") - Date.parse(b.createdAt ?? "");
        return byDate !== 0 ? byDate : a.path.length - b.path.length;
      });
      const keep = sorted[0];
      const duplicates = sorted.slice(1);
      if (!keep) continue;
      groups.push({
        sha256,
        size: keep.size,
        keep,
        duplicates,
        wastedBytes: keep.size * duplicates.length,
      });
    }
    return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const terms = tokenize(trimmed);
    const byFile = new Map(this.analyses.map((analysis) => [analysis.fileId, analysis]));
    const results: SearchResult[] = [];

    for (const file of this.files) {
      const analysis = byFile.get(file.id) ?? null;
      const haystack = [
        file.name,
        analysis?.summary ?? "",
        analysis?.category ?? "",
        analysis?.subcategory ?? "",
        (analysis?.tags ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;
      let matchedOn: SearchResult["matchedOn"] = "keyword";
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
        if (file.name.toLowerCase().includes(term)) score += 1.5;
      }
      if (score === 0) continue;
      if (terms.length > 0) score = score / (terms.length * 2.5);
      if (analysis && (analysis.tags.some((tag) => trimmed.toLowerCase().includes(tag.toLowerCase())) || (analysis.summary ?? "").toLowerCase().includes(trimmed.toLowerCase()))) {
        score += 0.25;
        matchedOn = "semantic";
      }
      results.push({ file, analysis, score: Math.min(1, score), matchedOn });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  async getSettings(): Promise<AppSettings> {
    return { ...this.settings, ignoreGlobs: [...this.settings.ignoreGlobs] };
  }

  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch };
    return this.getSettings();
  }

  async listRules(): Promise<RuleRecord[]> {
    return [...this.rules].sort((a, b) => a.priority - b.priority);
  }

  async updateRule(ruleId: string, patch: Partial<RuleRecord>): Promise<RuleRecord> {
    const rule = this.rules.find((item) => item.id === ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);
    if (patch.category !== undefined) {
      const { category, subcategory } = normalizeCategory(patch.category, patch.subcategory ?? rule.subcategory);
      if (!isValidCategory(category) || !isValidSubcategory(category, subcategory)) {
        throw new Error("Rule must target a valid category/subcategory");
      }
      rule.category = category;
      rule.subcategory = subcategory;
    }
    if (patch.pattern !== undefined) rule.pattern = patch.pattern;
    if (patch.priority !== undefined) rule.priority = patch.priority;
    if (patch.enabled !== undefined) rule.enabled = patch.enabled;
    return { ...rule };
  }

  async listWatchedFolders(): Promise<WatchedFolder[]> {
    return this.folders.map((folder) => ({ ...folder }));
  }

  async toggleWatchedFolder(folderId: string, enabled: boolean): Promise<WatchedFolder> {
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder) throw new Error(`Watched folder ${folderId} not found`);
    folder.enabled = enabled;
    return { ...folder };
  }

  async addWatchedFolder(path: string): Promise<WatchedFolder> {
    const existing = this.folders.find((folder) => folder.path === path);
    if (existing) return { ...existing };
    const folder: WatchedFolder = {
      id: `watch-${uuid().slice(0, 8)}`,
      path,
      enabled: true,
      autoAnalyze: true,
      autoApply: false,
    };
    this.folders.push(folder);
    return folder;
  }

  onWatchedFolderIndexed(): () => void {
    return () => undefined;
  }

  previewTarget(folder: string, filename: string): string {
    return joinPath(DEMO_ROOT, folder, sanitizeFilename(filename));
  }
}

function splitExtensionLocal(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}
