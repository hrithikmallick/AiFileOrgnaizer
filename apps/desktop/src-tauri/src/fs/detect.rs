//! File type detection: extension + MIME guess + magic bytes.
//! Extensions alone are never trusted.

use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct DetectedType {
    pub mime_type: String,
    pub kind: FileKind,
    pub via: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Pdf,
    Text,
    Markdown,
    Docx,
    Json,
    Csv,
    Code,
    Png,
    Jpeg,
    Other,
}

impl FileKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Text => "text",
            Self::Markdown => "markdown",
            Self::Docx => "docx",
            Self::Json => "json",
            Self::Csv => "csv",
            Self::Code => "code",
            Self::Png => "png",
            Self::Jpeg => "jpeg",
            Self::Other => "other",
        }
    }
}

const CODE_EXTS: &[&str] = &[
    "py", "rs", "ts", "tsx", "js", "jsx", "go", "java", "c", "h", "cpp", "cc", "cs", "rb", "php",
    "sh", "bash", "zsh", "kt", "swift", "scala", "lua", "r", "sql", "yml", "yaml", "toml", "xml",
    "html", "css", "scss", "vue", "svelte",
];

fn magic_kind(header: &[u8]) -> Option<(FileKind, &'static str)> {
    if header.len() >= 5 && &header[..5] == b"%PDF-" {
        return Some((FileKind::Pdf, "application/pdf"));
    }
    if header.len() >= 8 && header[..8] == [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A] {
        return Some((FileKind::Png, "image/png"));
    }
    if header.len() >= 3 && header[..3] == [0xFF, 0xD8, 0xFF] {
        return Some((FileKind::Jpeg, "image/jpeg"));
    }
    // ZIP container: could be DOCX (PK..)
    if header.len() >= 4 && &header[..2] == b"PK" {
        return None;
    }
    None
}

fn kind_from_extension(ext: &str) -> Option<(FileKind, &'static str)> {
    match ext {
        "pdf" => Some((FileKind::Pdf, "application/pdf")),
        "txt" | "log" | "text" => Some((FileKind::Text, "text/plain")),
        "md" | "markdown" => Some((FileKind::Markdown, "text/markdown")),
        "docx" => Some((
            FileKind::Docx,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )),
        "json" => Some((FileKind::Json, "application/json")),
        "csv" => Some((FileKind::Csv, "text/csv")),
        "png" => Some((FileKind::Png, "image/png")),
        "jpg" | "jpeg" => Some((FileKind::Jpeg, "image/jpeg")),
        other if CODE_EXTS.contains(&other) => {
            Some((FileKind::Code, mime_from_code_ext(other)))
        }
        _ => None,
    }
}

fn mime_from_code_ext(ext: &str) -> &'static str {
    match ext {
        "py" => "text/x-python",
        "rs" => "text/x-rust",
        "ts" | "tsx" => "text/typescript",
        "js" | "jsx" => "text/javascript",
        "go" => "text/x-go",
        "java" => "text/x-java",
        "yml" | "yaml" => "text/yaml",
        _ => "text/plain",
    }
}

pub fn detect_file_type(path: &Path, extension: Option<&str>) -> DetectedType {
    let mut header = [0u8; 16];
    let magic = File::open(path)
        .ok()
        .and_then(|mut f| f.read(&mut header).ok())
        .and_then(|n| magic_kind(&header[..n]));

    if let Some((kind, mime)) = magic {
        return DetectedType {
            mime_type: mime.into(),
            kind,
            via: "magic",
        };
    }

    if let Some(ext) = extension {
        if let Some((kind, mime)) = kind_from_extension(ext) {
            return DetectedType {
                mime_type: mime.into(),
                kind,
                via: "extension",
            };
        }
    }

    let guessed = mime_guess::from_path(path)
        .first_raw()
        .unwrap_or("application/octet-stream");
    DetectedType {
        mime_type: guessed.into(),
        kind: FileKind::Other,
        via: "mime_guess",
    }
}

pub fn is_supported_kind(kind: FileKind) -> bool {
    !matches!(kind, FileKind::Other)
}
