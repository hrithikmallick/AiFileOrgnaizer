//! Safe file operations. This is the only module allowed to move or rename
//! files. Python/AI never call into here.
//!
//! Every mutation follows:
//!   1. source exists
//!   2. destination is valid (no traversal, no absolute AI paths)
//!   3. destination is inside an allowed root
//!   4. destination does not already exist (never overwrite)
//!   5. record planned operation
//!   6. execute
//!   7. save result

use std::fs;
use std::path::{Path, PathBuf};

use crate::core::categories::validate_target_folder;
use crate::core::error::{AppError, AppResult};
use crate::core::filename::{preserve_extension, resolve_collision, sanitize_filename, validate_filename};
use crate::core::types::{now_iso, new_id, Operation, OperationStatus, OperationType};
use crate::db::Database;

pub struct PlannedMove {
    pub file_id: String,
    pub root: PathBuf,
    pub old_path: PathBuf,
    pub new_path: PathBuf,
    pub operation_type: OperationType,
}

/// Rejects path traversal (`..`) and empty components.
pub fn is_safe_relative(folder: &str) -> bool {
    validate_target_folder(folder).is_ok()
}

pub fn join_under_root(root: &Path, folder: &str, filename: &str) -> AppResult<PathBuf> {
    let (category, subcategory) = validate_target_folder(folder)?;
    validate_filename(filename)?;
    let dest = root.join(&category).join(&subcategory).join(filename);
    let canon_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    // Do not require dest to exist; check its parent after create.
    if let Ok(parent) = dest.parent().unwrap_or(&dest).canonicalize() {
        if !parent.starts_with(&canon_root) {
            return Err(AppError::PathNotAllowed(dest.display().to_string()));
        }
    }
    Ok(dest)
}

fn is_in_git_project(root: &Path, path: &Path) -> bool {
    let mut current = if path.is_dir() { Some(path) } else { path.parent() };
    while let Some(dir) = current {
        if dir.join(".git").exists() {
            return true;
        }
        if dir == root {
            break;
        }
        current = dir.parent();
    }
    false
}

pub fn plan_move(
    root: &Path,
    file_id: &str,
    source: &Path,
    original_name: &str,
    target_folder: &str,
    target_filename: &str,
    occupied: &mut dyn FnMut(&Path) -> bool,
) -> AppResult<PlannedMove> {
    if !source.exists() {
        return Err(AppError::SourceMissing(source.display().to_string()));
    }
    let canonical_root = root.canonicalize().map_err(AppError::from)?;
    let canonical_source = source.canonicalize().map_err(AppError::from)?;
    if !canonical_source.starts_with(&canonical_root) {
        return Err(AppError::PathNotAllowed(source.display().to_string()));
    }
    if is_in_git_project(&canonical_root, &canonical_source) {
        return Err(AppError::GitProjectProtected(source.display().to_string()));
    }
    let sanitized = preserve_extension(original_name, &sanitize_filename(target_filename));
    let initial_dest = join_under_root(&canonical_root, target_folder, &sanitized)?;
    let dest_dir_parent = initial_dest
        .parent()
        .ok_or_else(|| AppError::PathNotAllowed(initial_dest.display().to_string()))?;

    let mut taken = |candidate: &str| occupied(&dest_dir_parent.join(candidate));
    let final_name = resolve_collision(&sanitized, &mut taken);
    let dest = dest_dir_parent.join(&final_name);
    if is_in_git_project(&canonical_root, &dest) {
        return Err(AppError::GitProjectProtected(dest.display().to_string()));
    }
    if dest.exists() {
        return Err(AppError::WouldOverwrite(dest.display().to_string()));
    }

    let operation_type = if source.parent() == dest.parent() {
        if source.file_name() == dest.file_name() {
            return Err(AppError::Message("source and destination are identical".into()));
        }
        OperationType::Rename
    } else if source.file_name() == dest.file_name() {
        OperationType::Move
    } else {
        OperationType::MoveAndRename
    };

    Ok(PlannedMove {
        file_id: file_id.to_string(),
        root: canonical_root,
        old_path: source.to_path_buf(),
        new_path: dest,
        operation_type,
    })
}

