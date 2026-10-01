//! SQLite access layer. All SQL lives here so command handlers stay thin.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::core::error::{AppError, AppResult};
use crate::core::types::{
    new_id, now_iso, AppSettings, DashboardStats, FileAnalysis, FileRecord, FileStatus, Operation,
    OperationStatus, OperationType, ReviewStatus, RuleRecord, SuggestionSource, WatchedFolder,
};

const SCHEMA: &str = include_str!("../../schema.sql");

pub struct Database {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        seed_builtin_rules(&conn)?;
        seed_default_settings(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path: path.to_path_buf(),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn lock(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Message("database lock poisoned".into()))
    }

    pub fn upsert_file(&self, file: &FileRecord) -> AppResult<String> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO files (id, path, name, extension, mime_type, size, created_at, modified_at, sha256, status, scan_session_id, is_ignored, indexed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
             ON CONFLICT(path) DO UPDATE SET
                name=excluded.name, extension=excluded.extension, mime_type=excluded.mime_type,
                size=excluded.size, modified_at=excluded.modified_at, sha256=excluded.sha256,
                status=excluded.status, scan_session_id=excluded.scan_session_id, updated_at=excluded.updated_at",
            params![
                file.id,
                file.path,
                file.name,
                file.extension,
                file.mime_type,
                file.size,
                file.created_at,
                file.modified_at,
                file.sha256,
                file.status.as_str(),
                file.scan_session_id,
                file.is_ignored as i64,
                now_iso(),
            ],
        )?;
        conn.query_row("SELECT id FROM files WHERE path = ?1", [&file.path], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn get_file(&self, id: &str) -> AppResult<Option<FileRecord>> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT id, path, name, extension, mime_type, size, created_at, modified_at, sha256, status, is_ignored, scan_session_id FROM files WHERE id = ?1",
            [id],
            row_to_file,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_files(&self, limit: i64) -> AppResult<Vec<FileRecord>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, path, name, extension, mime_type, size, created_at, modified_at, sha256, status, is_ignored, scan_session_id
             FROM files ORDER BY name LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], row_to_file)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn insert_analysis(&self, analysis: &FileAnalysis, content_hash: Option<&str>) -> AppResult<()> {
        let conn = self.lock()?;
        let tags = serde_json::to_string(&analysis.tags).unwrap_or_else(|_| "[]".into());
        conn.execute(
            "INSERT INTO file_analysis (id, file_id, category, subcategory, summary, tags, suggested_filename, suggested_folder, confidence, source, model_name, extraction_method, content_hash, reviewed, review_status, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,0,?14,?15,?16)",
            params![
                analysis.id,
                analysis.file_id,
                analysis.category,
                analysis.subcategory,
                analysis.summary,
                tags,
                analysis.suggested_filename,
                analysis.suggested_folder,
                analysis.confidence,
                analysis.source.as_str(),
                analysis.model_name,
                analysis.extraction_method,
                content_hash,
                analysis.review_status.as_str(),
                analysis.created_at,
                analysis.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn has_analysis_for_hash(&self, file_id: &str, content_hash: Option<&str>) -> AppResult<bool> {
        let Some(content_hash) = content_hash else {
            return Ok(false);
        };
        let conn = self.lock()?;
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM file_analysis WHERE file_id = ?1 AND content_hash = ?2)",
            params![file_id, content_hash],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn upsert_embedding(
        &self,
        file_id: &str,
        model_name: &str,
        vector: &[f32],
        content_hash: Option<&str>,
    ) -> AppResult<()> {
        if vector.is_empty() {
            return Ok(());
        }
        let mut bytes = Vec::with_capacity(vector.len() * 4);
        for value in vector {
            bytes.extend(value.to_le_bytes());
        }
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO embeddings (id, file_id, model_name, dim, vector, content_hash, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(file_id, model_name) DO UPDATE SET dim=excluded.dim, vector=excluded.vector, content_hash=excluded.content_hash, created_at=excluded.created_at",
            params![new_id(), file_id, model_name, vector.len() as i64, bytes, content_hash, now_iso()],
        )?;
        Ok(())
    }

    pub fn vector_search(&self, query: &[f32], limit: usize) -> AppResult<Vec<(FileRecord, Option<FileAnalysis>, f64)>> {
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT f.id, f.path, f.name, f.extension, f.mime_type, f.size, f.created_at, f.modified_at, f.sha256, f.status, f.is_ignored, f.scan_session_id,
                    a.id, a.file_id, a.category, a.subcategory, a.summary, a.tags, a.suggested_filename, a.suggested_folder, a.confidence, a.source, a.model_name, a.extraction_method, a.review_status, a.created_at, a.updated_at,
                    e.vector, e.dim
             FROM embeddings e JOIN files f ON f.id = e.file_id
             LEFT JOIN file_analysis a ON a.id = (SELECT id FROM file_analysis WHERE file_id = f.id ORDER BY created_at DESC, id DESC LIMIT 1)",
        )?;
        let rows = stmt.query_map([], |row| {
            let file = row_to_file(row)?;
            let analysis = match row.get::<_, Option<String>>(12)? {
                Some(_) => Some(row_to_analysis_offset(row, 12)?),
                None => None,
            };
            let bytes: Vec<u8> = row.get(27)?;
            let dim: usize = row.get::<_, i64>(28)? as usize;
            Ok((file, analysis, bytes, dim))
        })?;
        let mut results = rows
            .filter_map(|row| row.ok())
            .filter_map(|(file, analysis, bytes, dim)| {
                decode_vector(&bytes, dim).map(|vector| (file, analysis, cosine_similarity(query, &vector)))
            })
            .collect::<Vec<_>>();
        results.sort_by(|a, b| b.2.total_cmp(&a.2));
        results.truncate(limit);
        Ok(results)
    }

    pub fn latest_analysis(&self, file_id: &str) -> AppResult<Option<FileAnalysis>> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT id, file_id, category, subcategory, summary, tags, suggested_filename, suggested_folder, confidence, source, model_name, extraction_method, review_status, created_at, updated_at
             FROM file_analysis WHERE file_id = ?1 ORDER BY created_at DESC LIMIT 1",
            [file_id],
            row_to_analysis,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn get_analysis(&self, id: &str) -> AppResult<Option<FileAnalysis>> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT id, file_id, category, subcategory, summary, tags, suggested_filename, suggested_folder, confidence, source, model_name, extraction_method, review_status, created_at, updated_at
             FROM file_analysis WHERE id = ?1",
            [id],
            row_to_analysis,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_review_items(&self, status: Option<&str>, limit: i64) -> AppResult<Vec<(FileRecord, FileAnalysis)>> {
        let conn = self.lock()?;
        let sql = if let Some(status) = status {
            format!(
                "SELECT f.id, f.path, f.name, f.extension, f.mime_type, f.size, f.created_at, f.modified_at, f.sha256, f.status, f.is_ignored, f.scan_session_id,
                        a.id, a.file_id, a.category, a.subcategory, a.summary, a.tags, a.suggested_filename, a.suggested_folder, a.confidence, a.source, a.model_name, a.extraction_method, a.review_status, a.created_at, a.updated_at
                 FROM file_analysis a JOIN files f ON f.id = a.file_id
                 WHERE a.review_status = '{status}'
                 ORDER BY a.confidence DESC LIMIT {limit}"
            )
        } else {
            format!(
                "SELECT f.id, f.path, f.name, f.extension, f.mime_type, f.size, f.created_at, f.modified_at, f.sha256, f.status, f.is_ignored, f.scan_session_id,
                        a.id, a.file_id, a.category, a.subcategory, a.summary, a.tags, a.suggested_filename, a.suggested_folder, a.confidence, a.source, a.model_name, a.extraction_method, a.review_status, a.created_at, a.updated_at
                 FROM file_analysis a JOIN files f ON f.id = a.file_id
                 ORDER BY a.confidence DESC LIMIT {limit}"
            )
        };
        // status is already constrained to the ReviewStatus enum by the caller.
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok((row_to_file(row)?, row_to_analysis_offset(row, 12)?))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn update_analysis(
        &self,
        id: &str,
        category: &str,
        subcategory: &str,
        suggested_filename: &str,
        suggested_folder: &str,
    ) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE file_analysis SET category=?2, subcategory=?3, suggested_filename=?4, suggested_folder=?5, source='manual', review_status='edited', updated_at=?6 WHERE id=?1",
            params![id, category, subcategory, suggested_filename, suggested_folder, now_iso()],
        )?;
        Ok(())
    }

    pub fn set_review_status(&self, ids: &[String], status: &str) -> AppResult<usize> {
        let conn = self.lock()?;
        let now = now_iso();
        let mut count = 0usize;
        for id in ids {
            count += conn.execute(
                "UPDATE file_analysis SET review_status=?2, updated_at=?3 WHERE id=?1",
                params![id, status, now],
            )?;
        }
        Ok(count)
    }

    pub fn insert_operation(&self, op: &Operation) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO operations (id, file_id, batch_id, operation_type, old_path, new_path, status, error, created_at, executed_at, undone_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                op.id,
                op.file_id,
                op.batch_id,
                op.operation_type.as_str(),
                op.old_path,
                op.new_path,
                op.status.as_str(),
                op.error,
                op.created_at,
                op.executed_at,
                op.undone_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_operation_status(
        &self,
        id: &str,
        status: OperationStatus,
        error: Option<&str>,
        executed_at: Option<&str>,
        undone_at: Option<&str>,
    ) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE operations SET status=?2, error=?3, executed_at=COALESCE(?4, executed_at), undone_at=COALESCE(?5, undone_at) WHERE id=?1",
            params![id, status.as_str(), error, executed_at, undone_at],
        )?;
        Ok(())
    }

    pub fn list_operations(&self, limit: i64) -> AppResult<Vec<Operation>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_id, batch_id, operation_type, old_path, new_path, status, error, created_at, executed_at, undone_at
             FROM operations ORDER BY created_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], row_to_operation)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn operations_in_batch(&self, batch_id: &str) -> AppResult<Vec<Operation>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_id, batch_id, operation_type, old_path, new_path, status, error, created_at, executed_at, undone_at
             FROM operations WHERE batch_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([batch_id], row_to_operation)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn update_file_path(&self, id: &str, new_path: &str, new_name: &str) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE files SET path=?2, name=?3, updated_at=?4 WHERE id=?1",
            params![id, new_path, new_name, now_iso()],
        )?;
        Ok(())
    }

    pub fn find_duplicates(&self) -> AppResult<Vec<(String, Vec<FileRecord>)>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT sha256 FROM files WHERE sha256 IS NOT NULL AND sha256 != '' GROUP BY sha256 HAVING COUNT(*) > 1",
        )?;
        let hashes: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        let mut groups = Vec::new();
        for hash in hashes {
            let mut inner = conn.prepare(
                "SELECT id, path, name, extension, mime_type, size, created_at, modified_at, sha256, status, is_ignored, scan_session_id
                 FROM files WHERE sha256 = ?1 ORDER BY created_at ASC, length(path) ASC",
            )?;
            let files: Vec<FileRecord> = inner
                .query_map([&hash], row_to_file)?
                .filter_map(|r| r.ok())
                .collect();
            groups.push((hash, files));
        }
        Ok(groups)
    }

    pub fn stats(&self) -> AppResult<DashboardStats> {
        let conn = self.lock()?;
        let indexed_files: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))?;
        let pending_reviews: i64 = conn.query_row(
            "SELECT COUNT(*) FROM file_analysis WHERE review_status = 'pending'",
            [],
            |r| r.get(0),
        )?;
        let scanned_bytes: i64 = conn.query_row("SELECT COALESCE(SUM(size),0) FROM files", [], |r| r.get(0))?;
        let analyzed_files: i64 = conn.query_row("SELECT COUNT(*) FROM file_analysis", [], |r| r.get(0))?;
        let operations_applied: i64 = conn.query_row(
            "SELECT COUNT(*) FROM operations WHERE status = 'completed'",
            [],
            |r| r.get(0),
        )?;
        let watched_folders: i64 = conn.query_row(
            "SELECT COUNT(*) FROM watched_folders WHERE enabled = 1",
            [],
            |r| r.get(0),
        )?;
        let duplicate_groups: i64 = conn.query_row(
            "SELECT COUNT(*) FROM (SELECT sha256 FROM files WHERE sha256 IS NOT NULL AND sha256 != '' GROUP BY sha256 HAVING COUNT(*) > 1)",
            [],
            |r| r.get(0),
        )?;
        let duplicate_wasted_bytes: i64 = conn.query_row(
            "SELECT COALESCE(SUM((cnt-1)*size),0) FROM (
                SELECT sha256, COUNT(*) AS cnt, MAX(size) AS size FROM files
                WHERE sha256 IS NOT NULL AND sha256 != '' GROUP BY sha256 HAVING COUNT(*) > 1
             )",
            [],
            |r| r.get(0),
        )?;
        Ok(DashboardStats {
            indexed_files,
            pending_reviews,
            duplicate_groups,
            duplicate_wasted_bytes,
            scanned_bytes,
            analyzed_files,
            operations_applied,
            watched_folders,
        })
    }

    pub fn list_rules(&self) -> AppResult<Vec<RuleRecord>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, priority, enabled, match_type, pattern, category, subcategory, is_builtin FROM rules ORDER BY priority ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(RuleRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                priority: row.get(2)?,
                enabled: row.get::<_, i64>(3)? != 0,
                match_type: row.get(4)?,
                pattern: row.get(5)?,
                category: row.get(6)?,
                subcategory: row.get(7)?,
                is_builtin: row.get::<_, i64>(8)? != 0,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn update_rule_enabled(&self, id: &str, enabled: bool) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE rules SET enabled=?2, updated_at=?3 WHERE id=?1",
            params![id, enabled as i64, now_iso()],
        )?;
        Ok(())
    }

    pub fn get_settings(&self) -> AppResult<AppSettings> {
        let conn = self.lock()?;
        let json: Option<String> = conn
            .query_row("SELECT value FROM settings WHERE key = 'app'", [], |r| r.get(0))
            .optional()?;
        match json {
            Some(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<()> {
        let conn = self.lock()?;
        let json = serde_json::to_string(settings)?;
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ('app', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            params![json, now_iso()],
        )?;
        Ok(())
    }

    pub fn list_watched_folders(&self) -> AppResult<Vec<WatchedFolder>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, path, enabled, auto_analyze, auto_apply FROM watched_folders ORDER BY created_at",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WatchedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                enabled: row.get::<_, i64>(2)? != 0,
                auto_analyze: row.get::<_, i64>(3)? != 0,
                auto_apply: false,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn add_watched_folder(&self, folder: &WatchedFolder) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT OR IGNORE INTO watched_folders (id, path, enabled, auto_analyze, auto_apply, created_at) VALUES (?1,?2,?3,?4,0,?5)",
            params![folder.id, folder.path, folder.enabled as i64, folder.auto_analyze as i64, now_iso()],
        )?;
        Ok(())
    }

    pub fn toggle_watched_folder(&self, id: &str, enabled: bool) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE watched_folders SET enabled=?2 WHERE id=?1",
            params![id, enabled as i64],
        )?;
        Ok(())
    }

    pub fn insert_scan_session(&self, id: &str, root: &str) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO scan_sessions (id, root_path, status, started_at) VALUES (?1,?2,'running',?3)",
            params![id, root, now_iso()],
        )?;
        Ok(())
    }

    pub fn finish_scan_session(&self, id: &str, status: &str, found: u64, skipped: u64, bytes: u64) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE scan_sessions SET status=?2, files_found=?3, files_skipped=?4, bytes_scanned=?5, finished_at=?6 WHERE id=?1",
            params![id, status, found as i64, skipped as i64, bytes as i64, now_iso()],
        )?;
        Ok(())
    }

    pub fn keyword_search(&self, query: &str, limit: i64) -> AppResult<Vec<(FileRecord, Option<FileAnalysis>, f64)>> {
        let like = format!("%{}%", query.replace('%', "").replace('_', ""));
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT f.id, f.path, f.name, f.extension, f.mime_type, f.size, f.created_at, f.modified_at, f.sha256, f.status, f.is_ignored, f.scan_session_id,
                    a.id, a.file_id, a.category, a.subcategory, a.summary, a.tags, a.suggested_filename, a.suggested_folder, a.confidence, a.source, a.model_name, a.extraction_method, a.review_status, a.created_at, a.updated_at
             FROM files f LEFT JOIN file_analysis a ON a.file_id = f.id
             WHERE f.name LIKE ?1 OR COALESCE(a.summary,'') LIKE ?1 OR COALESCE(a.tags,'') LIKE ?1 OR COALESCE(a.category,'') LIKE ?1
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![like, limit], |row| {
            let file = row_to_file(row)?;
            let analysis = match row.get::<_, Option<String>>(12)? {
                Some(_) => Some(row_to_analysis_offset(row, 12)?),
                None => None,
            };
            Ok((file, analysis, 0.6f64))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }
}

