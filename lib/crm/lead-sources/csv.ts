/* ─────────────────────────────────────────────────────────────────────────
 * Tiny RFC 4180 CSV parser. No deps.
 *
 *   - Handles quoted fields with embedded commas, newlines, and `""` escapes.
 *   - Auto-detects CRLF / LF.
 *   - Returns `{ headers, rows }` where each row is a Record<header, value>.
 *   - Caps row count via `maxRows`; rows beyond the cap are silently dropped
 *     (caller surfaces the truncation count).
 *
 * Not a full streaming parser — fine for our 5k-row import budget. The
 * lead-sources CSV import endpoint reads the file into memory anyway
 * because we need to validate + map column-by-column before any insert.
 * ───────────────────────────────────────────────────────────────────── */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /** Total rows present in the source (before maxRows truncation). */
  totalRows: number;
}

export function parseCsv(input: string, maxRows = 5000): ParsedCsv {
  // Strip a UTF-8 BOM if present — Excel and a lot of Windows tooling
  // emit it and it would otherwise leak into the first header name.
  const src =
    input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const cells: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && src[i + 1] === '"') {
          // Escaped quote inside a quoted field.
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // CRLF or lone CR — both terminate a row.
      row.push(cell);
      cells.push(row);
      row = [];
      cell = "";
      i++;
      if (i < n && src[i] === "\n") i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cells.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Flush trailing cell/row (file without a final newline).
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    cells.push(row);
  }

  // Drop trailing empty rows (a single empty string from a trailing newline).
  while (
    cells.length > 0 &&
    cells[cells.length - 1].length === 1 &&
    cells[cells.length - 1][0] === ""
  ) {
    cells.pop();
  }

  if (cells.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = cells[0].map((h) => h.trim());
  const dataRows = cells.slice(1);
  const totalRows = dataRows.length;
  const sliced = dataRows.slice(0, maxRows);
  const rows: Record<string, string>[] = sliced.map((r) => {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = (r[c] ?? "").trim();
    }
    return obj;
  });

  return { headers, rows, totalRows };
}
