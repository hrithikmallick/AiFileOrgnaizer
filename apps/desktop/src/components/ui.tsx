import type { ReactNode } from "react";
import type { ReviewStatus, SuggestionSource } from "../types";
import type { Toast } from "../store";
import { IconAlert, IconCheck, IconClock, IconFile, IconSparkles, IconTag, IconX } from "./icons";

export function SourceBadge({ source }: { source: SuggestionSource }) {
  const map: Record<SuggestionSource, { label: string; className: string }> = {
    rule: { label: "Rule", className: "accent" },
    ai: { label: "AI", className: "green" },
    manual: { label: "Manual", className: "amber" },
    cache: { label: "Cached", className: "neutral" },
    fallback: { label: "Fallback", className: "red" },
  };
  const entry = map[source] ?? map.fallback;
  return (
    <span className={`badge ${entry.className}`}>
      {source === "ai" ? <IconSparkles size={12} /> : source === "fallback" ? <IconAlert size={12} /> : null}
      {entry.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, { label: string; className: string }> = {
    pending: { label: "Pending", className: "amber" },
    approved: { label: "Approved", className: "green" },
    ignored: { label: "Ignored", className: "neutral" },
    edited: { label: "Edited", className: "accent" },
  };
  const entry = map[status] ?? map.pending;
  return <span className={`badge ${entry.className}`}>{entry.label}</span>;
}

export function CategoryBadge({ category, subcategory }: { category: string; subcategory: string | null }) {
  return (
    <span className="badge accent" title={`${category}/${subcategory ?? ""}`}>
      <IconTag size={12} />
      {category}
      {subcategory ? ` / ${subcategory}` : ""}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="confidence">
      <div className="confidence-track">
        <div className={`confidence-fill ${pct < 60 ? "low" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="mono small">{pct}%</span>
    </div>
  );
}

export function FileTypeIcon({ extension }: { extension: string | null }) {
  const label = (extension ?? "").slice(0, 4).toUpperCase() || "FILE";
  return (
    <div className="file-icon" title={extension ? `.${extension}` : "unknown"}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "-0.03em" }}>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <IconFile size={34} />}
      <h4>{title}</h4>
      {hint ? <p className="small muted" style={{ maxWidth: 420 }}>{hint}</p> : null}
    </div>
  );
}

export function Modal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          {toast.kind === "success" ? <IconCheck size={16} /> : toast.kind === "error" ? <IconAlert size={16} /> : <IconClock size={16} />}
          <span className="grow small">{toast.message}</span>
          <button className="btn ghost icon sm" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch" style={disabled ? { opacity: 0.5 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="track" />
      <span className="small">{label}</span>
    </label>
  );
}
