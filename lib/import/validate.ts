/* ─────────────────────────────────────────────────────────────────────────
 * Row validation against an entity schema.
 *
 * Given a parsed CSV record + the user's header→column mapping, produce
 * a normalized object keyed by target field name, plus a list of errors.
 *
 * Used by:
 *   - the preview step (counts errors per column for the user)
 *   - the server importers (drop rows with `required` errors, surface
 *     non-required errors back in the response summary)
 * ───────────────────────────────────────────────────────────────────── */

import type { EntityKey, ImportColumn, ImportColumnType } from "./schemas";
import { SCHEMAS } from "./schemas";

export interface RowError {
  field?: string;
  message: string;
}

export interface ValidatedRow {
  /** Target-field-keyed cleaned values. Only fields that the user mapped. */
  data: Record<string, string>;
  errors: RowError[];
  /** True if every `required` field is present and non-empty (after type-coerce). */
  hasRequired: boolean;
}

/* ────────── type-level checkers ────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\-()\s\d.]{4,}$/;

function isValidDate(s: string): boolean {
  // Accept yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy, or anything Date.parse accepts.
  if (!s.trim()) return false;
  const trimmed = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return !Number.isNaN(Date.parse(trimmed));
  // dd/mm/yyyy or mm/dd/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return true;
  const t = Date.parse(trimmed);
  return !Number.isNaN(t);
}

/**
 * Normalize a date to ISO yyyy-mm-dd. Returns null if unparseable.
 * Handles dd/mm/yyyy and mm/dd/yyyy ambiguously — falls back to
 * Date.parse interpretation. Good enough for v1.
 */
export function normalizeDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // dd/mm/yyyy (assume DMY since CRM users skew non-US; if the first
  // group is > 12 we *know* it's DMY)
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = slash[3];
    // If first part > 12, definitely DMY.
    const dmy = a > 12;
    const day = dmy ? a : a; // prefer DMY by default
    const mon = dmy ? b : b;
    // Default: treat as DMY (matches most non-US locales)
    const d = String(a).padStart(2, "0");
    const m = String(b).padStart(2, "0");
    void day;
    void mon;
    return `${y}-${m}-${d}`;
  }
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return null;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function checkType(
  value: string,
  type: ImportColumnType,
  enumValues?: readonly string[]
): string | null {
  if (!value) return null; // empty is allowed at the type level; required is checked separately
  switch (type) {
    case "email":
      return EMAIL_RE.test(value) ? null : "not a valid email";
    case "phone":
      return PHONE_RE.test(value) ? null : "not a valid phone";
    case "date":
      return isValidDate(value) ? null : "not a valid date";
    case "number":
      return Number.isFinite(Number(value)) ? null : "not a number";
    case "enum":
      if (!enumValues || enumValues.length === 0) return null;
      return enumValues.includes(value.toLowerCase())
        ? null
        : `must be one of: ${enumValues.join(", ")}`;
    case "string":
    default:
      return null;
  }
}

/**
 * Validate one row against a mapping. The mapping shape is
 * `header → targetField | null`. Headers mapped to null are ignored.
 */
export function validateRow(
  entity: EntityKey,
  record: Record<string, string>,
  mapping: Record<string, string | null>
): ValidatedRow {
  const cols = SCHEMAS[entity];
  const byName = new Map<string, ImportColumn>(cols.map((c) => [c.name, c]));

  // Collect per-target values; if two headers map to the same target,
  // the first non-empty wins.
  const cleaned: Record<string, string> = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (!target) continue;
    const v = (record[header] ?? "").trim();
    if (!v) continue;
    if (!(target in cleaned)) cleaned[target] = v;
  }

  const errors: RowError[] = [];
  // Type-check + custom validators
  for (const [target, raw] of Object.entries(cleaned)) {
    const col = byName.get(target);
    if (!col) continue;
    let normalised = raw;
    if (col.type === "enum") normalised = raw.toLowerCase();
    const typeErr = checkType(normalised, col.type, col.enum);
    if (typeErr) {
      errors.push({ field: col.name, message: typeErr });
      continue;
    }
    if (col.type === "date") {
      const d = normalizeDate(raw);
      if (!d) {
        errors.push({ field: col.name, message: "not a valid date" });
        continue;
      }
      cleaned[target] = d;
    } else if (col.type === "enum") {
      cleaned[target] = normalised;
    }
    if (col.validate) {
      const v = col.validate(cleaned[target]);
      if (v) errors.push({ field: col.name, message: v });
    }
  }

  // Required-field check
  let hasRequired = true;
  for (const col of cols) {
    if (!col.required) continue;
    if (!cleaned[col.name]) {
      hasRequired = false;
      errors.push({ field: col.name, message: `${col.label} is required` });
    }
  }

  return { data: cleaned, errors, hasRequired };
}

export interface RowsSummary {
  total: number;
  ok: number;
  withErrors: number;
  errorsByColumn: Record<string, number>;
}

/**
 * Aggregate the validation results across all rows. Used by the preview
 * step to render error counts per column.
 */
export function summarize(
  entity: EntityKey,
  records: Record<string, string>[],
  mapping: Record<string, string | null>
): { summary: RowsSummary; rows: ValidatedRow[] } {
  const rows = records.map((r) => validateRow(entity, r, mapping));
  const errorsByColumn: Record<string, number> = {};
  let ok = 0;
  let withErrors = 0;
  for (const r of rows) {
    if (r.errors.length === 0) ok += 1;
    else withErrors += 1;
    for (const e of r.errors) {
      if (e.field) {
        errorsByColumn[e.field] = (errorsByColumn[e.field] ?? 0) + 1;
      }
    }
  }
  return {
    summary: { total: rows.length, ok, withErrors, errorsByColumn },
    rows,
  };
}
