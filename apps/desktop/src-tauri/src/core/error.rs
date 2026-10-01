//! Shared error type. Every command maps this to a string for the UI.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("http error: {0}")]
    Http(String),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("path not allowed: {0}")]
    PathNotAllowed(String),
    #[error("Git project contents are protected: {0}")]
    GitProjectProtected(String),
    #[error("would overwrite existing file: {0}")]
    WouldOverwrite(String),
    #[error("source file not found: {0}")]
    SourceMissing(String),
    #[error("invalid category: {0}")]
    InvalidCategory(String),
    #[error("scan already running")]
    ScanInProgress,
    #[error("ai service refused: {0}")]
    AiService(String),
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        Self::Http(err.to_string())
    }
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

pub type AppResult<T> = Result<T, AppError>;
