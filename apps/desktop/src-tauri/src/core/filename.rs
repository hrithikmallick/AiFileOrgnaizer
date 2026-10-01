//! Filename sanitization performed by the Rust core before any filesystem write.
//! The UI sanitizes for preview; this is the authoritative check.

use std::path::Path;

use crate::core::error::{AppError, AppResult};

const MAX_LEN: usize = 150;
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(idx) if idx > 0 && idx < name.len() - 1 => (&name[..idx], &name[idx..]),
        _ => (name, ""),
    }
}

pub fn sanitize_filename(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            out.push('-');
        } else {
            out.push(ch);
        }
    }
    let collapsed: String = out
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace("--", "-");
    let trimmed = collapsed.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let (stem, ext) = split_ext(trimmed);
    let mut safe_stem = stem.to_string();
    if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(&safe_stem)) {
        safe_stem = format!("_{safe_stem}");
    }
    let max_stem = MAX_LEN.saturating_sub(ext.len()).max(1);
    if safe_stem.len() > max_stem {
        safe_stem.truncate(max_stem);
        safe_stem = safe_stem.trim_end_matches(|c: char| c == '.' || c.is_whitespace()).to_string();
    }
    let result = format!("{safe_stem}{ext}");
    if result.is_empty() {
        "untitled".into()
    } else {
        result
    }
}

pub fn preserve_extension(original: &str, suggested: &str) -> String {
    let orig_ext = Path::new(original)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if orig_ext.is_empty() {
        return sanitize_filename(suggested);
    }
    let sanitized = sanitize_filename(suggested);
    let (_, sug_ext) = split_ext(&sanitized);
    if sug_ext.eq_ignore_ascii_case(&format!(".{orig_ext}")) {
        sanitized
    } else {
        let (stem, _) = split_ext(&sanitized);
        format!("{stem}.{orig_ext}")
    }
}

/// `name.pdf`, `name_2.pdf`, `name_3.pdf` ... never overwriting `taken`.
pub fn resolve_collision(filename: &str, taken: &mut dyn FnMut(&str) -> bool) -> String {
    if !taken(filename) {
        return filename.to_string();
    }
    let (stem, ext) = split_ext(filename);
    let mut index = 2u32;
    loop {
        let candidate = format!("{stem}_{index}{ext}");
        if !taken(&candidate) {
            return candidate;
        }
        index = index.saturating_add(1);
        if index > 10_000 {
            return format!("{stem}_{}.{}", uuid::Uuid::new_v4().simple(), ext.trim_start_matches('.'));
        }
    }
}

pub fn validate_filename(name: &str) -> AppResult<()> {
    if name.is_empty() {
        return Err(AppError::Message("filename cannot be empty".into()));
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::PathNotAllowed(name.into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_illegal_chars() {
        assert_eq!(sanitize_filename("a<>b.pdf"), "a-b.pdf");
    }

    #[test]
    fn reserved_windows_names() {
        assert_eq!(sanitize_filename("CON.txt"), "_CON.txt");
    }

    #[test]
    fn collision() {
        let seen = vec!["file.pdf".to_string()];
        let next = resolve_collision("file.pdf", &mut |c| seen.iter().any(|s| s == c));
        assert_eq!(next, "file_2.pdf");
    }
}
