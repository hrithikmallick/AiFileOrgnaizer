import type {
  FileAnalysis,
  FileRecord,
  Operation,
  ReviewStatus,
  RuleRecord,
  SuggestionSource,
  WatchedFolder,
} from "../types";

export const DEMO_ROOT = "C:\\Users\\User\\Downloads";
export const DEMO_NOW = Date.parse("2026-10-01T09:30:00Z");

export interface DemoSeed {
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  modifiedAt: string;
  category: string;
  subcategory: string;
  suggestedFilename: string;
  tags: string[];
  summary: string;
  confidence: number;
  source: SuggestionSource;
  reviewStatus: ReviewStatus;
  extractionMethod: string;
  modelName: string;
}

const day = 86_400_000;
const iso = (daysAgo: number, hour = 10): string =>
  new Date(DEMO_NOW - daysAgo * day + hour * 3_600_000).toISOString();

const KB = 1024;

/** A realistic, slightly messy Downloads folder used by the browser demo. */
export const DEMO_SEEDS: DemoSeed[] = [
  {
    name: "document(34).pdf", extension: "pdf", mimeType: "application/pdf", size: 823 * KB,
    sha256: "9f2a1c7d4e8b0a3f6c5d2e1b9a8f7c6d5e4b3a2f1c0d9e8b7a6f5c4d3e2b1a0f",
    createdAt: iso(12), modifiedAt: iso(12),
    category: "Finance", subcategory: "Invoices",
    suggestedFilename: "AWS_Invoice_September_2026.pdf",
    tags: ["AWS", "invoice", "cloud"], summary: "AWS monthly invoice for September 2026.",
    confidence: 0.96, source: "ai", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "download.jpeg", extension: "jpeg", mimeType: "image/jpeg", size: 214 * KB,
    sha256: "3b7e9a1d5c2f8b4e0a6d3c9f7e1b5a2d8c4f0e6b3a7d9c1f5e2b8a4d0c6f3e9b",
    createdAt: iso(9), modifiedAt: iso(9),
    category: "Images", subcategory: "Photos",
    suggestedFilename: "Team_Offsite_Group_Photo.jpg",
    tags: ["team", "offsite", "photo"], summary: "Group photo from the team offsite.",
    confidence: 0.62, source: "ai", reviewStatus: "pending",
    extractionMethod: "image_meta", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "Screenshot 2026-09-28 at 14.12.03.png", extension: "png", mimeType: "image/png", size: 489 * KB,
    sha256: "c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
    createdAt: iso(3), modifiedAt: iso(3),
    category: "Development", subcategory: "Screenshots",
    suggestedFilename: "FastAPI_Docker_Build_Error.png",
    tags: ["fastapi", "docker", "error"], summary: "Screenshot of a Docker build failure while packaging a FastAPI service.",
    confidence: 0.88, source: "ai", reviewStatus: "pending",
    extractionMethod: "ocr_tesseract", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "report_Q3_final_v2 (1).docx", extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1_204 * KB,
    sha256: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    createdAt: iso(20), modifiedAt: iso(6),
    category: "Documents", subcategory: "Reports",
    suggestedFilename: "Q3_2026_Financial_Report.docx",
    tags: ["Q3", "report", "finance"], summary: "Third-quarter financial report draft.",
    confidence: 0.79, source: "ai", reviewStatus: "pending",
    extractionMethod: "docx_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "notes.md", extension: "md", mimeType: "text/markdown", size: 14 * KB,
    sha256: "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
    createdAt: iso(40), modifiedAt: iso(1),
    category: "Development", subcategory: "Documentation",
    suggestedFilename: "Docker_Compose_Notes.md",
    tags: ["docker", "notes", "compose"], summary: "Personal notes on Docker Compose patterns and volumes.",
    confidence: 0.85, source: "ai", reviewStatus: "pending",
    extractionMethod: "markdown_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "setup.exe", extension: "exe", mimeType: "application/vnd.microsoft.portable-executable", size: 42 * 1024 * KB,
    sha256: "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    createdAt: iso(2), modifiedAt: iso(2),
    category: "Software", subcategory: "Installers",
    suggestedFilename: "VSCode_Setup_1.94.exe",
    tags: ["vscode", "installer"], summary: "Windows installer for Visual Studio Code.",
    confidence: 0.9, source: "rule", reviewStatus: "pending",
    extractionMethod: "filename", modelName: "rules-engine",
  },
  {
    name: "invoice_2026_09.pdf", extension: "pdf", mimeType: "application/pdf", size: 96 * KB,
    sha256: "a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
    createdAt: iso(5), modifiedAt: iso(5),
    category: "Finance", subcategory: "Invoices",
    suggestedFilename: "ICICI_Credit_Card_Invoice_Sep_2026.pdf",
    tags: ["ICICI", "credit-card", "invoice"], summary: "Credit card invoice for September 2026.",
    confidence: 0.94, source: "rule", reviewStatus: "approved",
    extractionMethod: "pdf_text", modelName: "rules-engine",
  },
  {
    name: "photo_2026_08_14.jpg", extension: "jpg", mimeType: "image/jpeg", size: 3_210 * KB,
    sha256: "b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9",
    createdAt: iso(47), modifiedAt: iso(47),
    category: "Images", subcategory: "Photos",
    suggestedFilename: "Hiking_Trip_August_2026.jpg",
    tags: ["hiking", "travel"], summary: "Photo from an August hiking trip.",
    confidence: 0.55, source: "ai", reviewStatus: "ignored",
    extractionMethod: "image_meta", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "data.csv", extension: "csv", mimeType: "text/csv", size: 2_450 * KB,
    sha256: "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0",
    createdAt: iso(8), modifiedAt: iso(8),
    category: "Documents", subcategory: "Reports",
    suggestedFilename: "Payments_Export_2026_Q3.csv",
    tags: ["csv", "payments", "export"], summary: "Exported payments dataset for Q3 2026.",
    confidence: 0.6, source: "ai", reviewStatus: "pending",
    extractionMethod: "text_limited", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "main.py", extension: "py", mimeType: "text/x-python", size: 9 * KB,
    sha256: "d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
    createdAt: iso(30), modifiedAt: iso(4),
    category: "Development", subcategory: "Code",
    suggestedFilename: "etl_pipeline_main.py",
    tags: ["python", "etl"], summary: "Python entry point for an ETL pipeline.",
    confidence: 0.83, source: "ai", reviewStatus: "pending",
    extractionMethod: "code_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "taxes_2025.pdf", extension: "pdf", mimeType: "application/pdf", size: 1_870 * KB,
    sha256: "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2",
    createdAt: iso(120), modifiedAt: iso(120),
    category: "Finance", subcategory: "Taxes",
    suggestedFilename: "Personal_Tax_Return_2025.pdf",
    tags: ["tax", "2025"], summary: "Filed personal tax return for 2025.",
    confidence: 0.91, source: "rule", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "rules-engine",
  },
  {
    name: "backup_2026-09-30.zip", extension: "zip", mimeType: "application/zip", size: 15_400 * KB,
    sha256: "f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3",
    createdAt: iso(1), modifiedAt: iso(1),
    category: "Archives", subcategory: "Backups",
    suggestedFilename: "Project_Backup_2026_09_30.zip",
    tags: ["backup", "project"], summary: "Compressed project backup.",
    confidence: 0.88, source: "rule", reviewStatus: "pending",
    extractionMethod: "filename", modelName: "rules-engine",
  },
  {
    name: "IMG_2481.png", extension: "png", mimeType: "image/png", size: 512 * KB,
    sha256: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    createdAt: iso(10), modifiedAt: iso(10),
    category: "Images", subcategory: "Screenshots",
    suggestedFilename: "Dashboard_Mockup_v3.png",
    tags: ["design", "mockup"], summary: "UI mockup of the analytics dashboard.",
    confidence: 0.58, source: "ai", reviewStatus: "pending",
    extractionMethod: "ocr_tesseract", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "resume_latest.pdf", extension: "pdf", mimeType: "application/pdf", size: 320 * KB,
    sha256: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    createdAt: iso(60), modifiedAt: iso(15),
    category: "Personal", subcategory: "Identity",
    suggestedFilename: "Alex_Morgan_Resume_2026.pdf",
    tags: ["resume", "cv"], summary: "Latest resume / curriculum vitae.",
    confidence: 0.87, source: "rule", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "rules-engine",
  },
  {
    name: "docker-compose.yml", extension: "yml", mimeType: "text/yaml", size: 4 * KB,
    sha256: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    createdAt: iso(25), modifiedAt: iso(7),
    category: "Development", subcategory: "Configs",
    suggestedFilename: "ai-service_docker-compose.yml",
    tags: ["docker", "config"], summary: "Compose file for the local AI service stack.",
    confidence: 0.8, source: "rule", reviewStatus: "pending",
    extractionMethod: "code_text", modelName: "rules-engine",
  },
  {
    name: "meeting_recording_notes.txt", extension: "txt", mimeType: "text/plain", size: 11 * KB,
    sha256: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    createdAt: iso(6), modifiedAt: iso(6),
    category: "Work", subcategory: "Meetings",
    suggestedFilename: "Sprint_Planning_Notes_2026_09_25.txt",
    tags: ["sprint", "meeting"], summary: "Notes captured during sprint planning.",
    confidence: 0.7, source: "ai", reviewStatus: "pending",
    extractionMethod: "text_limited", modelName: "qwen2.5-3b-instruct",
  },
  // ---- duplicate group 1: same content, different names ----
  {
    name: "Contract_Signed.pdf", extension: "pdf", mimeType: "application/pdf", size: 640 * KB,
    sha256: "dup1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777aaaa8888bbbb",
    createdAt: iso(14), modifiedAt: iso(14),
    category: "Work", subcategory: "Contracts",
    suggestedFilename: "Acme_Contract_Signed.pdf",
    tags: ["contract", "acme"], summary: "Signed services contract.",
    confidence: 0.86, source: "ai", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "Acme_Contract_Final.pdf", extension: "pdf", mimeType: "application/pdf", size: 640 * KB,
    sha256: "dup1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777aaaa8888bbbb",
    createdAt: iso(3), modifiedAt: iso(3),
    category: "Work", subcategory: "Contracts",
    suggestedFilename: "Acme_Contract_Signed.pdf",
    tags: ["contract", "acme"], summary: "Signed services contract (duplicate copy).",
    confidence: 0.86, source: "cache", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "cache",
  },
  // ---- duplicate group 2 ----
  {
    name: "budget_final.xlsx", extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 88 * KB,
    sha256: "dup2222aaaa3333bbbb4444cccc5555dddd6666eeee7777ffff8888aaaa9999bbbb",
    createdAt: iso(22), modifiedAt: iso(22),
    category: "Finance", subcategory: "Budgets",
    suggestedFilename: "2026_Team_Budget.xlsx",
    tags: ["budget", "spreadsheet"], summary: "Team budget spreadsheet for 2026.",
    confidence: 0.75, source: "ai", reviewStatus: "pending",
    extractionMethod: "binary_meta", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "budget_final (1).xlsx", extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 88 * KB,
    sha256: "dup2222aaaa3333bbbb4444cccc5555dddd6666eeee7777ffff8888aaaa9999bbbb",
    createdAt: iso(11), modifiedAt: iso(11),
    category: "Finance", subcategory: "Budgets",
    suggestedFilename: "2026_Team_Budget.xlsx",
    tags: ["budget", "spreadsheet"], summary: "Team budget spreadsheet (duplicate copy).",
    confidence: 0.75, source: "cache", reviewStatus: "pending",
    extractionMethod: "binary_meta", modelName: "cache",
  },
  // ---- duplicate group 3 ----
  {
    name: "screenshot.png", extension: "png", mimeType: "image/png", size: 275 * KB,
    sha256: "dup3333aaaa4444bbbb5555cccc6666dddd7777eeee8888ffff9999aaaa0000bbbb",
    createdAt: iso(18), modifiedAt: iso(18),
    category: "Development", subcategory: "Screenshots",
    suggestedFilename: "Postgres_Error_Log.png",
    tags: ["postgres", "error"], summary: "Screenshot of a Postgres connection error.",
    confidence: 0.66, source: "ai", reviewStatus: "pending",
    extractionMethod: "ocr_tesseract", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "Screenshot_2026-09-12.png", extension: "png", mimeType: "image/png", size: 275 * KB,
    sha256: "dup3333aaaa4444bbbb5555cccc6666dddd7777eeee8888ffff9999aaaa0000bbbb",
    createdAt: iso(19), modifiedAt: iso(19),
    category: "Development", subcategory: "Screenshots",
    suggestedFilename: "Postgres_Error_Log.png",
    tags: ["postgres", "error"], summary: "Screenshot of a Postgres connection error (duplicate).",
    confidence: 0.66, source: "cache", reviewStatus: "pending",
    extractionMethod: "ocr_tesseract", modelName: "cache",
  },
  // ---- additional singles ----
  {
    name: "machine_learning_basics.pdf", extension: "pdf", mimeType: "application/pdf", size: 5_600 * KB,
    sha256: "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66",
    createdAt: iso(90), modifiedAt: iso(90),
    category: "Books", subcategory: "Papers",
    suggestedFilename: "Machine_Learning_Basics_Paper.pdf",
    tags: ["machine-learning", "ml", "paper"], summary: "Introductory paper on machine learning fundamentals.",
    confidence: 0.82, source: "ai", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "receipt_amazon_0926.pdf", extension: "pdf", mimeType: "application/pdf", size: 42 * KB,
    sha256: "bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77",
    createdAt: iso(4), modifiedAt: iso(4),
    category: "Finance", subcategory: "Receipts",
    suggestedFilename: "Amazon_Receipt_2026_09_27.pdf",
    tags: ["amazon", "receipt"], summary: "Amazon purchase receipt.",
    confidence: 0.9, source: "rule", reviewStatus: "pending",
    extractionMethod: "pdf_text", modelName: "rules-engine",
  },
  {
    name: "app.tsx", extension: "tsx", mimeType: "text/typescript", size: 6 * KB,
    sha256: "cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77ff88",
    createdAt: iso(16), modifiedAt: iso(2),
    category: "Development", subcategory: "Code",
    suggestedFilename: "review_page_component.tsx",
    tags: ["react", "typescript"], summary: "React component for the review page.",
    confidence: 0.78, source: "ai", reviewStatus: "pending",
    extractionMethod: "code_text", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "passport_scan.jpg", extension: "jpg", mimeType: "image/jpeg", size: 780 * KB,
    sha256: "dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77ff88aa99",
    createdAt: iso(150), modifiedAt: iso(150),
    category: "Personal", subcategory: "Identity",
    suggestedFilename: "Passport_Scan.jpg",
    tags: ["passport", "id"], summary: "Scanned copy of a passport.",
    confidence: 0.84, source: "ai", reviewStatus: "pending",
    extractionMethod: "ocr_tesseract", modelName: "qwen2.5-3b-instruct",
  },
  {
    name: "unknown_data.bin", extension: "bin", mimeType: "application/octet-stream", size: 1_990 * KB,
    sha256: "ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77ff88aa99bb00",
    createdAt: iso(33), modifiedAt: iso(33),
    category: "Other", subcategory: "Unknown",
    suggestedFilename: "unknown_data.bin",
    tags: [], summary: "Unrecognized binary file; needs manual review.",
    confidence: 0.2, source: "fallback", reviewStatus: "pending",
    extractionMethod: "unavailable", modelName: "rules-engine",
  },
];

