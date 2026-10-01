export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 100 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return "-";
  const diff = Date.now() - date;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < minute) return "just now";
  if (abs < hour) return `${Math.round(abs / minute)} min ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)} h ${suffix}`;
  if (abs < 30 * day) return `${Math.round(abs / day)} d ${suffix}`;
  return formatDate(iso);
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function dirname(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join("/");
}

export function fileKind(extension: string | null, mimeType: string | null): string {
  if (mimeType) return mimeType;
  return extension ? `.${extension}` : "unknown";
}
