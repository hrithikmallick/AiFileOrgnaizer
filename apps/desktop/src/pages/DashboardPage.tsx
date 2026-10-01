import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import type { FileRecord, Operation } from "../types";
import type { PageId } from "../components/Sidebar";
import { FileTypeIcon } from "../components/ui";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconDuplicates,
  IconFile,
  IconHardDrive,
  IconLayers,
  IconReview,
  IconScan,
} from "../components/icons";
import { formatBytes, formatNumber, formatRelative } from "../lib/format";

export function DashboardPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { backend, stats, dataVersion } = useApp();
  const [recentFiles, setRecentFiles] = useState<FileRecord[]>([]);
  const [recentOps, setRecentOps] = useState<Operation[]>([]);
  const [storageFiles, setStorageFiles] = useState<FileRecord[]>([]);

  useEffect(() => {
    void backend.listFiles(8).then(setRecentFiles);
    void backend.listFiles(5_000).then(setStorageFiles);
    void backend.listOperations(5).then(setRecentOps);
  }, [backend, dataVersion]);

  const storage = useMemo(() => {
    const groups = new Map<string, { bytes: number; files: number }>();
    for (const file of storageFiles) {
      const extension = file.extension ? `.${file.extension.toUpperCase()}` : "No extension";
      const group = groups.get(extension) ?? { bytes: 0, files: 0 };
      group.bytes += file.size;
      group.files += 1;
      groups.set(extension, group);
    }
    const total = [...groups.values()].reduce((sum, group) => sum + group.bytes, 0);
    return {
      total,
      groups: [...groups.entries()]
        .map(([extension, group]) => ({ extension, ...group }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 5),
      largest: [...storageFiles].sort((a, b) => b.size - a.size)[0],
    };
  }, [storageFiles]);

  const items = [
    { label: "Indexed files", value: formatNumber(stats?.indexedFiles ?? 0), hint: "All files in the local index", icon: <IconFile size={16} />, tone: "" },
    { label: "Pending reviews", value: formatNumber(stats?.pendingReviews ?? 0), hint: "Suggestions awaiting approval", icon: <IconReview size={16} />, tone: "amber" },
    { label: "Duplicate groups", value: formatNumber(stats?.duplicateGroups ?? 0), hint: `${formatBytes(stats?.duplicateWastedBytes ?? 0)} recoverable`, icon: <IconDuplicates size={16} />, tone: "red" },
    { label: "Scanned storage", value: formatBytes(stats?.scannedBytes ?? 0), hint: `${formatNumber(stats?.analyzedFiles ?? 0)} analyzed`, icon: <IconHardDrive size={16} />, tone: "green" },
  ];

  return (
    <div className="page">
      <div className="stat-grid">
        {items.map((item) => (
          <div className="stat" key={item.label}>
            <div className="stat-top">
              <span className="stat-label">{item.label}</span>
              <span className={`stat-icon ${item.tone}`}>{item.icon}</span>
            </div>
            <div className="stat-value">{item.value}</div>
            <div className="stat-foot">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <h3>Indexed files</h3>
            <button className="btn ghost sm" onClick={() => onNavigate("scan")}>
              <IconScan size={14} /> Scan folder
            </button>
          </div>
          <div className="list">
            {recentFiles.length === 0 ? (
              <div className="empty">
                <IconFile size={28} />
                <h4>No files indexed yet</h4>
                <p className="small muted">Start a scan to populate the local index.</p>
              </div>
            ) : (
              recentFiles.map((file) => (
                <div className="list-row" key={file.id}>
                  <FileTypeIcon extension={file.extension} />
                  <div className="grow cell-name">
                    <span className="name">{file.name}</span>
                    <span className="path">{file.path}</span>
                  </div>
                  <span className="chip">{formatBytes(file.size)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Safety boundary</h3>
            </div>
            <div className="card-body stack">
              <p className="small muted">AI classifies and suggests. Filesystem changes happen only after you approve, and only through the Rust core.</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
                <li>Never auto-move, rename, delete or overwrite</li>
                <li>Never generate arbitrary absolute paths</li>
                <li>Never send files to a remote API</li>
                <li>Undo is always available</li>
              </ul>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3>Storage intelligence</h3>
              <span className="hint">Local index</span>
            </div>
            <div className="card-body stack">
              {storage.groups.length === 0 ? (
                <p className="small muted">Scan a folder to see file-type storage usage.</p>
              ) : (
                storage.groups.map((group) => (
                  <div className="stack" key={group.extension} style={{ gap: 4 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="small">{group.extension} · {formatNumber(group.files)} files</span>
                      <span className="small mono">{formatBytes(group.bytes)}</span>
                    </div>
                    <div className="storage-meter"><span style={{ width: `${Math.max(2, Math.round((group.bytes / Math.max(1, storage.total)) * 100))}%` }} /></div>
                  </div>
                ))
              )}
              {storage.largest ? <p className="hint">Largest indexed file: {storage.largest.name} ({formatBytes(storage.largest.size)})</p> : null}
              {(stats?.duplicateWastedBytes ?? 0) > 0 ? <p className="hint">Duplicate recovery opportunity: {formatBytes(stats?.duplicateWastedBytes ?? 0)}</p> : null}
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3>File timeline</h3>
              <button className="btn ghost sm" onClick={() => onNavigate("history")}>View all</button>
            </div>
            <div className="list">
              {recentOps.length === 0 ? (
                <div className="empty" style={{ padding: 28 }}>
                  <IconClock size={22} />
                  <p className="small muted">No operations applied yet.</p>
                </div>
              ) : (
                recentOps.map((op) => (
                  <div className="list-row" key={op.id}>
                    {op.status === "completed" ? <IconCheck size={16} /> : op.status === "undo_conflict" ? <IconAlert size={16} /> : <IconLayers size={16} />}
                    <div className="grow cell-name">
                      <span className="name">{op.operationType.replaceAll("_", " ")}</span>
                      <span className="path">{op.newPath}</span>
                    </div>
                    <span className="hint">{formatRelative(op.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
