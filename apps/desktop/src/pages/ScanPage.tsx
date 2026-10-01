import { useEffect, useState } from "react";
import { useApp } from "../store";
import type { ScanProgress } from "../types";
import type { PageId } from "../components/Sidebar";
import { IconFolder, IconScan } from "../components/icons";
import { formatBytes, formatNumber } from "../lib/format";
import { Switch } from "../components/ui";

const DEFAULT_IGNORES = [".git", "node_modules", ".venv", "venv", "__pycache__", "target", "dist", "build"];

export function ScanPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { backend, settings, notify } = useApp();
  const [rootPath, setRootPath] = useState("C:\\Users\\User\\Downloads");
  const [recursive, setRecursive] = useState(true);
  const [computeHashes, setComputeHashes] = useState(true);
  const [analyze, setAnalyze] = useState(true);
  const [ignoreText, setIgnoreText] = useState((settings?.ignoreGlobs ?? DEFAULT_IGNORES).join("\n"));
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setIgnoreText(settings.ignoreGlobs.join("\n"));
    setAnalyze(settings.autoAnalyzeAfterScan);
  }, [settings]);

  useEffect(() => {
    return backend.onScanProgress((next) => {
      setProgress(next);
      if (next.phase === "done" || next.phase === "cancelled" || next.phase === "failed") {
        setRunning(false);
      }
    });
  }, [backend]);

  const start = async () => {
    if (!rootPath.trim()) {
      notify("error", "Choose a folder to scan.");
      return;
    }
    setRunning(true);
    setProgress(null);
    try {
      const ignoreGlobs = ignoreText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      await backend.startScan({
        rootPath: rootPath.trim(),
        recursive,
        computeHashes,
        analyze,
        ignoreGlobs,
      });
      notify("info", "Scan started. Files stay on this device.");
    } catch (error) {
      setRunning(false);
      notify("error", error instanceof Error ? error.message : "Failed to start scan");
    }
  };

  const chooseFolder = async () => {
    if (backend.kind !== "tauri") {
      notify("info", "Folder picking is available in the desktop app.");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setRootPath(selected);
  };

  const cancel = async () => {
    await backend.cancelScan();
    setRunning(false);
  };

  const pct = progress
    ? progress.phase === "done"
      ? 100
      : Math.min(95, Math.round((progress.filesFound / Math.max(24, progress.filesFound + 4)) * 100))
    : 0;

  return (
    <div className="page">
      <div className="split">
        <div className="card">
          <div className="card-head">
            <h3>Folder to scan</h3>
            <span className="hint">Recursive, concurrent, skip-inaccessible</span>
          </div>
          <div className="card-body stack">
            <div className="field">
              <label htmlFor="root">Root path</label>
              <div className="input-row">
                <input
                  id="root"
                  className="input"
                  value={rootPath}
                  onChange={(event) => setRootPath(event.target.value)}
                  placeholder="C:\\Users\\User\\Downloads"
                />
                <button className="btn" type="button" title="Choose a folder" onClick={() => void chooseFolder()}>
                  <IconFolder size={16} /> Browse
                </button>
              </div>
              {backend.kind === "demo" ? (
                <span className="hint">Demo mode uses a simulated Downloads folder. In the native app this opens a real picker.</span>
              ) : null}
            </div>

            <div className="grid-2">
              <Switch checked={recursive} onChange={setRecursive} label="Recursive scan" />
              <Switch checked={computeHashes} onChange={setComputeHashes} label="Compute SHA-256" />
              <Switch checked={analyze} onChange={setAnalyze} label="Run rules + AI after scan" />
            </div>

            <div className="field">
              <label htmlFor="ignores">Ignore list (one per line)</label>
              <textarea id="ignores" className="input" rows={5} value={ignoreText} onChange={(event) => setIgnoreText(event.target.value)} />
              <span className="hint">Defaults: {DEFAULT_IGNORES.join(", ")}</span>
            </div>

            <div className="row">
              <button className="btn primary" onClick={() => void start()} disabled={running}>
                <IconScan size={16} /> Start scan
              </button>
              <button className="btn ghost" onClick={() => void cancel()} disabled={!running}>
                Cancel
              </button>
              {progress?.phase === "done" ? (
                <button className="btn success" onClick={() => onNavigate("review")}>
                  Review suggestions
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Progress</h3>
              <span className={`badge ${progress ? "accent" : "neutral"}`}>{progress?.phase ?? "idle"}</span>
            </div>
            <div className="card-body stack">
              <div className="bar" style={{ height: 10 }}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="grid-2">
                <div>
                  <div className="stat-label">Files found</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{formatNumber(progress?.filesFound ?? 0)}</div>
                </div>
                <div>
                  <div className="stat-label">Bytes hashed</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{formatBytes(progress?.bytesScanned ?? 0)}</div>
                </div>
              </div>
              <div className="field">
                <label>Current file</label>
                <div className="code-block">{progress?.currentPath ?? "Waiting..."}</div>
              </div>
              {progress?.message ? <p className="small muted">{progress.message}</p> : null}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Pipeline</h3></div>
            <div className="card-body">
              <ol className="small muted" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                <li>Walk directories, skip ignores and inaccessible files</li>
                <li>Collect metadata + MIME + magic bytes</li>
                <li>Hash SHA-256 (bounded concurrency)</li>
                <li>Extract content (first pages / limited text)</li>
                <li>Apply deterministic rules, then AI if needed</li>
                <li>Queue suggestions for the review screen</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
