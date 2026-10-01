import { useEffect, useState } from "react";
import { useApp } from "../store";
import type { DuplicateGroup } from "../types";
import { EmptyState, FileTypeIcon } from "../components/ui";
import { IconDuplicates } from "../components/icons";
import { formatBytes, formatDate } from "../lib/format";

export function DuplicatesPage() {
  const { backend, dataVersion, notify } = useApp();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);

  useEffect(() => {
    void backend.findDuplicates().then(setGroups);
  }, [backend, dataVersion]);

  const wasted = groups.reduce((sum, group) => sum + group.wastedBytes, 0);

  return (
    <div className="page">
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Duplicate groups</div>
          <div className="stat-value">{groups.length}</div>
          <div className="stat-foot">SHA-256 exact matches</div>
        </div>
        <div className="stat">
          <div className="stat-label">Recoverable space</div>
          <div className="stat-value">{formatBytes(wasted)}</div>
          <div className="stat-foot">Never deleted automatically</div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No exact duplicates"
            hint="V1 detects bit-identical files via SHA-256. Perceptual hashing is reserved for a later version."
            icon={<IconDuplicates size={28} />}
          />
        </div>
      ) : (
        groups.map((group) => (
          <div className="card" key={group.sha256}>
            <div className="card-head">
              <div>
                <h3>{group.duplicates.length + 1} copies of {formatBytes(group.size)}</h3>
                <p className="hint">{formatBytes(group.wastedBytes)} wasted · keep the oldest / shortest path</p>
              </div>
              <span className="chip" title={group.sha256}>{group.sha256.slice(0, 16)}...</span>
            </div>
            <div className="list">
              <DuplicateRow file={group.keep} keep />
              {group.duplicates.map((file) => (
                <DuplicateRow file={file} key={file.id} keep={false} />
              ))}
            </div>
            <div className="card-body">
              <p className="hint">
                Duplicates are shown for review only. This app never deletes files. Use your own tools if you decide to remove extras.
              </p>
              <button className="btn ghost sm" onClick={() => notify("info", "Automatic deletion is intentionally disabled.")}>
                Delete extras (disabled)
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DuplicateRow({
  file,
  keep,
}: {
  file: DuplicateGroup["keep"];
  keep: boolean;
}) {
  return (
    <div className="list-row">
      <FileTypeIcon extension={file.extension} />
      <div className="grow cell-name">
        <span className="name">{file.name}</span>
        <span className="path">{file.path}</span>
      </div>
      <span className="hint">{formatDate(file.createdAt)}</span>
      <span className={`badge ${keep ? "green" : "neutral"}`}>{keep ? "Keep" : "Duplicate"}</span>
    </div>
  );
}
