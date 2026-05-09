import "server-only";

/**
 * Shared helpers for the admin database browser + SQL runner.
 *
 * Two execution paths:
 *  1. Service-role Supabase client (`createAdminClient()`) — used for
 *     reads against `public.*` tables (table viewer, table list).
 *  2. Supabase Management API (`/v1/projects/{ref}/database/query`) —
 *     used for the SQL runner because the service-role client doesn't
 *     expose a generic SQL endpoint. Token is `SUPABASE_ACCESS_TOKEN`.
 *
 * Both paths assume the caller already passed `assertAdmin()`.
 */

const PROJECT_REF = "your-supabase-project-ref";

const MGMT_BASE = "https://api.supabase.com";

/* ──────────────────── safe-SELECT gate ──────────────────── */

/**
 * Strip leading whitespace + `/* ... *\/` block comments + `--` line
 * comments from the head of a SQL string until the first non-comment,
 * non-whitespace token. Returns the cleaned remainder.
 *
 * We then check that the cleaned remainder starts with `select` (case
 * insensitive). This is intentionally strict: anything else (insert,
 * update, delete, drop, alter, with, set, truncate, copy, …) is
 * rejected. We also reject statement-stacking by requiring the SQL,
 * after stripping a single trailing `;`, contain no further `;`
 * outside of string literals.
 */
export function assertSelectOnly(sql: string): void {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new Error("SQL is empty.");
  }

  let i = 0;
  const s = sql;
  while (i < s.length) {
    const ch = s[i];
    // whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    // /* … */
    if (ch === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      if (end === -1) {
        throw new Error("Unterminated block comment in SQL.");
      }
      i = end + 2;
      continue;
    }
    // -- line comment
    if (ch === "-" && s[i + 1] === "-") {
      const eol = s.indexOf("\n", i + 2);
      i = eol === -1 ? s.length : eol + 1;
      continue;
    }
    break;
  }

  const head = s.slice(i, i + 6).toLowerCase();
  if (head !== "select") {
    throw new Error(
      "Only SELECT queries are allowed. Statement must begin with SELECT."
    );
  }
  // The character after `select` must be whitespace, `(`, or end-of-string.
  // This blocks identifiers like `selectall_from_users()`.
  const next = s[i + 6];
  if (next !== undefined && next !== " " && next !== "\t" && next !== "\n" && next !== "\r" && next !== "(") {
    throw new Error(
      "Only SELECT queries are allowed. Statement must begin with SELECT."
    );
  }

  // Reject statement stacking: scan the body for `;` outside of string
  // literals. A single trailing `;` is fine.
  let inSingle = false;
  let inDouble = false;
  let inDollar = false;
  let dollarTag = "";
  for (let j = i; j < s.length; j += 1) {
    const c = s[j];
    if (inSingle) {
      if (c === "'") {
        if (s[j + 1] === "'") {
          j += 1;
          continue;
        }
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (c === '"') inDouble = false;
      continue;
    }
    if (inDollar) {
      if (c === "$" && s.slice(j, j + dollarTag.length) === dollarTag) {
        j += dollarTag.length - 1;
        inDollar = false;
        dollarTag = "";
      }
      continue;
    }
    if (c === "'") {
      inSingle = true;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      continue;
    }
    if (c === "$") {
      // Match $tag$ … $tag$
      const m = /^\$[A-Za-z_]*\$/.exec(s.slice(j));
      if (m) {
        dollarTag = m[0];
        inDollar = true;
        j += m[0].length - 1;
      }
      continue;
    }
    if (c === ";") {
      // Allow only if the rest of the string is whitespace/comments.
      const rest = s.slice(j + 1);
      if (/^\s*(?:--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*$/.test(rest)) {
        return;
      }
      throw new Error(
        "Statement stacking is not allowed. Submit one SELECT at a time."
      );
    }
  }
}

/* ──────────────────── Management API exec ──────────────────── */

export type ExecResult = {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  rowCount: number;
  durationMs: number;
};

/**
 * Execute arbitrary SQL via the Supabase Management API. The caller is
 * responsible for `assertSelectOnly()` on user-supplied SQL — this
 * helper itself does NOT enforce read-only because the schema browser
 * uses it for `information_schema.*` queries (which are SELECTs anyway,
 * but we don't want to double-validate trusted internal queries).
 */
export async function execManagementSql(sql: string): Promise<ExecResult> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is not configured on the server.");
  }
  const t0 = Date.now();
  const res = await fetch(
    `${MGMT_BASE}/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      cache: "no-store",
    }
  );
  const durationMs = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      msg = j.message ?? j.error ?? text;
    } catch {
      // keep raw text
    }
    throw new Error(`Management API: ${msg.slice(0, 500)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Management API returned non-JSON response.");
  }
  // Newer responses are a plain array of rows. Older ones may wrap as
  // `{ result: [...] }`. Defensive on both.
  let rows: Array<Record<string, unknown>>;
  if (Array.isArray(parsed)) {
    rows = parsed as Array<Record<string, unknown>>;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    Array.isArray((parsed as { result: unknown }).result)
  ) {
    rows = (parsed as { result: Array<Record<string, unknown>> }).result;
  } else {
    rows = [];
  }
  // Build a stable column list. Fall back to first row's keys; otherwise empty.
  const columns: string[] = (() => {
    if (rows.length === 0) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }
    return out;
  })();
  return { rows, columns, rowCount: rows.length, durationMs };
}

/* ──────────────────── Identifier validation ──────────────────── */

/**
 * Whitelist a Postgres identifier (table name, column name) before we
 * splice it into a SQL string. The Management API doesn't take bind
 * parameters — we have to interpolate. So: only allow lowercase letters,
 * digits, and underscore, max 63 chars (Postgres limit).
 */
export function validateIdent(ident: string): string {
  if (typeof ident !== "string" || ident.length === 0) {
    throw new Error("Identifier is empty.");
  }
  if (ident.length > 63) {
    throw new Error("Identifier is too long.");
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(ident)) {
    throw new Error(`Invalid identifier: ${ident}`);
  }
  return ident;
}

/* ──────────────────── Cell rendering helpers ──────────────────── */

export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/* ──────────────────── CSV ──────────────────── */

export function rowsToCsv(
  rows: Array<Record<string, unknown>>,
  columns: string[]
): string {
  if (columns.length === 0) return "";
  const header = columns.map(csvCell).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => csvCell(formatCellForCsv(row[c])))
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function formatCellForCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* ──────────────────── Column type categorization ──────────────────── */

const TEXT_TYPES = new Set([
  "text",
  "character varying",
  "varchar",
  "character",
  "char",
  "citext",
  "name",
]);

const NUMERIC_TYPES = new Set([
  "smallint",
  "integer",
  "bigint",
  "numeric",
  "decimal",
  "real",
  "double precision",
]);

export type ColumnFilterKind = "text" | "numeric" | "boolean" | "uuid" | "none";

export function filterKindForColumn(dataType: string): ColumnFilterKind {
  const t = dataType.toLowerCase();
  if (TEXT_TYPES.has(t)) return "text";
  if (NUMERIC_TYPES.has(t)) return "numeric";
  if (t === "boolean") return "boolean";
  if (t === "uuid") return "uuid";
  return "none";
}

/**
 * SQL-quote a literal string with single quotes. We use this for filter
 * values that we splice in (Management API has no parameter binding).
 * The backslash escape covers `'` and `\` if `standard_conforming_strings`
 * is off (Postgres default-on, but defensive).
 */
export function quoteLiteral(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
