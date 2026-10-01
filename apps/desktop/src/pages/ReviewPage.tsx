import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import type { ReviewItem, ReviewStatus } from "../types";
import { ALL_CATEGORIES, subcategoriesOf } from "../lib/categories";
import { checkFilename, sanitizeFilename } from "../lib/filename";
import { formatBytes, formatConfidence } from "../lib/format";
import { CategoryBadge, ConfidenceMeter, EmptyState, FileTypeIcon, Modal, SourceBadge, StatusBadge } from "../components/ui";
import { IconCheck, IconEdit, IconEye, IconSparkles, IconX } from "../components/icons";

type Filter = ReviewStatus | "all";

export function ReviewPage() {
  const { backend, refresh, notify, dataVersion } = useApp();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ReviewItem | null>(null);
  const [preview, setPreview] = useState<ReviewItem | null>(null);
  const [busy, setBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void backend.listReviewItems(filter).then(setItems);
  }, [backend, filter, dataVersion]);

  const allIds = useMemo(() => items.filter((item) => item.analysis.reviewStatus === "pending").map((item) => item.analysis.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySelected = async (ids?: string[]) => {
    const analysisIds = ids ?? [...selected];
    const targets = items.filter((item) => analysisIds.includes(item.analysis.id));
    if (targets.length === 0) {
      notify("warning", "Select at least one suggestion.");
      return;
    }
    setBusy(true);
    try {
      const result = await backend.applyChanges(
        targets.map((item) => ({
          fileId: item.file.id,
          targetFilename: sanitizeFilename(item.analysis.suggestedFilename ?? item.file.name),
          targetFolder: item.analysis.suggestedFolder ?? `${item.analysis.category}/${item.analysis.subcategory ?? "Misc"}`,
        })),
      );
      notify("success", `Applied ${result.completed} of ${result.planned} operations.`);
      setSelected(new Set());
      refresh();
      const next = await backend.listReviewItems(filter);
      setItems(next);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  };

  const ignoreSelected = async (ids?: string[]) => {
    const analysisIds = ids ?? [...selected];
    if (analysisIds.length === 0) return;
    await backend.setReviewStatus(analysisIds, "ignored");
    notify("info", `Ignored ${analysisIds.length} file(s).`);
    setSelected(new Set());
    refresh();
    setItems(await backend.listReviewItems(filter));
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <div className="toolbar">
            {(["pending", "approved", "ignored", "edited", "all"] as Filter[]).map((value) => (
              <button key={value} className={`btn sm ${filter === value ? "primary" : "ghost"}`} onClick={() => { setFilter(value); setSelected(new Set()); }}>
                {value[0]?.toUpperCase()}{value.slice(1)}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <button
              className="btn sm ghost"
              onClick={() => setSelected(allSelected ? new Set() : new Set(allIds))}
              disabled={allIds.length === 0}
            >
              {allSelected ? "Clear" : "Select pending"}
            </button>
            <button className="btn sm success" disabled={busy || selected.size === 0} onClick={() => void applySelected()}>
              <IconCheck size={14} /> Bulk approve ({selected.size})
            </button>
            <button className="btn sm ghost" disabled={busy || selected.size === 0} onClick={() => void ignoreSelected()}>
              <IconX size={14} /> Ignore
            </button>
          </div>
        </div>
        <div className="table-wrap">
          {items.length === 0 ? (
            <EmptyState title="Nothing to review" hint="Run a scan to produce classification suggestions. Nothing is moved until you approve." />
          ) : (
            <table>
              <thead>
                <tr>
              <th style={{ width: 36 }}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all pending suggestions"
                  checked={allSelected}
                  disabled={allIds.length === 0}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
                />
              </th>
                  <th>Current filename</th>
                  <th>Type</th>
                  <th>Suggested category</th>
                  <th>Suggested filename</th>
                  <th>Confidence</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const checked = selected.has(item.analysis.id);
                  return (
                    <tr key={item.analysis.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={item.analysis.reviewStatus !== "pending"}
                          onChange={() => toggle(item.analysis.id)}
                        />
                      </td>
                      <td>
                        <div className="cell-name" style={{ display: "flex", flexDirection: "row", gap: 10, alignItems: "center", maxWidth: 320 }}>
                          <FileTypeIcon extension={item.file.extension} />
                          <div className="cell-name">
                            <span className="name">{item.file.name}</span>
                            <span className="path">{formatBytes(item.file.size)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="mono small">{item.file.mimeType ?? `.${item.file.extension ?? "?"}`}</td>
                      <td><CategoryBadge category={item.analysis.category} subcategory={item.analysis.subcategory} /></td>
                      <td className="mono small">{item.analysis.suggestedFilename}</td>
                      <td><ConfidenceMeter value={item.analysis.confidence} /></td>
                      <td><SourceBadge source={item.analysis.source} /></td>
                      <td><StatusBadge status={item.analysis.reviewStatus} /></td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn ghost icon sm" title="Preview" onClick={() => setPreview(item)}><IconEye size={14} /></button>
                          <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(item)}><IconEdit size={14} /></button>
                          {item.analysis.reviewStatus === "pending" ? (
                            <>
                              <button className="btn success sm" disabled={busy} onClick={() => void applySelected([item.analysis.id])}>
                                Approve
                              </button>
                              <button className="btn ghost sm" disabled={busy} onClick={() => void ignoreSelected([item.analysis.id])}>
                                Ignore
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {preview ? (
        <PreviewModal
          item={preview}
          previewPath={backend.previewTarget(preview.analysis.suggestedFolder ?? "", preview.analysis.suggestedFilename ?? preview.file.name)}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {editing ? (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await backend.updateAnalysis(editing.analysis.id, patch);
            notify("success", "Suggestion updated (source: manual).");
            refresh();
            setItems(await backend.listReviewItems(filter));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewModal({ item, previewPath, onClose }: { item: ReviewItem; previewPath: string; onClose: () => void }) {
  return (
    <Modal title="Suggestion preview" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        <div className="row">
          <SourceBadge source={item.analysis.source} />
          <span className="badge neutral">{formatConfidence(item.analysis.confidence)}</span>
          {item.analysis.modelName ? <span className="chip">{item.analysis.modelName}</span> : null}
        </div>
        <div className="diff">
          <span className="old">{item.file.path}</span>
          <span className="new">{previewPath}</span>
        </div>
        <p className="small muted">{item.analysis.summary}</p>
        <div className="row">
          {item.analysis.tags.map((tag) => (
            <span className="chip" key={tag}>{tag}</span>
          ))}
        </div>
        <p className="hint">This is a suggestion only. No file is moved until you approve.</p>
      </div>
    </Modal>
  );
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: ReviewItem;
  onClose: () => void;
  onSave: (patch: { category: string; subcategory: string; suggestedFilename: string }) => Promise<void>;
}) {
  const [category, setCategory] = useState(item.analysis.category);
  const [subcategory, setSubcategory] = useState(item.analysis.subcategory ?? "");
  const [filename, setFilename] = useState(item.analysis.suggestedFilename ?? item.file.name);
  const check = checkFilename(filename);
  const subs = subcategoriesOf(category);

  return (
    <Modal
      title="Edit suggestion"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!check.valid}
            onClick={() => void onSave({ category, subcategory, suggestedFilename: sanitizeFilename(filename) })}
          >
            <IconSparkles size={14} /> Save as manual
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="field">
          <label>Category</label>
          <select className="select" value={category} onChange={(event) => {
            const next = event.target.value;
            setCategory(next);
            const first = subcategoriesOf(next)[0] ?? "";
            setSubcategory(first);
          }}>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat.name} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Subcategory</label>
          <select className="select" value={subcategory} onChange={(event) => setSubcategory(event.target.value)}>
            {subs.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Suggested filename</label>
        <input className={`input ${check.valid ? "" : "invalid"}`} value={filename} onChange={(event) => setFilename(event.target.value)} />
        {check.warnings.map((warning) => (
          <span className="hint error" key={warning}>{warning}</span>
        ))}
        <span className="hint">Sanitized: {sanitizeFilename(filename)}</span>
      </div>
    </Modal>
  );
}
