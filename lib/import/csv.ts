/* ─────────────────────────────────────────────────────────────────────────
 * Tiny RFC 4180-ish CSV parser. Deliberately no dependency.
 *
 * - Handles quoted fields containing commas, line breaks, and `""` escapes.
 * - Auto-detects delimiter from the first line (comma, semicolon, tab).
 * - First row is the header. Returns `{ headers, rows, total }`.
 * - Caller is expected to cap input size (see MAX_BYTES / MAX_ROWS).
 *
 * The parser produces strings only — no type-coercion. The validator
 * pass handles dates / numbers / enums separately so the user can see
 * the raw value next to the error message.
 * ───────────────────────────────────────────────────────────────────── */

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ROWS = 50_000;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** Total data rows (excluding the header). May exceed `rows.length` if `previewRows` capped it. */
  total: number;
  /** Detected delimiter. */
  delimiter: "," | ";" | "\t";
}

const DELIMS = [",", ";", "\t"] as const;

/**
 * Detect the most likely delimiter by counting occurrences in the first
 * line (outside of quotes). Tie-breaks favour comma > semicolon > tab.
 */
function detectDelimiter(text: string): "," | ";" | "\t" {
  // Look only at the first ~2KB to keep this fast on huge inputs.
  const sample = text.slice(0, 2048);
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "\n" && !inQuotes) break;
    if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) {
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
  }
  let best: "," | ";" | "\t" = ",";
  let bestCount = -1;
  for (const d of DELIMS) {
    if ((counts[d] ?? 0) > bestCount) {
      bestCount = counts[d] ?? 0;
      best = d;
    }
  }
  return best;
}

export interface ParseOptions {
  /** If set, only the first N data rows are returned. `total` still counts everything. */
  previewRows?: number;
  /** Override delimiter detection. */
  delimiter?: "," | ";" | "\t";
}

/**
 * Parse a CSV string. Returns headers + rows. Strips a leading UTF-8 BOM.
 * Throws on size / row caps so callers can surface a clear error.
 */
export function parseCsv(input: string, opts: ParseOptions = {}): ParsedCsv {
  if (input.length > MAX_BYTES) {
    throw new Error(
      `csv_too_large: file exceeds ${Math.round(MAX_BYTES / 1024 / 1024)}MB cap`
    );
  }

  // Strip BOM if present.
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delimiter = opts.delimiter ?? detectDelimiter(text);
  const headers: string[] = [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let total = 0;
  let headerDone = false;
  const cap = opts.previewRows ?? Number.POSITIVE_INFINITY;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (!headerDone) {
      for (const h of row) headers.push(h.trim());
      headerDone = true;
    } else {
      // Skip wholly empty lines.
      const allEmpty = row.every((v) => v === "");
      if (!allEmpty) {
        total += 1;
        if (rows.length < cap) rows.push(row);
        if (total > MAX_ROWS) {
          throw new Error(
            `csv_too_many_rows: file exceeds ${MAX_ROWS} row cap`
          );
        }
      }
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Doubled quote → literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === "\r") {
      // Swallow CR; LF will close the row.
      if (text[i + 1] === "\n") continue;
      pushField();
      pushRow();
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }

  // Trailing field / row (no final newline).
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return { headers, rows, total, delimiter };
}

/**
 * Convenience: convert a parsed row-array into `Record<header, value>`,
 * trimming each value. Used by importers + previewers.
 */
export function rowsToRecords(
  headers: string[],
  rows: string[][]
): Record<string, string>[] {
  return rows.map((r) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]] = (r[i] ?? "").trim();
    }
    return rec;
  });
}
