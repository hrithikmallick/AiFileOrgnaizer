//! Recursive directory scanner with controlled concurrency, progress events
//! and a configurable ignore list. Inaccessible files are skipped, never panic.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use walkdir::WalkDir;

use crate::core::error::AppResult;
use crate::core::types::{datetime_to_iso, new_id, FileRecord, FileStatus, ScanProgress};
use crate::fs::detect::detect_file_type;
use crate::fs::hash::sha256_file;

pub const DEFAULT_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    "target",
    "dist",
    "build",
];

pub const MAX_CONCURRENT_HASHES: usize = 4;

#[derive(Debug, Clone)]
pub struct ScanConfig {
    pub root: PathBuf,
    pub recursive: bool,
    pub compute_hashes: bool,
    pub ignore_names: Vec<String>,
    pub max_file_size_for_hashing: u64,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            root: PathBuf::new(),
            recursive: true,
            compute_hashes: true,
            ignore_names: DEFAULT_IGNORES.iter().map(|s| (*s).to_string()).collect(),
            max_file_size_for_hashing: 512 * 1024 * 1024,
        }
    }
}

pub struct ScanOutcome {
    pub session_id: String,
    pub files: Vec<FileRecord>,
    pub skipped: u64,
    pub bytes: u64,
}

pub fn should_ignore(path: &Path, ignore_names: &[String]) -> bool {
    path.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        ignore_names.iter().any(|ignore| ignore == name.as_ref())
    })
}

/// A Git worktree is a complete project boundary, not merely an ignored `.git`
/// directory. It can be either a directory or a file (linked worktree).
fn is_git_project(path: &Path) -> bool {
    path.join(".git").exists()
}

fn is_inside_git_project(path: &Path) -> bool {
    let start = if path.is_dir() { path } else { path.parent().unwrap_or(path) };
    start.ancestors().any(is_git_project)
}

fn system_time_iso(time: std::io::Result<SystemTime>) -> Option<String> {
    let time = time.ok()?;
    let dt: DateTime<Utc> = DateTime::<Utc>::from(time);
    datetime_to_iso(Some(dt))
}

/// Walk `config.root`, collect metadata, optionally hash. `cancel` aborts the walk.
/// `on_progress` is invoked frequently so the UI stays alive.
pub fn scan_folder(
    config: &ScanConfig,
    session_id: &str,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(ScanProgress),
) -> AppResult<ScanOutcome> {
    let mut files = Vec::new();
    let skipped = AtomicU64::new(0);
    let bytes = AtomicU64::new(0);
    let found = AtomicU64::new(0);

    let mut walk = WalkDir::new(&config.root).follow_links(false);
    if !config.recursive {
        walk = walk.max_depth(1);
    }
    // Prune ignored directories and entire Git projects before WalkDir descends
    // into them. A project can contain documents, but none are organizer input.
    let walker = walk.into_iter().filter_entry(|entry| {
        !entry.file_type().is_dir()
            || (!should_ignore(entry.path(), &config.ignore_names) && !is_git_project(entry.path()))
    });

    let emit = |phase: &str, current: Option<String>, message: Option<String>| {
        on_progress(ScanProgress {
            session_id: session_id.to_string(),
            phase: phase.into(),
            root_path: config.root.to_string_lossy().into_owned(),
            files_found: found.load(Ordering::Relaxed),
            files_skipped: skipped.load(Ordering::Relaxed),
            bytes_scanned: bytes.load(Ordering::Relaxed),
            current_path: current,
            message,
        });
    };

    emit("scanning", None, Some("Walking directory tree".into()));

    if is_inside_git_project(&config.root) {
        skipped.store(1, Ordering::Relaxed);
        emit("done", None, Some("Skipped protected Git project".into()));
        return Ok(ScanOutcome {
            session_id: session_id.to_string(),
            files,
            skipped: skipped.load(Ordering::Relaxed),
            bytes: 0,
        });
    }

    for entry in walker {
        if cancel.load(Ordering::Relaxed) {
            emit("cancelled", None, Some("Scan cancelled by user".into()));
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                skipped.fetch_add(1, Ordering::Relaxed);
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if should_ignore(path, &config.ignore_names) {
            skipped.fetch_add(1, Ordering::Relaxed);
            continue;
        }
        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => {
                skipped.fetch_add(1, Ordering::Relaxed);
                continue;
            }
        };
        let size = metadata.len();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let extension = path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase());
        let detected = detect_file_type(path, extension.as_deref());

        found.fetch_add(1, Ordering::Relaxed);
        bytes.fetch_add(size, Ordering::Relaxed);

        files.push(FileRecord {
            id: new_id(),
            path: path.to_string_lossy().into_owned(),
            name,
            extension,
            mime_type: Some(detected.mime_type),
            size: size as i64,
            created_at: system_time_iso(metadata.created()),
            modified_at: system_time_iso(metadata.modified()),
            sha256: None,
            status: FileStatus::Indexed,
            is_ignored: false,
            scan_session_id: Some(session_id.to_string()),
        });

        if files.len() % 25 == 0 {
            emit(
                "scanning",
                Some(path.to_string_lossy().into_owned()),
                None,
            );
        }
    }

    if config.compute_hashes && !cancel.load(Ordering::Relaxed) {
        emit("hashing", None, Some("Computing SHA-256 with bounded workers".into()));
        let workers = MAX_CONCURRENT_HASHES.min(files.len()).max(1);
        let chunk_size = files.len().div_ceil(workers);
        std::thread::scope(|scope| {
            for chunk in files.chunks_mut(chunk_size) {
                scope.spawn(|| {
                    for file in chunk {
                        if file.size >= 0 && (file.size as u64) <= config.max_file_size_for_hashing {
                            file.sha256 = sha256_file(Path::new(&file.path)).ok();
                        }
                    }
                });
            }
        });
    }

    if !cancel.load(Ordering::Relaxed) {
        emit(
            "done",
            None,
            Some(format!("Scan complete: {} files", files.len())),
        );
    }

    Ok(ScanOutcome {
        session_id: session_id.to_string(),
        skipped: skipped.load(Ordering::Relaxed),
        bytes: bytes.load(Ordering::Relaxed),
        files,
    })
}

/// Shared cancel flag used by the live scan command.
pub type CancelFlag = Arc<AtomicBool>;

pub fn new_cancel_flag() -> CancelFlag {
    Arc::new(AtomicBool::new(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_every_file_in_a_git_project() {
        let root = std::env::temp_dir().join(format!("organizer-git-test-{}", std::process::id()));
        let project = root.join("aime_server");
        fs::create_dir_all(project.join(".git")).unwrap();
        fs::create_dir_all(project.join("docs")).unwrap();
        fs::write(project.join("billing.py"), "print('billing')").unwrap();
        fs::write(project.join("docs").join("guide.md"), "# guide").unwrap();
        fs::write(root.join("outside.txt"), "safe to scan").unwrap();

        let config = ScanConfig { root: root.clone(), compute_hashes: false, ..Default::default() };
        let cancelled = AtomicBool::new(false);
        let outcome = scan_folder(&config, "test", &cancelled, &|_| {}).unwrap();

        assert_eq!(outcome.files.len(), 1);
        assert_eq!(outcome.files[0].name, "outside.txt");
        fs::remove_dir_all(root).unwrap();
    }
}
