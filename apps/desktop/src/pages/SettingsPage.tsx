import { useEffect, useState } from "react";
import { useApp } from "../store";
import type { AppSettings, LocalModelStatus, RuleRecord, WatchedFolder } from "../types";
import { Switch } from "../components/ui";
import { ALL_CATEGORIES } from "../lib/categories";
import { IconFolder, IconPlus, IconShield } from "../components/icons";

export function SettingsPage() {
  const { backend, settings, updateSettings, notify, dataVersion } = useApp();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [modelStatus, setModelStatus] = useState<LocalModelStatus | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    void backend.listRules().then(setRules);
    void backend.listWatchedFolders().then(setFolders);
  }, [backend, dataVersion]);

  useEffect(() => {
    void backend.getLocalModelStatus().then(setModelStatus);
  }, [backend]);

  if (!draft) return null;

  const save = async () => {
    await updateSettings(draft);
    notify("success", "Settings saved locally.");
  };

  const chooseWatchedFolder = async () => {
    if (backend.kind !== "tauri") {
      notify("info", "Folder picking is available in the desktop app.");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setNewFolder(selected);
  };

  return (
    <div className="page">
      <div className="split">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Bundled local model</h3></div>
            <div className="card-body stack">
              <p className="small">llama.cpp runs only on this device at 127.0.0.1. The AI service is configured only after the model is ready.</p>
              <div className="code-block">{modelStatus ? `status=${modelStatus.state}\nmodel=${modelStatus.modelName ?? "-"}\nendpoint=${modelStatus.endpoint ?? "-"}` : "Checking model status..."}</div>
              {modelStatus?.message ? <p className="hint">{modelStatus.message}</p> : null}
              <div className="row">
                <button
                  className="btn primary"
                  disabled={backend.kind !== "tauri" || modelStatus?.state === "ready" || modelStatus?.state === "starting"}
                  onClick={() => void backend.startLocalModel().then((status) => { setModelStatus(status); notify("success", "Local model is ready."); }).catch((error) => notify("error", error instanceof Error ? error.message : "Local model failed to start"))}
                >
                  Start bundled model
                </button>
                <button
                  className="btn ghost"
                  disabled={backend.kind !== "tauri" || modelStatus?.state !== "ready"}
                  onClick={() => void backend.stopLocalModel().then(() => void backend.getLocalModelStatus().then(setModelStatus))}
                >
                  Stop model
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Privacy</h3></div>
            <div className="card-body stack">
              <div className="row">
                <IconShield size={18} />
                <p className="small">Everything runs on this device. Files, embeddings, hashes and suggestions stay in the local SQLite database. There is no account, no cloud sync and no remote API.</p>
              </div>
              <div className="code-block">AI CAN: classify, summarize, suggest filename/category, generate tags
AI CANNOT: move, rename, delete, overwrite, execute, create arbitrary paths</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>AI service (local)</h3></div>
            <div className="card-body stack">
              <div className="field">
                <label>AI service URL</label>
                <input className="input" value={draft.aiServiceUrl} onChange={(e) => setDraft({ ...draft, aiServiceUrl: e.target.value })} />
                <span className="hint">Must be a localhost URL. The Rust core refuses non-loopback hosts.</span>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>LLM model</label>
                  <input className="input" value={draft.llmModel} onChange={(e) => setDraft({ ...draft, llmModel: e.target.value })} />
                </div>
                <div className="field">
                  <label>Embedding model</label>
                  <input className="input" value={draft.embeddingModel} onChange={(e) => setDraft({ ...draft, embeddingModel: e.target.value })} />
                </div>
              </div>
              <Switch
                checked={draft.autoAnalyzeAfterScan}
                onChange={(checked) => setDraft({ ...draft, autoAnalyzeAfterScan: checked })}
                label="Analyze files after a scan (suggestions only)"
              />
              <button className="btn primary" onClick={() => void save()}>Save settings</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Ignore list</h3></div>
            <div className="card-body stack">
              <textarea
                className="input"
                rows={6}
                value={draft.ignoreGlobs.join("\n")}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    ignoreGlobs: event.target.value.split(/\n/).map((line) => line.trim()).filter(Boolean),
                  })
                }
              />
              <span className="hint">Directory names skipped during recursive scans.</span>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Smart watch folders</h3></div>
            <div className="card-body stack">
              <p className="small muted">After a file finishes writing, it is indexed and optionally analyzed for review. Auto-apply is always off.</p>
              {folders.map((folder) => (
                <div className="list-row" key={folder.id} style={{ padding: "8px 0" }}>
                  <div className="grow cell-name">
                    <span className="name">{folder.path}</span>
                    <span className="path">analyze={folder.autoAnalyze ? "on" : "off"} · auto-apply=off</span>
                  </div>
                  <Switch
                    checked={folder.enabled}
                    onChange={(enabled) => {
                      void backend.toggleWatchedFolder(folder.id, enabled).then((updated) => {
                        setFolders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                      });
                    }}
                    label={folder.enabled ? "Watching" : "Paused"}
                  />
                </div>
              ))}
              <div className="input-row">
                <input className="input" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Add a folder to watch" />
                <button className="btn ghost" type="button" title="Choose a folder" onClick={() => void chooseWatchedFolder()}>
                  <IconFolder size={14} /> Browse
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    if (!newFolder.trim()) return;
                    const added = await backend.addWatchedFolder(newFolder.trim());
                    setFolders((current) => (current.some((item) => item.id === added.id) ? current : [...current, added]));
                    setNewFolder("");
                    notify("success", "Folder added. Auto-move remains off.");
                  }}
                >
                  <IconPlus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Rule engine</h3>
              <span className="hint">Evaluated before AI, by priority</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Match</th>
                    <th>Maps to</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="mono">{rule.priority}</td>
                      <td>{rule.name}</td>
                      <td className="mono small">{rule.matchType}: {rule.pattern}</td>
                      <td className="small">{rule.category}/{rule.subcategory}</td>
                      <td>
                        <Switch
                          checked={rule.enabled}
                          onChange={(enabled) => {
                            void backend.updateRule(rule.id, { enabled }).then((updated) => {
                              setRules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                            });
                          }}
                          label=""
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body">
              <p className="hint">Rules may only target the application-owned categories: {ALL_CATEGORIES.map((c) => c.name).join(", ")}.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
