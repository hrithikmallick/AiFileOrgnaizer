//! Tauri command handlers. Every filesystem mutation goes through `fs::ops`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

use crate::ai::client::{AiClient, AnalyzeRequest};
use crate::ai::llama_manager::{LocalModelManager, LocalModelStatus};
use crate::ai::service_manager::LocalServiceManager;
use crate::core::categories::{normalize, suggested_folder, tree, validate_target_folder};
use crate::core::error::AppError;
use crate::core::filename::sanitize_filename;
use crate::core::scanner::{new_cancel_flag, scan_folder, CancelFlag, ScanConfig};
use crate::core::types::{
    now_iso, new_id, AppSettings, ApplyRequest, ApplyResult, DashboardStats, DuplicateGroup,
    FileAnalysis, FileRecord, Operation, ReviewItem, ReviewStatus, RuleRecord,
    ScanOptions, ScanProgress, SearchResult, SuggestionSource, WatchedFolder,
};
use crate::core::watcher::FolderWatcher;
use crate::db::Database;
use crate::fs::ops::{execute_move, join_under_root, plan_move, undo_batch, undo_operation};

pub const SCAN_PROGRESS_EVENT: &str = "scan://progress";
pub const WATCH_FOLDER_EVENT: &str = "watch://indexed";

pub struct AppState {
    pub db: Database,
    pub cancel: Mutex<Option<CancelFlag>>,
    pub watcher: Arc<FolderWatcher>,
    pub last_root: Arc<Mutex<PathBuf>>,
    pub scanning: Arc<AtomicBool>,
    pub local_model: LocalModelManager,
    pub local_service: LocalServiceManager,
}

impl AppState {
    pub fn new(db: Database, resource_dir: PathBuf) -> Self {
        Self {
            db,
            cancel: Mutex::new(None),
            watcher: Arc::new(FolderWatcher::new()),
            last_root: Arc::new(Mutex::new(PathBuf::new())),
            scanning: Arc::new(AtomicBool::new(false)),
            local_model: LocalModelManager::new(resource_dir.clone()),
            local_service: LocalServiceManager::new(resource_dir),
        }
    }
}

#[tauri::command]
pub fn get_local_model_status(state: State<'_, AppState>) -> LocalModelStatus {
    state.local_model.status()
}

#[tauri::command]
pub fn start_local_model(state: State<'_, AppState>) -> Result<LocalModelStatus, String> {
    start_bundled_stack(&state).map_err(Into::into)
}

pub fn start_bundled_stack(state: &AppState) -> Result<LocalModelStatus, AppError> {
    state.local_service.start()?;
    let status = state.local_model.start().map_err(AppError::from)?;
    let endpoint = status
        .endpoint
        .as_deref()
        .ok_or_else(|| AppError::AiService("local model did not expose an endpoint".into()))?;
    let model_name = status
        .model_name
        .as_deref()
        .ok_or_else(|| AppError::AiService("local model did not report its name".into()))?;
    let mut settings = state.db.get_settings().map_err(AppError::from)?;
    settings.ai_service_url = "http://127.0.0.1:8010".into();
    state.db.save_settings(&settings).map_err(AppError::from)?;
    AiClient::new(&settings.ai_service_url)
        .and_then(|client| client.configure_local_model(&format!("{endpoint}/v1"), model_name))
        .map_err(AppError::from)?;
    Ok(status)
}

pub fn start_bundled_stack_from_paths(
    service: LocalServiceManager,
    model: LocalModelManager,
    db_path: PathBuf,
) {
    if service.start().is_err() {
        return;
    }
    let Ok(status) = model.start() else {
        return;
    };
    let (Some(endpoint), Some(model_name)) = (status.endpoint, status.model_name) else {
        return;
    };
    let Ok(db) = Database::open(&db_path) else {
        return;
    };
    let mut settings = db.get_settings().unwrap_or_default();
    settings.ai_service_url = "http://127.0.0.1:8010".into();
    if db.save_settings(&settings).is_ok() {
        let _ = AiClient::new(&settings.ai_service_url)
            .and_then(|client| client.configure_local_model(&format!("{endpoint}/v1"), &model_name));
    }
}

