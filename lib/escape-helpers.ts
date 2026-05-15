/* Escape helpers for the three contexts where untrusted strings get
 * interpolated into structured values:
 *
 *   1. SQL `LIKE` / `ILIKE` patterns — `%` and `_` are wildcards, `\` is
 *      the escape char. Without escaping, a single `%` from a search box
 *      turns into "match everything". Use escapeForLike.
 *
 *   2. PostgREST `.or()` filter strings — the syntax is
 *      `col.op.value,col.op.value`. A `,` or `(` in the value silently
 *      breaks the parser and lets a caller smuggle in extra clauses.
 *      Strip the structural characters before interpolating. The
 *      surrounding `%` characters for an ilike pattern stay on the
 *      OUTSIDE of the value; pass the value through escapeForLike first
 *      and then through escapeForOr.
 *
 *   3. CSV cells — Excel/Numbers/LibreOffice will execute a cell value
 *      that starts with `=`, `@`, `+`, `-`, or `\t` as a formula on
 *      open. Prefix those cells with a literal apostrophe so the
 *      spreadsheet treats them as text, then apply standard CSV quoting
 *      for embedded `"`, `,`, `\n`, `\r`. Use escapeCsvCell on every
 *      stringified cell value before joining with `,`.
 *
 * Keep this file pure (no `server-only`, no async, no imports) so it
 * can be used from any layer.
 */

/** Escape `%`, `_`, and `\` for use inside a SQL LIKE/ILIKE pattern. */
export function escapeForLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Strip the characters that have structural meaning inside a PostgREST
 * `.or()` filter string. Use ONLY on the value half of a
 * `column.op.value` clause — never on the column name or operator.
 *
 * Removes: `,` `(` `)` `*` `\n` `\r` `\0`.
 */
export function escapeForOr(s: string): string {
  return s.replace(/[,()*\n\r\0]/g, "");
}

/**
 * Escape a single value for inclusion as a CSV cell.
 *
 *   - Defangs formula-injection: a cell starting with `=`, `@`, `+`,
 *     `-`, or a literal tab gets prefixed with `'` (a real apostrophe,
 *     not a smart quote) before any further quoting.
 *   - Standard CSV: if the value contains `"`, `,`, `\n`, or `\r`, the
 *     whole cell is wrapped in `"..."` and any inner `"` is doubled.
 *
 * Returns the cell as it should appear in the row, comma-joined with
 * its neighbours.
 */
export function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : String(v);
  if (s.length > 0 && /^[=@+\-\t]/.test(s)) {
    s = `'${s}`;
  }
  if (/["\n\r,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
