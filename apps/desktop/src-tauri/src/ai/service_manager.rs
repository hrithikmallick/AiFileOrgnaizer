//! Lifecycle management for the frozen, bundled local AI service.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::core::error::{AppError, AppResult};

const SERVICE_URL: &str = "http://127.0.0.1:8010";
const START_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct LocalServiceManager {
    resource_dir: PathBuf,
    child: Arc<Mutex<Option<Child>>>,
}

impl LocalServiceManager {
    pub fn new(resource_dir: PathBuf) -> Self {
        Self { resource_dir, child: Arc::new(Mutex::new(None)) }
    }

    pub fn start(&self) -> AppResult<()> {
        if self.health_check() {
            return Ok(());
        }
        let executable = self.resource_dir.join("ai-service").join("ai-service.exe");
        if !executable.is_file() {
            return Err(AppError::AiService("Bundled AI service is missing.".into()));
        }
        let mut command = Command::new(executable);
        command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        *self.child.lock() = Some(command.spawn().map_err(AppError::from)?);

        let deadline = Instant::now() + START_TIMEOUT;
        while Instant::now() < deadline {
            if self.health_check() {
                return Ok(());
            }
            if self.child.lock().as_mut().and_then(|child| child.try_wait().ok()).flatten().is_some() {
                break;
            }
            thread::sleep(Duration::from_millis(250));
        }
        self.stop();
        Err(AppError::AiService("Bundled AI service did not become ready.".into()))
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn health_check(&self) -> bool {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(1))
            .build()
            .and_then(|client| client.get(format!("{SERVICE_URL}/health")).send())
            .map(|response| response.status().is_success())
            .unwrap_or(false)
    }
}

impl Drop for LocalServiceManager {
    fn drop(&mut self) {
        if Arc::strong_count(&self.child) == 1 {
            self.stop();
        }
    }
}
