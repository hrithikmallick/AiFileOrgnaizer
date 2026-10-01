//! Rust-owned lifecycle management for the bundled llama.cpp server.
//!
//! The model server is always bound to loopback. Python only receives its
//! already-running HTTP endpoint and never starts commands or touches models.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::core::error::{AppError, AppResult};

const MODEL_PORT: u16 = 8011;
const START_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelStatus {
    pub state: String,
    pub model_name: Option<String>,
    pub endpoint: Option<String>,
    pub message: Option<String>,
}

impl LocalModelStatus {
    fn unavailable(message: impl Into<String>) -> Self {
        Self {
            state: "unavailable".into(),
            model_name: None,
            endpoint: None,
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct ModelManifest {
    model_name: String,
    model_file: String,
    sha256: String,
    context_size: u32,
}

struct Inner {
    status: LocalModelStatus,
    child: Option<Child>,
}

#[derive(Clone)]
pub struct LocalModelManager {
    resource_dir: PathBuf,
    inner: Arc<Mutex<Inner>>,
}

impl LocalModelManager {
    pub fn new(resource_dir: PathBuf) -> Self {
        Self {
            resource_dir,
            inner: Arc::new(Mutex::new(Inner {
                status: LocalModelStatus::unavailable("Bundled local model has not started."),
                child: None,
            })),
        }
    }

    pub fn status(&self) -> LocalModelStatus {
        let mut inner = self.inner.lock();
        if let Some(child) = inner.child.as_mut() {
            if let Ok(Some(exit)) = child.try_wait() {
                inner.child = None;
                inner.status = LocalModelStatus::unavailable(format!(
                    "llama-server exited unexpectedly ({exit})."
                ));
            }
        }
        inner.status.clone()
    }

    pub fn start(&self) -> AppResult<LocalModelStatus> {
        if self.status().state == "ready" || self.status().state == "starting" {
            return Ok(self.status());
        }

        let manifest = self.read_manifest()?;
        let executable = self.resource("llama/llama-server.exe")?;
        let model = self.resource(&manifest.model_file)?;
        if !executable.is_file() {
            return self.fail("Bundled llama-server.exe is missing.");
        }
        if !model.is_file() {
            return self.fail("Bundled GGUF model is missing.");
        }
        verify_sha256(&model, &manifest.sha256)?;

        {
            let mut inner = self.inner.lock();
            inner.status = LocalModelStatus {
                state: "starting".into(),
                model_name: Some(manifest.model_name.clone()),
                endpoint: Some(endpoint()),
                message: None,
            };
        }

        let model_path = model.to_string_lossy().into_owned();
        let port = MODEL_PORT.to_string();
        let context_size = manifest.context_size.to_string();
        let mut command = Command::new(executable);
        command
            .args([
                "-m",
                &model_path,
                "--host",
                "127.0.0.1",
                "--port",
                &port,
                "--alias",
                &manifest.model_name,
                "-c",
                &context_size,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let child = command.spawn().map_err(AppError::from)?;
        self.inner.lock().child = Some(child);

        let deadline = Instant::now() + START_TIMEOUT;
        while Instant::now() < deadline {
            if self.health_check() {
                let mut inner = self.inner.lock();
                inner.status.state = "ready".into();
                inner.status.message = None;
                return Ok(inner.status.clone());
            }
            if self.status().state == "unavailable" {
                break;
            }
            thread::sleep(Duration::from_millis(250));
        }
        self.stop();
        self.fail("llama-server did not become ready within 60 seconds.")
    }

    pub fn stop(&self) {
        let mut inner = self.inner.lock();
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.status = LocalModelStatus::unavailable("Bundled local model is stopped.");
    }

    fn read_manifest(&self) -> AppResult<ModelManifest> {
        let manifest_path = self.resource("model-manifest.json")?;
        let raw = fs::read_to_string(manifest_path)?;
        serde_json::from_str(&raw).map_err(Into::into)
    }

    fn resource(&self, relative: &str) -> AppResult<PathBuf> {
        let path = Path::new(relative);
        if path.is_absolute()
            || path
                .components()
                .any(|component| matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
        {
            return Err(AppError::PathNotAllowed(relative.into()));
        }
        Ok(self.resource_dir.join(path))
    }

    fn health_check(&self) -> bool {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(1))
            .build()
            .and_then(|client| client.get(format!("{}/health", endpoint())).send())
            .map(|response| response.status().is_success())
            .unwrap_or(false)
    }

    fn fail<T>(&self, message: impl Into<String>) -> AppResult<T> {
        let message = message.into();
        self.inner.lock().status = LocalModelStatus::unavailable(message.clone());
        Err(AppError::AiService(message))
    }
}

impl Drop for LocalModelManager {
    fn drop(&mut self) {
        if Arc::strong_count(&self.inner) == 1 {
            self.stop();
        }
    }
}

fn endpoint() -> String {
    format!("http://127.0.0.1:{MODEL_PORT}")
}

fn verify_sha256(path: &Path, expected: &str) -> AppResult<()> {
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::AiService(
            "Bundled model manifest must contain a pinned SHA-256.".into(),
        ));
    }
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = hex::encode(hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(AppError::AiService("Bundled model checksum mismatch.".into()));
    }
    Ok(())
}
