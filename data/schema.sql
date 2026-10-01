-- Local AI File Organizer - SQLite schema
-- All state lives locally. No network access is required by this schema.
--
-- Conventions:
--   * Timestamps are stored as ISO-8601 UTC strings (TEXT).
--   * ids are UUID v4 strings (TEXT).
--   * Booleans are stored as INTEGER 0/1.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ---------------------------------------------------------------------------
-- files: every indexed file on disk (the source of truth for the scanner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
    id              TEXT PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    extension       TEXT,
    mime_type       TEXT,
    size            INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT,
    modified_at     TEXT,
    sha256          TEXT,
    -- indexing lifecycle: pending | indexed | analyzed | error | missing
    status          TEXT NOT NULL DEFAULT 'pending',
    error           TEXT,
    scan_session_id TEXT,
    is_ignored      INTEGER NOT NULL DEFAULT 0,
    indexed_at      TEXT,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_files_sha256      ON files (sha256);
CREATE INDEX IF NOT EXISTS idx_files_status      ON files (status);
CREATE INDEX IF NOT EXISTS idx_files_extension   ON files (extension);
CREATE INDEX IF NOT EXISTS idx_files_mime        ON files (mime_type);
CREATE INDEX IF NOT EXISTS idx_files_modified    ON files (modified_at);
CREATE INDEX IF NOT EXISTS idx_files_session     ON files (scan_session_id);

-- ---------------------------------------------------------------------------
-- scan_sessions: one row per folder scan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_sessions (
    id            TEXT PRIMARY KEY,
    root_path     TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'running', -- running | completed | failed | cancelled
    files_found   INTEGER NOT NULL DEFAULT 0,
    files_skipped INTEGER NOT NULL DEFAULT 0,
    bytes_scanned INTEGER NOT NULL DEFAULT 0,
    started_at    TEXT NOT NULL,
    finished_at   TEXT,
    error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_sessions_root ON scan_sessions (root_path);

-- ---------------------------------------------------------------------------
-- file_analysis: classification + rename suggestions produced by rules/AI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_analysis (
    id                 TEXT PRIMARY KEY,
    file_id            TEXT NOT NULL,
    category           TEXT NOT NULL DEFAULT 'Other',
    subcategory        TEXT,
    summary            TEXT,
    tags               TEXT,               -- JSON array of strings
    suggested_filename TEXT,
    suggested_folder   TEXT,               -- relative, application-mapped path
    confidence         REAL NOT NULL DEFAULT 0.0,
    source             TEXT NOT NULL,      -- rule | ai | manual | cache
    model_name         TEXT,
    extraction_method  TEXT,
    content_hash       TEXT,               -- sha256(content) used for cache lookups
    reviewed           INTEGER NOT NULL DEFAULT 0,
    review_status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | ignored | edited
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_file    ON file_analysis (file_id);
CREATE INDEX IF NOT EXISTS idx_analysis_review  ON file_analysis (review_status);
CREATE INDEX IF NOT EXISTS idx_analysis_cat     ON file_analysis (category, subcategory);

-- ---------------------------------------------------------------------------
-- embeddings: local vectors for semantic search
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embeddings (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL,
    model_name   TEXT NOT NULL,
    dim          INTEGER NOT NULL,
    vector       BLOB NOT NULL,           -- float32 little-endian
    content_hash TEXT,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embeddings_file  ON embeddings (file_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_file_model
    ON embeddings (file_id, model_name);

-- ---------------------------------------------------------------------------
-- operations: history of every filesystem mutation (drives undo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operations (
    id             TEXT PRIMARY KEY,
    file_id        TEXT,
    batch_id       TEXT,
    operation_type TEXT NOT NULL,          -- move | rename | move_and_rename
    old_path       TEXT NOT NULL,
    new_path       TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'planned',
                   -- planned | completed | failed | undone | undo_conflict
    error          TEXT,
    created_at     TEXT NOT NULL,
    executed_at    TEXT,
    undone_at      TEXT,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_operations_file  ON operations (file_id);
CREATE INDEX IF NOT EXISTS idx_operations_batch ON operations (batch_id);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations (status);

-- ---------------------------------------------------------------------------
-- rules: configurable deterministic classification rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    priority    INTEGER NOT NULL DEFAULT 100,   -- lower = evaluated first
    enabled     INTEGER NOT NULL DEFAULT 1,
    match_type  TEXT NOT NULL,                  -- extension | filename_regex | mime | magic
    pattern     TEXT NOT NULL,
    category    TEXT NOT NULL,
    subcategory TEXT,
    is_builtin  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules (priority, enabled);

-- ---------------------------------------------------------------------------
-- settings: key/value application configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,     -- JSON encoded
    updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- watched_folders: folder watcher configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watched_folders (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    enabled       INTEGER NOT NULL DEFAULT 1,
    auto_analyze  INTEGER NOT NULL DEFAULT 1,
    auto_apply    INTEGER NOT NULL DEFAULT 0,  -- reserved; always 0 in V1
    created_at    TEXT NOT NULL
);