#[tauri::command]
pub fn stop_local_model(state: State<'_, AppState>) {
    state.local_model.stop();
    state.local_service.stop();
    if let Ok(settings) = state.db.get_settings() {
        if let Ok(client) = AiClient::new(&settings.ai_service_url) {
            let _ = client.disable_local_model();
        }
    }
}

#[tauri::command]
pub fn get_category_tree() -> serde_json::Value {
    serde_json::to_value(tree()).unwrap_or_else(|_| serde_json::json!({}))
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    state.db.stats().map_err(Into::into)
}

#[tauri::command]
pub fn list_files(state: State<'_, AppState>, limit: Option<i64>) -> Result<Vec<FileRecord>, String> {
    state.db.list_files(limit.unwrap_or(500)).map_err(Into::into)
}

#[tauri::command]
pub fn list_review_items(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<ReviewItem>, String> {
    let filter = match status.as_deref() {
        None | Some("all") => None,
        Some(other) => Some(ReviewStatus::parse(other).as_str()),
    };
    let rows = state.db.list_review_items(filter, 500).map_err(AppError::from)?;
    Ok(rows
        .into_iter()
        .map(|(file, analysis)| ReviewItem { file, analysis })
        .collect())
}

#[tauri::command]
pub fn update_analysis(
    state: State<'_, AppState>,
    analysis_id: String,
    patch: serde_json::Value,
) -> Result<FileAnalysis, String> {
    let existing = state
        .db
        .get_analysis(&analysis_id)
        .map_err(AppError::from)?
        .ok_or_else(|| "analysis not found".to_string())?;
    let category = patch
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or(&existing.category);
    let subcategory = patch
        .get("subcategory")
        .and_then(|v| v.as_str())
        .or(existing.subcategory.as_deref());
    let (cat, sub) = normalize(category, subcategory);
    let filename = patch
        .get("suggestedFilename")
        .and_then(|v| v.as_str())
        .or(existing.suggested_filename.as_deref())
        .unwrap_or("untitled");
    let sanitized = sanitize_filename(filename);
    let folder = suggested_folder(&cat, Some(&sub));
    state
        .db
        .update_analysis(&analysis_id, &cat, &sub, &sanitized, &folder)
        .map_err(AppError::from)?;
    state
        .db
        .get_analysis(&analysis_id)
        .map_err(AppError::from)?
        .ok_or_else(|| "analysis not found after update".into())
}

#[tauri::command]
pub fn set_review_status(
    state: State<'_, AppState>,
    analysis_ids: Vec<String>,
    status: String,
) -> Result<usize, String> {
    let parsed = ReviewStatus::parse(&status);
    state
        .db
        .set_review_status(&analysis_ids, parsed.as_str())
        .map_err(Into::into)
}

#[tauri::command]
pub fn start_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    options: ScanOptions,
) -> Result<serde_json::Value, String> {
    if state
        .scanning
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::ScanInProgress.into());
    }

    let session_id = new_id();
    let cancel = new_cancel_flag();
    let settings = state.db.get_settings().unwrap_or_default();
    *state.cancel.lock().map_err(|_| "lock".to_string())? = Some(Arc::clone(&cancel));
    *state.last_root.lock().map_err(|_| "lock".to_string())? = PathBuf::from(&options.root_path);

    if let Err(error) = state
        .db
        .insert_scan_session(&session_id, &options.root_path)
        .map_err(AppError::from)
    {
        state.scanning.store(false, Ordering::SeqCst);
        return Err(error.into());
    }

    let config = ScanConfig {
        root: PathBuf::from(&options.root_path),
        recursive: options.recursive,
        compute_hashes: options.compute_hashes,
        ignore_names: if options.ignore_globs.is_empty() {
            crate::core::scanner::DEFAULT_IGNORES
                .iter()
                .map(|s| (*s).to_string())
                .collect()
        } else {
            options.ignore_globs.clone()
        },
        max_file_size_for_hashing: settings.max_file_size_for_hashing,
    };

    let db_path = state.db.path().to_path_buf();
    let session_for_thread = session_id.clone();
    let analyze = options.analyze && settings.auto_analyze_after_scan;
    let handle = app.clone();
    let scanning = Arc::clone(&state.scanning);

    std::thread::spawn(move || {
        let emit = |progress: ScanProgress| {
            let _ = handle.emit(SCAN_PROGRESS_EVENT, progress);
        };
        match scan_folder(&config, &session_for_thread, &cancel, &emit) {
            Ok(outcome) => {
                if let Ok(db) = Database::open(&db_path) {
                    let mut indexed_files = outcome.files.clone();
                    for file in &mut indexed_files {
                        if let Ok(id) = db.upsert_file(file) {
                            file.id = id;
                        }
                    }
                    if analyze {
                        let _ = analyze_files(&db, &indexed_files, &handle, &session_for_thread);
                    }
                    let status = if cancel.load(Ordering::Relaxed) {
                        "cancelled"
                    } else {
                        "completed"
                    };
                    let _ = db.finish_scan_session(
                        &session_for_thread,
                        status,
                        outcome.files.len() as u64,
                        outcome.skipped,
                        outcome.bytes,
                    );
                }
            }
            Err(err) => {
                emit(ScanProgress {
                    session_id: session_for_thread.clone(),
                    phase: "failed".into(),
                    root_path: config.root.to_string_lossy().into_owned(),
                    files_found: 0,
                    files_skipped: 0,
                    bytes_scanned: 0,
                    current_path: None,
                    message: Some(err.to_string()),
                });
                if let Ok(db) = Database::open(&db_path) {
                    let _ = db.finish_scan_session(&session_for_thread, "failed", 0, 0, 0);
                }
            }
        }
        scanning.store(false, Ordering::SeqCst);
    });

    Ok(serde_json::json!({ "sessionId": session_id }))
}