pub fn execute_move(db: &Database, planned: &PlannedMove, batch_id: &str) -> AppResult<Operation> {
    if is_in_git_project(&planned.root, &planned.old_path)
        || is_in_git_project(&planned.root, &planned.new_path)
    {
        return Err(AppError::GitProjectProtected(planned.old_path.display().to_string()));
    }
    let now = now_iso();
    let mut op = Operation {
        id: new_id(),
        file_id: Some(planned.file_id.clone()),
        batch_id: Some(batch_id.to_string()),
        operation_type: planned.operation_type.clone(),
        old_path: planned.old_path.to_string_lossy().into_owned(),
        new_path: planned.new_path.to_string_lossy().into_owned(),
        status: OperationStatus::Planned,
        error: None,
        created_at: now.clone(),
        executed_at: None,
        undone_at: None,
    };
    db.insert_operation(&op)?;

    if !planned.old_path.exists() {
        op.status = OperationStatus::Failed;
        op.error = Some("source disappeared before execute".into());
        db.update_operation_status(&op.id, op.status.clone(), op.error.as_deref(), None, None)?;
        return Err(AppError::SourceMissing(op.old_path.clone()));
    }
    if planned.new_path.exists() {
        op.status = OperationStatus::Failed;
        op.error = Some("destination already exists".into());
        db.update_operation_status(&op.id, op.status.clone(), op.error.as_deref(), None, None)?;
        return Err(AppError::WouldOverwrite(op.new_path.clone()));
    }
    if let Some(parent) = planned.new_path.parent() {
        fs::create_dir_all(parent)?;
        let canonical_parent = parent.canonicalize()?;
        if !canonical_parent.starts_with(&planned.root) {
            op.status = OperationStatus::Failed;
            op.error = Some("destination escaped the selected root".into());
            db.update_operation_status(&op.id, op.status.clone(), op.error.as_deref(), None, None)?;
            return Err(AppError::PathNotAllowed(planned.new_path.display().to_string()));
        }
    }

    match fs::rename(&planned.old_path, &planned.new_path) {
        Ok(()) => {
            op.status = OperationStatus::Completed;
            op.executed_at = Some(now_iso());
            db.update_operation_status(
                &op.id,
                op.status.clone(),
                None,
                op.executed_at.as_deref(),
                None,
            )?;
            let name = planned
                .new_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            db.update_file_path(&planned.file_id, &op.new_path, &name)?;
            Ok(op)
        }
        Err(err) => {
            op.status = OperationStatus::Failed;
            op.error = Some(err.to_string());
            db.update_operation_status(&op.id, op.status.clone(), op.error.as_deref(), None, None)?;
            Err(err.into())
        }
    }
}

pub fn undo_operation(db: &Database, op: &Operation) -> AppResult<OperationStatus> {
    if op.status != OperationStatus::Completed {
        return Err(AppError::Message("only completed operations can be undone".into()));
    }
    let old = PathBuf::from(&op.old_path);
    let new = PathBuf::from(&op.new_path);
    if old.exists() {
        db.update_operation_status(
            &op.id,
            OperationStatus::UndoConflict,
            Some("original path is occupied; refusing overwrite"),
            None,
            None,
        )?;
        return Ok(OperationStatus::UndoConflict);
    }
    if !new.exists() {
        db.update_operation_status(
            &op.id,
            OperationStatus::UndoConflict,
            Some("moved file is no longer at the recorded destination"),
            None,
            None,
        )?;
        return Ok(OperationStatus::UndoConflict);
    }
    if let Some(parent) = old.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&new, &old)?;
    let undone_at = now_iso();
    db.update_operation_status(&op.id, OperationStatus::Undone, None, None, Some(&undone_at))?;
    if let Some(file_id) = &op.file_id {
        let name = old
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        db.update_file_path(file_id, &op.old_path, &name)?;
    }
    Ok(OperationStatus::Undone)
}

pub fn undo_batch(db: &Database, batch_id: &str) -> AppResult<(usize, usize)> {
    let mut ops = db.operations_in_batch(batch_id)?;
    // Reverse chronological so the last move is undone first.
    ops.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    ops.reverse();
    let mut undone = 0usize;
    let mut conflicts = 0usize;
    for op in ops {
        if op.status != OperationStatus::Completed {
            continue;
        }
        match undo_operation(db, &op)? {
            OperationStatus::Undone => undone += 1,
            OperationStatus::UndoConflict => conflicts += 1,
            _ => {}
        }
    }
    Ok((undone, conflicts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_moves_from_git_projects() {
        let root = std::env::temp_dir().join(format!("organizer-git-move-test-{}", std::process::id()));
        let project = root.join("aime_server");
        fs::create_dir_all(project.join(".git")).unwrap();
        let source = project.join("billing.py");
        fs::write(&source, "print('billing')").unwrap();

        let result = plan_move(
            &root,
            "file-1",
            &source,
            "billing.py",
            "Development/Code",
            "billing.py",
            &mut |_| false,
        );

        assert!(matches!(result, Err(AppError::GitProjectProtected(_))));
        fs::remove_dir_all(root).unwrap();
    }
}
