//! Domain types that cross the Tauri IPC boundary.
//! Field names are camelCase so they match the TypeScript `types.ts` contract.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Pending,
    Indexed,
    Analyzed,
    Error,
    Missing,
}

impl Default for FileStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl FileStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Indexed => "indexed",
            Self::Analyzed => "analyzed",
            Self::Error => "error",
            Self::Missing => "missing",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "indexed" => Self::Indexed,
            "analyzed" => Self::Analyzed,
            "error" => Self::Error,
            "missing" => Self::Missing,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewStatus {
    Pending,
    Approved,
    Ignored,
    Edited,
}

impl ReviewStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Approved => "approved",
            Self::Ignored => "ignored",
            Self::Edited => "edited",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "approved" => Self::Approved,
            "ignored" => Self::Ignored,
            "edited" => Self::Edited,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionSource {
    Rule,
    Ai,
    Manual,
    Cache,
    Fallback,
}

impl SuggestionSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Rule => "rule",
            Self::Ai => "ai",
            Self::Manual => "manual",
            Self::Cache => "cache",
            Self::Fallback => "fallback",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "ai" => Self::Ai,
            "manual" => Self::Manual,
            "cache" => Self::Cache,
            "fallback" => Self::Fallback,
            _ => Self::Rule,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OperationType {
    Move,
    Rename,
    MoveAndRename,
}

impl OperationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Move => "move",
            Self::Rename => "rename",
            Self::MoveAndRename => "move_and_rename",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OperationStatus {
    Planned,
    Completed,
    Failed,
    Undone,
    UndoConflict,
}

impl OperationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Planned => "planned",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Undone => "undone",
            Self::UndoConflict => "undo_conflict",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "undone" => Self::Undone,
            "undo_conflict" => Self::UndoConflict,
            _ => Self::Planned,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub mime_type: Option<String>,
    pub size: i64,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub sha256: Option<String>,
    pub status: FileStatus,
    pub is_ignored: bool,
    pub scan_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAnalysis {
    pub id: String,
    pub file_id: String,
    pub category: String,
    pub subcategory: Option<String>,
    pub summary: Option<String>,
    pub tags: Vec<String>,
    pub suggested_filename: Option<String>,
    pub suggested_folder: Option<String>,
    pub confidence: f64,
    pub source: SuggestionSource,
    pub model_name: Option<String>,
    pub extraction_method: Option<String>,
    pub review_status: ReviewStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub file: FileRecord,
    pub analysis: FileAnalysis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub file_id: Option<String>,
    pub batch_id: Option<String>,
    pub operation_type: OperationType,
    pub old_path: String,
    pub new_path: String,
    pub status: OperationStatus,
    pub error: Option<String>,
    pub created_at: String,
    pub executed_at: Option<String>,
    pub undone_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub sha256: String,
    pub size: i64,
    pub keep: FileRecord,
    pub duplicates: Vec<FileRecord>,
    pub wasted_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub session_id: String,
    pub phase: String,
    pub root_path: String,
    pub files_found: u64,
    pub files_skipped: u64,
    pub bytes_scanned: u64,
    pub current_path: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub indexed_files: i64,
    pub pending_reviews: i64,
    pub duplicate_groups: i64,
    pub duplicate_wasted_bytes: i64,
    pub scanned_bytes: i64,
    pub analyzed_files: i64,
    pub operations_applied: i64,
    pub watched_folders: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub file: FileRecord,
    pub analysis: Option<FileAnalysis>,
    pub score: f64,
    pub matched_on: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub ignore_globs: Vec<String>,
    pub max_file_size_for_hashing: u64,
    pub pdf_page_limit: u32,
    pub ai_service_url: String,
    pub llm_model: String,
    pub embedding_model: String,
    pub auto_analyze_after_scan: bool,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ignore_globs: crate::core::scanner::DEFAULT_IGNORES
                .iter()
                .map(|s| (*s).to_string())
                .collect(),
            max_file_size_for_hashing: 512 * 1024 * 1024,
            pdf_page_limit: 5,
            ai_service_url: "http://127.0.0.1:8010".into(),
            llm_model: "qwen2.5-3b-instruct".into(),
            embedding_model: "all-MiniLM-L6-v2".into(),
            auto_analyze_after_scan: true,
            theme: "dark".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleRecord {
    pub id: String,
    pub name: String,
    pub priority: i64,
    pub enabled: bool,
    pub match_type: String,
    pub pattern: String,
    pub category: String,
    pub subcategory: Option<String>,
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolder {
    pub id: String,
    pub path: String,
    pub enabled: bool,
    pub auto_analyze: bool,
    pub auto_apply: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub root_path: String,
    pub recursive: bool,
    pub compute_hashes: bool,
    pub analyze: bool,
    pub ignore_globs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRequest {
    pub file_id: String,
    pub target_filename: String,
    pub target_folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub batch_id: String,
    pub planned: usize,
    pub completed: usize,
    pub failed: usize,
    pub operations: Vec<Operation>,
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn datetime_to_iso(value: Option<DateTime<Utc>>) -> Option<String> {
    value.map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
