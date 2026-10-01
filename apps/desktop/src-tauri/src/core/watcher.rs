//! Folder watcher. After a write settles, files are scanned and queued for
//! review. Auto-apply is always off in V1.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

pub struct FolderWatcher {
    inner: Mutex<Option<RecommendedWatcher>>,
    pending: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    generation: Arc<AtomicU64>,
}

impl FolderWatcher {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn start(
        &self,
        folders: Vec<PathBuf>,
        on_settled: impl Fn(PathBuf) + Send + Sync + 'static,
    ) -> Result<(), String> {
        self.stop();
        let pending = Arc::clone(&self.pending);
        let generation = Arc::clone(&self.generation);
        let current_generation = generation.fetch_add(1, Ordering::SeqCst) + 1;

        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if generation.load(Ordering::SeqCst) != current_generation {
                return;
            }
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    notify::EventKind::Create(_) | notify::EventKind::Modify(_)
                ) {
                    if let Ok(mut map) = pending.lock() {
                        for path in event.paths {
                            map.insert(path, Instant::now());
                        }
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

        for folder in folders {
            watcher
                .watch(&folder, RecursiveMode::Recursive)
                .map_err(|e| e.to_string())?;
        }
        *self.inner.lock().unwrap() = Some(watcher);

        let pending = Arc::clone(&self.pending);
        let generation = Arc::clone(&self.generation);
        let on_settled = Arc::new(on_settled);
        std::thread::spawn(move || {
            while generation.load(Ordering::SeqCst) == current_generation {
                std::thread::sleep(Duration::from_millis(500));
                let mut settled = Vec::new();
                if let Ok(mut map) = pending.lock() {
                    let now = Instant::now();
                    map.retain(|path, instant| {
                        if now.duration_since(*instant) >= Duration::from_secs(2) {
                            settled.push(path.clone());
                            false
                        } else {
                            true
                        }
                    });
                }
                for path in settled {
                    on_settled(path);
                }
            }
        });
        Ok(())
    }

    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        *self.inner.lock().unwrap() = None;
        if let Ok(mut map) = self.pending.lock() {
            map.clear();
        }
    }

}

impl Default for FolderWatcher {
    fn default() -> Self {
        Self::new()
    }
}
