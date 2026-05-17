/* ─────────────────────────────────────────────────────────────────────────
 * Auto-mapping: given a list of CSV headers and an entity, produce a
 * best-guess mapping from header → schema column name. Returns a
 * `Record<header, targetField | null>` so the UI can pre-populate
 * dropdowns. A null means "user must map this manually (or skip)".
 *
 * The heuristic is alias-based + light fuzzy. Order:
 *   1. exact case-insensitive alias match
 *   2. trimmed + whitespace-collapsed alias match
 *   3. snake_case-normalised match against the column `name`
 * ───────────────────────────────────────────────────────────────────── */

import type { EntityKey, ImportColumn } from "./schemas";
import { SCHEMAS } from "./schemas";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s\-_/]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
}

function snakeize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s\-/]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "");
}

/**
 * Build an index of `normalized alias → column` for fast lookup. Includes
 * the column's own `name` (snake_case) and `label` as implicit aliases.
 */
function buildIndex(cols: readonly ImportColumn[]): Map<string, ImportColumn> {
  const idx = new Map<string, ImportColumn>();
  for (const col of cols) {
    const candidates = new Set<string>();
    for (const a of col.aliases) candidates.add(normalize(a));
    candidates.add(normalize(col.name));
    candidates.add(normalize(col.label));
    candidates.add(snakeize(col.name));
    for (const c of candidates) {
      // First match wins so the canonical column for an alias stays stable.
      if (c && !idx.has(c)) idx.set(c, col);
    }
  }
  return idx;
}

export interface AutoMapResult {
  /** header → target field name, or null if no confident match. */
  mapping: Record<string, string | null>;
  /** Target columns that *weren't* matched to any header. UI shows these in red. */
  unmappedRequired: ImportColumn[];
}

export function autoMap(
  entity: EntityKey,
  headers: string[]
): AutoMapResult {
  const cols = SCHEMAS[entity];
  const idx = buildIndex(cols);
  const mapping: Record<string, string | null> = {};
  const matchedTargets = new Set<string>();

  for (const h of headers) {
    const n = normalize(h);
    const s = snakeize(h);
    const hit = idx.get(n) ?? idx.get(s);
    if (hit && !matchedTargets.has(hit.name)) {
      // Don't double-assign the same target to multiple headers; the
      // second header gets `null` so the user picks consciously.
      mapping[h] = hit.name;
      matchedTargets.add(hit.name);
    } else {
      mapping[h] = null;
    }
  }

  const unmappedRequired = cols.filter(
    (c) => c.required && !matchedTargets.has(c.name)
  );

  return { mapping, unmappedRequired };
}