fn analyze_files(
    db: &Database,
    files: &[FileRecord],
    handle: &AppHandle,
    session_id: &str,
) -> Result<(), AppError> {
    let settings = db.get_settings().unwrap_or_default();
    let client = AiClient::new(&settings.ai_service_url).ok();
    for (index, file) in files.iter().enumerate() {
        let _ = handle.emit(
            SCAN_PROGRESS_EVENT,
            ScanProgress {
                session_id: session_id.to_string(),
                phase: "analyzing".into(),
                root_path: String::new(),
                files_found: files.len() as u64,
                files_skipped: 0,
                bytes_scanned: 0,
                current_path: Some(file.path.clone()),
                message: Some(format!("Analyzing {}/{}", index + 1, files.len())),
            },
        );
        if db
            .has_analysis_for_hash(&file.id, file.sha256.as_deref())
            .unwrap_or(false)
        {
            continue;
        }
        let analysis = classify_file(db, file, client.as_ref(), &settings);
        if let Ok((analysis, content)) = analysis {
            let _ = db.insert_analysis(&analysis, file.sha256.as_deref());
            if !content.is_empty() {
                if let Some(client) = client.as_ref() {
                    if let Ok(response) = client.embed(&content) {
                        if let Some(vector) = response.embeddings.into_iter().next() {
                            let _ = db.upsert_embedding(
                                &file.id,
                                &response.model_name,
                                &vector,
                                file.sha256.as_deref(),
                            );
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn classify_file(
    _db: &Database,
    file: &FileRecord,
    client: Option<&AiClient>,
    _settings: &AppSettings,
) -> Result<(FileAnalysis, String), AppError> {
    let now = now_iso();
    let extracted = if let Some(client) = client {
        client
            .extract(
                &file.path,
                file.mime_type.as_deref().unwrap_or(""),
                file.extension.as_deref(),
            )
            .unwrap_or(crate::ai::client::ExtractResponse {
                text: String::new(),
                extraction_method: "unavailable".into(),
            })
    } else {
        crate::ai::client::ExtractResponse {
            text: String::new(),
            extraction_method: "unavailable".into(),
        }
    };
    let content = extracted.text;

    let classified = if let Some(client) = client {
        client
            .analyze(&AnalyzeRequest {
                filename: file.name.clone(),
                mime_type: file.mime_type.clone().unwrap_or_else(|| "application/octet-stream".into()),
                content: content.clone(),
                extension: file.extension.clone(),
            })
            .ok()
    } else {
        None
    };

    let (category, subcategory, filename, tags, summary, confidence, source, model) =
        if let Some(resp) = classified {
            let (cat, sub) = normalize(&resp.category, resp.subcategory.as_deref());
            (
                cat,
                sub,
                sanitize_filename(&resp.suggested_filename),
                resp.tags,
                resp.summary,
                resp.confidence,
                SuggestionSource::parse(&resp.source),
                resp.model_name,
            )
        } else {
            let (cat, sub) = normalize("Other", Some("Unknown"));
            (
                cat,
                sub,
                sanitize_filename(&file.name),
                Vec::new(),
                String::new(),
                0.2,
                SuggestionSource::Fallback,
                Some("offline".into()),
            )
        };

    Ok((FileAnalysis {
        id: new_id(),
        file_id: file.id.clone(),
        suggested_folder: Some(suggested_folder(&category, Some(&subcategory))),
        category,
        subcategory: Some(subcategory),
        summary: if summary.is_empty() { None } else { Some(summary) },
        tags,
        suggested_filename: Some(filename),
        confidence,
        source,
        model_name: model,
        extraction_method: Some(extracted.extraction_method),
        review_status: ReviewStatus::Pending,
        created_at: now.clone(),
        updated_at: now,
    }, content))
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> Result<(), String> {
    if let Ok(guard) = state.cancel.lock() {
        if let Some(flag) = guard.as_ref() {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn apply_changes(
    state: State<'_, AppState>,
    requests: Vec<ApplyRequest>,
) -> Result<ApplyResult, String> {
    let root = state
        .last_root
        .lock()
        .map_err(|_| "lock".to_string())?
        .clone();
    let root = if root.as_os_str().is_empty() {
        // Fall back to the parent of the first file.
        if let Some(first) = requests.first() {
            if let Ok(Some(file)) = state.db.get_file(&first.file_id) {
                PathBuf::from(&file.path)
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| PathBuf::from("."))
            } else {
                PathBuf::from(".")
            }
        } else {
            PathBuf::from(".")
        }
    } else {
        root
    };

    let batch_id = new_id();
    let mut operations = Vec::new();
    let mut completed = 0usize;
    let mut failed = 0usize;
    let mut occupied_paths: Vec<PathBuf> = state
        .db
        .list_files(10_000)
        .unwrap_or_default()
        .into_iter()
        .map(|f| PathBuf::from(f.path))
        .collect();

    for request in &requests {
        let file = match state.db.get_file(&request.file_id) {
            Ok(Some(f)) => f,
            _ => {
                failed += 1;
                continue;
            }
        };
        if validate_target_folder(&request.target_folder).is_err() {
            failed += 1;
            continue;
        }
        let source = PathBuf::from(&file.path);
        let mut occupied = |path: &std::path::Path| occupied_paths.iter().any(|p| p == path) || path.exists();
        match plan_move(
            &root,
            &file.id,
            &source,
            &file.name,
            &request.target_folder,
            &request.target_filename,
            &mut occupied,
        ) {
            Ok(planned) => {
                occupied_paths.push(planned.new_path.clone());
                match execute_move(&state.db, &planned, &batch_id) {
                    Ok(op) => {
                        completed += 1;
                        if let Ok(Some(analysis)) = state.db.latest_analysis(&file.id) {
                            let _ = state.db.set_review_status(
                                &[analysis.id],
                                ReviewStatus::Approved.as_str(),
                            );
                        }
                        operations.push(op);
                    }
                    Err(_) => failed += 1,
                }
            }
            Err(_) => failed += 1,
        }
    }

    Ok(ApplyResult {
        batch_id,
        planned: requests.len(),
        completed,
        failed,
        operations,
    })
}

#[tauri::command]
pub fn list_operations(state: State<'_, AppState>, limit: Option<i64>) -> Result<Vec<Operation>, String> {
    state.db.list_operations(limit.unwrap_or(200)).map_err(Into::into)
}

#[tauri::command(rename = "undo_batch")]
pub fn undo_batch_cmd(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<serde_json::Value, String> {
    let (undone, conflicts) = undo_batch(&state.db, &batch_id).map_err(AppError::from)?;
    Ok(serde_json::json!({ "undone": undone, "conflicts": conflicts }))
}

#[tauri::command(rename = "undo_operation")]
pub fn undo_operation_cmd(state: State<'_, AppState>, operation_id: String) -> Result<(), String> {
    let ops = state.db.list_operations(5_000).map_err(AppError::from)?;
    let op = ops
        .into_iter()
        .find(|o| o.id == operation_id)
        .ok_or_else(|| "operation not found".to_string())?;
    undo_operation(&state.db, &op).map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub fn find_duplicates(state: State<'_, AppState>) -> Result<Vec<DuplicateGroup>, String> {
    let groups = state.db.find_duplicates().map_err(AppError::from)?;
    Ok(groups
        .into_iter()
        .filter_map(|(sha, files)| {
            let keep = files.first()?.clone();
            let duplicates = files[1..].to_vec();
            if duplicates.is_empty() {
                return None;
            }
            Some(DuplicateGroup {
                sha256: sha,
                size: keep.size,
                wasted_bytes: keep.size * duplicates.len() as i64,
                keep,
                duplicates,
            })
        })
        .collect())
}

#[tauri::command]
pub fn semantic_search(state: State<'_, AppState>, query: String) -> Result<Vec<SearchResult>, String> {
    let settings = state.db.get_settings().map_err(AppError::from)?;
    let client = AiClient::new(&settings.ai_service_url).map_err(AppError::from)?;
    let response = client.embed(&query).map_err(AppError::from)?;
    let vector = response
        .embeddings
        .first()
        .ok_or_else(|| "local embedding service returned no vector".to_string())?;
    let rows = state.db.vector_search(vector, 50).map_err(AppError::from)?;
    Ok(rows
        .into_iter()
        .map(|(file, analysis, score)| SearchResult {
            file,
            analysis,
            score,
            matched_on: "semantic".into(),
        })
        .collect())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.get_settings().map_err(Into::into)
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> Result<AppSettings, String> {
    let mut current = state.db.get_settings().map_err(AppError::from)?;
    if let Some(url) = patch.get("aiServiceUrl").and_then(|v| v.as_str()) {
        crate::ai::client::AiClient::new(url).map_err(AppError::from)?;
        current.ai_service_url = url.to_string();
    }
    if let Some(model) = patch.get("llmModel").and_then(|v| v.as_str()) {
        current.llm_model = model.to_string();
    }
    if let Some(model) = patch.get("embeddingModel").and_then(|v| v.as_str()) {
        current.embedding_model = model.to_string();
    }
    if let Some(flag) = patch.get("autoAnalyzeAfterScan").and_then(|v| v.as_bool()) {
        current.auto_analyze_after_scan = flag;
    }
    if let Some(arr) = patch.get("ignoreGlobs").and_then(|v| v.as_array()) {
        current.ignore_globs = arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
    }
    state.db.save_settings(&current).map_err(AppError::from)?;
    Ok(current)
}

#[tauri::command]
pub fn list_rules(state: State<'_, AppState>) -> Result<Vec<RuleRecord>, String> {
    state.db.list_rules().map_err(Into::into)
}

#[tauri::command]
pub fn update_rule(
    state: State<'_, AppState>,
    rule_id: String,
    patch: serde_json::Value,
) -> Result<RuleRecord, String> {
    if let Some(enabled) = patch.get("enabled").and_then(|v| v.as_bool()) {
        state
            .db
            .update_rule_enabled(&rule_id, enabled)
            .map_err(AppError::from)?;
    }
    let rules = state.db.list_rules().map_err(AppError::from)?;
    rules
        .into_iter()
        .find(|r| r.id == rule_id)
        .ok_or_else(|| "rule not found".into())
}

#[tauri::command]
pub fn list_watched_folders(state: State<'_, AppState>) -> Result<Vec<WatchedFolder>, String> {
    state.db.list_watched_folders().map_err(Into::into)
}

#[tauri::command]
pub fn toggle_watched_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
    enabled: bool,
) -> Result<WatchedFolder, String> {
    state
        .db
        .toggle_watched_folder(&folder_id, enabled)
        .map_err(AppError::from)?;
    restart_watcher(&app, &state)?;
    let folders = state.db.list_watched_folders().map_err(AppError::from)?;
    folders
        .into_iter()
        .find(|f| f.id == folder_id)
        .ok_or_else(|| "folder not found".into())
}

#[tauri::command]
pub fn add_watched_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<WatchedFolder, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "Watched folder must exist and be accessible".to_string())?;
    if !path.is_dir() {
        return Err("Watched path must be a folder".into());
    }
    if let Some(mut existing) = state
        .db
        .list_watched_folders()
        .map_err(AppError::from)?
        .into_iter()
        .find(|folder| PathBuf::from(&folder.path) == path)
    {
        state
            .db
            .toggle_watched_folder(&existing.id, true)
            .map_err(AppError::from)?;
        existing.enabled = true;
        restart_watcher(&app, &state)?;
        return Ok(existing);
    }
    let folder = WatchedFolder {
        id: new_id(),
        path: path.to_string_lossy().into_owned(),
        enabled: true,
        auto_analyze: true,
        auto_apply: false,
    };
    state.db.add_watched_folder(&folder).map_err(AppError::from)?;
    restart_watcher(&app, &state)?;
    Ok(folder)
}

/// Rebuild the native watcher after configuration changes or app startup.
pub fn restart_watcher(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let folders: Vec<(PathBuf, bool)> = state
        .db
        .list_watched_folders()
        .map_err(AppError::from)?
        .into_iter()
        .filter(|folder| folder.enabled)
        .filter_map(|folder| {
            let path = PathBuf::from(folder.path);
            path.is_dir().then_some((path, folder.auto_analyze))
        })
        .collect();
    let watched_paths = folders.iter().map(|(path, _)| path.clone()).collect();
    let db_path = state.db.path().to_path_buf();
    let handle = app.clone();
    let last_root = Arc::clone(&state.last_root);

    state.watcher.start(watched_paths, move |path| {
        if !path.is_file() {
            return;
        }
        let Some((root, auto_analyze)) = folders
            .iter()
            .filter(|(root, _)| path.starts_with(root))
            .max_by_key(|(root, _)| root.components().count())
            .cloned()
        else {
            return;
        };
        let db_path = db_path.clone();
        let handle = handle.clone();
        let last_root = Arc::clone(&last_root);
        std::thread::spawn(move || {
            index_watched_file(db_path, root, path, auto_analyze, last_root, handle);
        });
    })
}

fn index_watched_file(
    db_path: PathBuf,
    root: PathBuf,
    path: PathBuf,
    auto_analyze: bool,
    last_root: Arc<Mutex<PathBuf>>,
    handle: AppHandle,
) {
    let Ok(db) = Database::open(&db_path) else {
        return;
    };
    let settings = db.get_settings().unwrap_or_default();
    let session_id = new_id();
    let _ = db.insert_scan_session(&session_id, &root.to_string_lossy());
    let cancel = AtomicBool::new(false);
    let config = ScanConfig {
        root: path,
        recursive: false,
        compute_hashes: true,
        ignore_names: settings.ignore_globs,
        max_file_size_for_hashing: settings.max_file_size_for_hashing,
    };
    let emit = |progress: ScanProgress| {
        let _ = handle.emit(SCAN_PROGRESS_EVENT, progress);
    };
    let Ok(outcome) = scan_folder(&config, &session_id, &cancel, &emit) else {
        let _ = db.finish_scan_session(&session_id, "failed", 0, 0, 0);
        return;
    };
    let mut files = outcome.files;
    for file in &mut files {
        if let Ok(id) = db.upsert_file(file) {
            file.id = id;
        }
    }
    if auto_analyze {
        let _ = analyze_files(&db, &files, &handle, &session_id);
    }
    let _ = db.finish_scan_session(
        &session_id,
        "completed",
        files.len() as u64,
        outcome.skipped,
        outcome.bytes,
    );
    if !files.is_empty() {
        if let Ok(mut current_root) = last_root.lock() {
            *current_root = root;
        }
        let _ = handle.emit(WATCH_FOLDER_EVENT, files.len());
    }
}

// Silence unused import of join_under_root in non-test builds; it is part of the public API.
#[allow(dead_code)]
fn _keep_join() {
    let _ = join_under_root;
}

