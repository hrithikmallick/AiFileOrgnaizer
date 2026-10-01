/**
 * Filename sanitization shared with the review UI. The Rust core performs the
 * authoritative check before touching the filesystem; this copy gives immediate
 * feedback while the user edits a suggested name.
 */

const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

export const MAX_FILENAME_LENGTH = 150;

export interface FilenameCheck {
  value: string;
  valid: boolean;
  warnings: string[];
}

function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

export function sanitizeFilename(input: string): string {
  let name = input.normalize("NFC").replace(ILLEGAL_CHARS, "-");
  name = name.replace(/\s+/g, " ").replace(/-+/g, "-").trim();
  name = name.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");

  const { stem, ext } = splitExtension(name);

  let safeStem = stem;
  if (RESERVED.has(safeStem.toUpperCase())) safeStem = `_${safeStem}`;

  const maxStem = Math.max(1, MAX_FILENAME_LENGTH - ext.length);
  if (safeStem.length > maxStem) safeStem = safeStem.slice(0, maxStem).replace(/[.\s]+$/, "");

  const result = `${safeStem}${ext}`;
  return result.length > 0 ? result : "untitled";
}

export function checkFilename(input: string): FilenameCheck {
  const warnings: string[] = [];
  const trimmed = input.trim();

  if (trimmed.length === 0) warnings.push("Filename cannot be empty.");
  if (ILLEGAL_CHARS.test(input)) warnings.push("Contains characters illegal on Windows.");
  if (/[.\s]$/.test(input)) warnings.push("Cannot end with a space or dot.");

  const { stem } = splitExtension(trimmed);
  if (RESERVED.has(stem.toUpperCase())) warnings.push(`"${stem}" is a reserved device name.`);
  if (input.length > MAX_FILENAME_LENGTH) warnings.push(`Longer than ${MAX_FILENAME_LENGTH} characters.`);

  const value = sanitizeFilename(input);
  return { value, valid: warnings.length === 0, warnings };
}

/** Produces `name.pdf`, `name_2.pdf`, `name_3.pdf` ... avoiding `taken`. */
export function resolveCollision(filename: string, taken: Set<string>): string {
  if (!taken.has(filename.toLowerCase())) return filename;
  const { stem, ext } = splitExtension(filename);
  let index = 2;
  let candidate = `${stem}_${index}${ext}`;
  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${stem}_${index}${ext}`;
  }
  return candidate;
}