fn row_to_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRecord> {
    Ok(FileRecord {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        extension: row.get(3)?,
        mime_type: row.get(4)?,
        size: row.get(5)?,
        created_at: row.get(6)?,
        modified_at: row.get(7)?,
        sha256: row.get(8)?,
        status: FileStatus::parse(&row.get::<_, String>(9)?),
        is_ignored: row.get::<_, i64>(10)? != 0,
        scan_session_id: row.get(11)?,
    })
}

fn decode_vector(bytes: &[u8], dim: usize) -> Option<Vec<f32>> {
    if dim == 0 || bytes.len() != dim.checked_mul(4)? {
        return None;
    }
    Some(
        bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte vector chunk")))
            .collect(),
    )
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f64 {
    if left.len() != right.len() || left.is_empty() {
        return 0.0;
    }
    let (dot, left_norm, right_norm) = left.iter().zip(right).fold(
        (0.0f64, 0.0f64, 0.0f64),
        |(dot, left_norm, right_norm), (a, b)| {
            let a = *a as f64;
            let b = *b as f64;
            (dot + a * b, left_norm + a * a, right_norm + b * b)
        },
    );
    let denominator = left_norm.sqrt() * right_norm.sqrt();
    if denominator > 0.0 { dot / denominator } else { 0.0 }
}

fn row_to_analysis(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileAnalysis> {
    row_to_analysis_offset(row, 0)
}

fn row_to_analysis_offset(row: &rusqlite::Row<'_>, o: usize) -> rusqlite::Result<FileAnalysis> {
    let tags_raw: Option<String> = row.get(o + 5)?;
    let tags: Vec<String> = tags_raw
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    Ok(FileAnalysis {
        id: row.get(o)?,
        file_id: row.get(o + 1)?,
        category: row.get(o + 2)?,
        subcategory: row.get(o + 3)?,
        summary: row.get(o + 4)?,
        tags,
        suggested_filename: row.get(o + 6)?,
        suggested_folder: row.get(o + 7)?,
        confidence: row.get(o + 8)?,
        source: SuggestionSource::parse(&row.get::<_, String>(o + 9)?),
        model_name: row.get(o + 10)?,
        extraction_method: row.get(o + 11)?,
        review_status: ReviewStatus::parse(&row.get::<_, String>(o + 12)?),
        created_at: row.get(o + 13)?,
        updated_at: row.get(o + 14)?,
    })
}

fn row_to_operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<Operation> {
    let kind: String = row.get(3)?;
    let op_type = match kind.as_str() {
        "move" => OperationType::Move,
        "rename" => OperationType::Rename,
        _ => OperationType::MoveAndRename,
    };
    Ok(Operation {
        id: row.get(0)?,
        file_id: row.get(1)?,
        batch_id: row.get(2)?,
        operation_type: op_type,
        old_path: row.get(4)?,
        new_path: row.get(5)?,
        status: OperationStatus::parse(&row.get::<_, String>(6)?),
        error: row.get(7)?,
        created_at: row.get(8)?,
        executed_at: row.get(9)?,
        undone_at: row.get(10)?,
    })
}

fn seed_builtin_rules(conn: &Connection) -> rusqlite::Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM rules", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let now = now_iso();
    let rules: &[(&str, &str, i64, &str, &str, &str, &str)] = &[
        ("r-screenshot", "Filename contains screenshot", 10, "filename_regex", r"(?i)screenshot|screen shot|snip", "Images", "Screenshots"),
        ("r-invoice", "Filename contains invoice", 20, "filename_regex", r"(?i)invoice|inv[-_]", "Finance", "Invoices"),
        ("r-statement", "Filename contains statement", 21, "filename_regex", r"(?i)statement", "Finance", "Statements"),
        ("r-receipt", "Filename contains receipt", 22, "filename_regex", r"(?i)receipt", "Finance", "Receipts"),
        ("r-tax", "Tax documents", 23, "filename_regex", r"(?i)\btax(es)?\b|1099|w-?2", "Finance", "Taxes"),
        ("r-resume", "Resume / CV", 30, "filename_regex", r"(?i)resume|\bcv\b|curriculum", "Personal", "Identity"),
        ("r-installer", "Windows installers", 40, "extension", "exe,msi,msix,dmg,pkg", "Software", "Installers"),
        ("r-archive", "Archives", 41, "extension", "zip,rar,7z,tar,gz,bz2,xz", "Archives", "Zip"),
        ("r-code", "Source code", 50, "extension", "py,rs,ts,tsx,js,jsx,go,java,c,cpp,h,cs,rb,php,sh", "Development", "Code"),
        ("r-docker", "Docker files", 51, "filename_regex", r"(?i)docker", "Development", "Configs"),
        ("r-markdown", "Markdown notes", 60, "extension", "md,markdown", "Documents", "Notes"),
        ("r-image", "Image files", 70, "mime", "image/*", "Images", "Photos"),
        ("r-pdf", "PDF documents", 80, "extension", "pdf", "Documents", "Reports"),
    ];
    for (id, name, prio, match_type, pattern, cat, sub) in rules {
        conn.execute(
            "INSERT INTO rules (id, name, priority, enabled, match_type, pattern, category, subcategory, is_builtin, created_at, updated_at)
             VALUES (?1,?2,?3,1,?4,?5,?6,?7,1,?8,?8)",
            params![id, name, prio, match_type, pattern, cat, sub, now],
        )?;
    }
    Ok(())
}

fn seed_default_settings(conn: &Connection) -> rusqlite::Result<()> {
    let exists: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key='app'", [], |r| r.get(0))
        .optional()?;
    if exists.is_some() {
        return Ok(());
    }
    let json = serde_json::to_string(&AppSettings::default()).unwrap_or_else(|_| "{}".into());
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('app', ?1, ?2)",
        params![json, now_iso()],
    )?;
    Ok(())
}