export function buildDemoState(): {
  files: FileRecord[];
  analyses: FileAnalysis[];
  operations: Operation[];
  rules: RuleRecord[];
  folders: WatchedFolder[];
} {
  const files: FileRecord[] = [];
  const analyses: FileAnalysis[] = [];

  DEMO_SEEDS.forEach((seed, index) => {
    const id = `demo-file-${String(index + 1).padStart(3, "0")}`;
    const path = `${DEMO_ROOT}\\${seed.name}`;
    files.push({
      id,
      path,
      name: seed.name,
      extension: seed.extension,
      mimeType: seed.mimeType,
      size: seed.size,
      createdAt: seed.createdAt,
      modifiedAt: seed.modifiedAt,
      sha256: seed.sha256,
      status: seed.reviewStatus === "pending" ? "analyzed" : "indexed",
      isIgnored: false,
      scanSessionId: "demo-session-001",
    });
    analyses.push({
      id: `demo-analysis-${String(index + 1).padStart(3, "0")}`,
      fileId: id,
      category: seed.category,
      subcategory: seed.subcategory,
      summary: seed.summary,
      tags: seed.tags,
      suggestedFilename: seed.suggestedFilename,
      suggestedFolder: `${seed.category}/${seed.subcategory}`,
      confidence: seed.confidence,
      source: seed.source,
      modelName: seed.modelName,
      extractionMethod: seed.extractionMethod,
      reviewStatus: seed.reviewStatus,
      createdAt: seed.createdAt,
      updatedAt: seed.modifiedAt,
    });
  });

  const operations: Operation[] = [
    {
      id: "demo-op-001",
      fileId: files[6]?.id ?? null,
      batchId: "demo-batch-001",
      operationType: "move_and_rename",
      oldPath: `${DEMO_ROOT}\\invoice_2026_09.pdf`,
      newPath: `${DEMO_ROOT}\\Finance\\Invoices\\ICICI_Credit_Card_Invoice_Sep_2026.pdf`,
      status: "completed",
      error: null,
      createdAt: iso(5, 1),
      executedAt: iso(5, 1),
      undoneAt: null,
    },
    {
      id: "demo-op-002",
      fileId: null,
      batchId: "demo-batch-001",
      operationType: "move_and_rename",
      oldPath: `${DEMO_ROOT}\\receipt_amazon_0926.pdf`,
      newPath: `${DEMO_ROOT}\\Finance\\Receipts\\Amazon_Receipt_2026_09_27.pdf`,
      status: "completed",
      error: null,
      createdAt: iso(5, 1),
      executedAt: iso(5, 1),
      undoneAt: null,
    },
  ];

  const rules: RuleRecord[] = [
    rule("r-screenshot", "Filename contains screenshot", 10, "filename_regex", "(?i)screenshot|screen shot|snip", "Images", "Screenshots"),
    rule("r-invoice", "Filename contains invoice", 20, "filename_regex", "(?i)invoice|inv[-_]", "Finance", "Invoices"),
    rule("r-statement", "Filename contains statement", 21, "filename_regex", "(?i)statement", "Finance", "Statements"),
    rule("r-receipt", "Filename contains receipt", 22, "filename_regex", "(?i)receipt", "Finance", "Receipts"),
    rule("r-tax", "Tax documents", 23, "filename_regex", "(?i)\\btax(es)?\\b|1099|w-?2", "Finance", "Taxes"),
    rule("r-resume", "Resume / CV", 30, "filename_regex", "(?i)resume|\\bcv\\b|curriculum", "Personal", "Identity"),
    rule("r-installer", "Windows installers", 40, "extension", "exe,msi,msix,dmg,pkg", "Software", "Installers"),
    rule("r-archive", "Archives", 41, "extension", "zip,rar,7z,tar,gz,bz2,xz", "Archives", "Zip"),
    rule("r-code", "Source code", 50, "extension", "py,rs,ts,tsx,js,jsx,go,java,c,cpp,h,cs,rb,php,sh", "Development", "Code"),
    rule("r-docker", "Docker files", 51, "filename_regex", "(?i)docker", "Development", "Configs"),
    rule("r-markdown", "Markdown notes", 60, "extension", "md,markdown", "Documents", "Notes"),
    rule("r-image", "Image files", 70, "mime", "image/*", "Images", "Photos"),
    rule("r-pdf", "PDF documents", 80, "extension", "pdf", "Documents", "Reports"),
  ];

  const folders: WatchedFolder[] = [
    {
      id: "watch-001",
      path: DEMO_ROOT,
      enabled: true,
      autoAnalyze: true,
      autoApply: false,
    },
  ];

  return { files, analyses, operations, rules, folders };
}

function rule(
  id: string,
  name: string,
  priority: number,
  matchType: RuleRecord["matchType"],
  pattern: string,
  category: string,
  subcategory: string,
): RuleRecord {
  return {
    id,
    name,
    priority,
    enabled: true,
    matchType,
    pattern,
    category,
    subcategory,
    isBuiltin: true,
  };
}
