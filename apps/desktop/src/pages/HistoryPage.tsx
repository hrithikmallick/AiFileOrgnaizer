import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import type { Operation } from "../types";
import { EmptyState } from "../components/ui";
import { IconHistory, IconUndo } from "../components/icons";
import { formatDate, formatRelative } from "../lib/format";

export function HistoryPage() {
  const { backend, refresh, notify, dataVersion } = useApp();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void backend.listOperations(200).then(setOperations);
  }, [backend, dataVersion]);

  const batches = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const operation of operations) {
      const key = operation.batchId ?? operation.id;
      const list = map.get(key) ?? [];
      list.push(operation);
      map.set(key, list);
    }
    return [...map.entries()].map(([id, items]) => ({ id, items }));
  }, [operations]);

  const undo = async (batchId: string) => {
    setBusy(batchId);
    try {
      const result = await backend.undoBatch(batchId);
      if (result.conflicts > 0) {
        notify("warning", `Undid ${result.undone}; ${result.conflicts} conflict(s) skipped to avoid overwrite.`);
      } else {
        notify("success", `Undid ${result.undone} operation(s).`);
      }
      refresh();
      setOperations(await backend.listOperations(200));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Undo failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      {batches.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No timeline events yet"
            hint="Approved moves and renames appear here and can be reversed without overwriting existing files."
            icon={<IconHistory size={28} />}
          />
        </div>
      ) : (
        batches.map((batch) => {
          const completed = batch.items.filter((item) => item.status === "completed").length;
          const undone = batch.items.filter((item) => item.status === "undone").length;
          const canUndo = completed > 0;
          return (
            <div className="card" key={batch.id}>
              <div className="card-head">
                <div>
                  <h3>Timeline batch {batch.id.slice(-8)}</h3>
                  <p className="hint">
                    {batch.items.length} operation(s) · {completed} completed · {undone} undone
                  </p>
                </div>
                <button className="btn" disabled={!canUndo || busy === batch.id} onClick={() => void undo(batch.id)}>
                  <IconUndo size={14} /> Undo batch
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.items.map((item) => (
                      <tr key={item.id}>
                        <td className="nowrap">{item.operationType.replaceAll("_", " ")}</td>
                        <td className="mono small">{item.oldPath}</td>
                        <td className="mono small">{item.newPath}</td>
                        <td className="nowrap" title={formatDate(item.createdAt)}>{formatRelative(item.createdAt)}</td>
                        <td>
                          <span className={`badge ${item.status === "completed" ? "green" : item.status === "undone" ? "accent" : item.status === "undo_conflict" ? "amber" : "neutral"}`}>
                            {item.status.replaceAll("_", " ")}
                          </span>
                          {item.error ? <div className="hint error">{item.error}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
