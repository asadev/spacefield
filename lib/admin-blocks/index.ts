import "server-only";

import { createClient } from "@/lib/supabase/server";
import { renderMarkdown } from "@/app/admin/help/_markdown";

/**
 * Server-side executors for the admin custom-page block library.
 *
 * Each block kind has a `config` jsonb. These functions take that config,
 * pull data, and return shaped output that <BlockRenderer> can paint.
 *
 * SQL safety: every SELECT-driving block runs through `validateSelectSql`
 * — no DDL, no DML, only `select` or `with`. We trust the markdown body
 * to be admin-authored.
 *
 * Execution path: we call `supabase.rpc('exec_admin_sql', { query })`
 * (migration 20260509f). The RPC is `security definer`, gated on
 * `admin_caller_is_admin()`, and rejects anything that isn't a single
 * SELECT/WITH (text-level). If that RPC isn't yet registered we fall
 * back to `admin_exec_select(query)` (the alias). If neither responds,
 * we return a placeholder shape that the renderer will display as a
 * "set up admin SQL exec" hint instead of throwing.
 *
 * IMPORTANT: we use the user-scoped Supabase client (`createClient` from
 * lib/supabase/server) rather than the service-role client. The RPC is
 * gated on `admin_caller_is_admin()` which reads `auth.uid()`. With the
 * service-role key auth.uid() is null and the function would throw
 * 'forbidden'. The /admin/* layout already gates non-admins so any user
 * reaching a block executor is already an admin.
 */

/* ───────────────────── SQL safety + dispatch ───────────────────── */

const SQL_BLOCKED_PREFIXES = [
  "insert", "update", "delete", "drop", "truncate", "alter", "create",
  "grant", "revoke", "call", "do", "copy", "merge", "comment", "vacuum",
  "analyze", "reindex", "cluster", "security",
];

export type SqlValidation =
  | { ok: true; cleaned: string }
  | { ok: false; error: string };

export function validateSelectSql(raw: unknown): SqlValidation {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: "Empty SQL" };

  // Strip trailing semicolons but reject internal ones (no chained statements).
  const noTrailing = s.replace(/;+\s*$/, "");
  if (/;/.test(noTrailing)) {
    return { ok: false, error: "Multiple statements are not allowed" };
  }

  // Strip line + block comments before we test the leading keyword. Then
  // require the *first non-whitespace token* to be `select` or `with`.
  const sanitized = noTrailing
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const lower = sanitized.toLowerCase();

  if (!/^\s*(select|with)\b/.test(lower)) {
    return {
      ok: false,
      error: "Only SELECT (or WITH … SELECT) queries are allowed",
    };
  }

  for (const kw of SQL_BLOCKED_PREFIXES) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(sanitized)) {
      return { ok: false, error: `Blocked keyword: ${kw.toUpperCase()}` };
    }
  }

  return { ok: true, cleaned: noTrailing };
}

type RawRow = Record<string, unknown>;

export type SqlDispatchResult =
  | { ok: true; rows: RawRow[]; durationMs: number }
  | { ok: false; error: string; placeholder?: boolean; durationMs: number };

/**
 * Each row of `setof jsonb` arrives from PostgREST as a flat object — i.e.
 * `[{a:1,b:2}, {a:3,b:4}]`. But supabase-js or future RPC shapes might
 * wrap each row under the function name (`{exec_admin_sql: {...}}`) when
 * coming through other paths. This helper accepts either shape.
 */
function unwrapJsonbRow(row: unknown): RawRow {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    const obj = row as Record<string, unknown>;
    const keys = Object.keys(obj);
    // setof-jsonb single-column wrap: {to_jsonb: {...}} or {<fn_name>: {...}}
    if (keys.length === 1) {
      const inner = obj[keys[0]];
      if (
        inner &&
        typeof inner === "object" &&
        !Array.isArray(inner) &&
        (keys[0] === "to_jsonb" ||
          keys[0] === "exec_admin_sql" ||
          keys[0] === "admin_exec_select")
      ) {
        return inner as RawRow;
      }
    }
    return obj as RawRow;
  }
  return {};
}

/**
 * Run a validated SELECT via the user-scoped Supabase client. Tries
 * `exec_admin_sql` first (canonical RPC from migration 20260509f); falls
 * back to `admin_exec_select` (alias). The RPC is `security definer`, the
 * admin check is enforced inside the function via `admin_caller_is_admin()`.
 *
 * If neither RPC is registered we return a placeholder result so the
 * renderer can show a helpful hint instead of breaking the whole page.
 */
export async function runAdminSelect(sql: string): Promise<SqlDispatchResult> {
  const v = validateSelectSql(sql);
  if (!v.ok) {
    return { ok: false, error: v.error, durationMs: 0 };
  }

  const sb = await createClient();
  const start = Date.now();

  // Try the canonical RPC first. Param is named `query` per migration
  // 20260509f_exec_admin_sql.sql.
  try {
    const r1 = await sb.rpc("exec_admin_sql", { query: v.cleaned });
    if (!r1.error) {
      const rows = Array.isArray(r1.data)
        ? (r1.data as unknown[]).map(unwrapJsonbRow)
        : [];
      return { ok: true, rows, durationMs: Date.now() - start };
    }
    // If the function isn't registered we get a 404-ish PGRST error —
    // fall through to the legacy name.
    const msg1 = (r1.error.message ?? "").toLowerCase();
    if (!/function|does not exist|not found|undefined/.test(msg1)) {
      return {
        ok: false,
        error: r1.error.message,
        durationMs: Date.now() - start,
      };
    }
  } catch {
    /* fall through to legacy */
  }

  try {
    const r2 = await sb.rpc("admin_exec_select", { query: v.cleaned });
    if (!r2.error) {
      const rows = Array.isArray(r2.data)
        ? (r2.data as unknown[]).map(unwrapJsonbRow)
        : [];
      return { ok: true, rows, durationMs: Date.now() - start };
    }
    const msg2 = (r2.error.message ?? "").toLowerCase();
    if (!/function|does not exist|not found|undefined/.test(msg2)) {
      return {
        ok: false,
        error: r2.error.message,
        durationMs: Date.now() - start,
      };
    }
  } catch {
    /* fall through to placeholder */
  }

  return {
    ok: false,
    placeholder: true,
    error:
      "No admin SQL executor RPC registered. Create `exec_admin_sql(query text)` (or `admin_exec_select(query text)`) returning setof jsonb.",
    durationMs: Date.now() - start,
  };
}

/* ─────────────────────── KPI block ─────────────────────── */

export type KpiBlockConfig = {
  sql?: string;
  label?: string;
  format?: "number" | "currency" | "percent";
  currency?: string;
};

export type KpiResult = {
  ok: boolean;
  value: number | null;
  label: string;
  format: "number" | "currency" | "percent";
  currency: string;
  error?: string;
  placeholder?: boolean;
};

export async function executeKpiBlock(
  config: KpiBlockConfig
): Promise<KpiResult> {
  const label = String(config.label ?? "").trim() || "KPI";
  const format = (config.format === "currency" || config.format === "percent")
    ? config.format
    : "number";
  const currency = String(config.currency ?? "USD").trim() || "USD";

  const sql = String(config.sql ?? "").trim();
  if (!sql) {
    return {
      ok: false,
      value: null,
      label,
      format,
      currency,
      error: "Missing SQL.",
    };
  }

  const r = await runAdminSelect(sql);
  if (!r.ok) {
    return {
      ok: false,
      value: null,
      label,
      format,
      currency,
      error: r.error,
      placeholder: r.placeholder,
    };
  }

  // Pull the first numeric value from the first row (any column).
  const first = r.rows[0];
  if (!first) {
    return { ok: true, value: null, label, format, currency };
  }
  const cols = Object.values(first);
  const found = cols.find((v) => typeof v === "number" && Number.isFinite(v));
  const value =
    typeof found === "number"
      ? found
      : Number.isFinite(Number(cols[0]))
        ? Number(cols[0])
        : null;

  return { ok: true, value, label, format, currency };
}

/* ─────────────────────── Table block ─────────────────────── */

export type TableColumn = {
  key: string;
  label?: string;
  format?: "number" | "currency" | "percent" | "date" | "datetime" | "text";
};

export type TableBlockConfig = {
  sql?: string;
  columns?: TableColumn[];
};

export type TableResult = {
  ok: boolean;
  columns: TableColumn[];
  rows: RawRow[];
  error?: string;
  placeholder?: boolean;
};

export async function executeTableBlock(
  config: TableBlockConfig
): Promise<TableResult> {
  const sql = String(config.sql ?? "").trim();
  if (!sql) {
    return { ok: false, columns: [], rows: [], error: "Missing SQL." };
  }

  const r = await runAdminSelect(sql);
  if (!r.ok) {
    return {
      ok: false,
      columns: [],
      rows: [],
      error: r.error,
      placeholder: r.placeholder,
    };
  }

  // If the admin defined columns, use those; otherwise infer from row keys.
  let columns: TableColumn[] = Array.isArray(config.columns)
    ? config.columns.filter((c) => c && typeof c.key === "string")
    : [];
  if (columns.length === 0 && r.rows[0]) {
    columns = Object.keys(r.rows[0]).map((k) => ({ key: k, label: k }));
  }

  return { ok: true, columns, rows: r.rows };
}

/* ─────────────────────── Chart block ─────────────────────── */

export type ChartBlockConfig = {
  sql?: string;
  x?: string;
  y?: string[];
  chart_type?: "line" | "bar";
};

export type ChartResult = {
  ok: boolean;
  x: string[];
  series: { label: string; values: number[] }[];
  chart_type: "line" | "bar";
  error?: string;
  placeholder?: boolean;
};

export async function executeChartBlock(
  config: ChartBlockConfig
): Promise<ChartResult> {
  const sql = String(config.sql ?? "").trim();
  const xKey = String(config.x ?? "").trim();
  const yKeys = Array.isArray(config.y)
    ? config.y.map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
  const chartType: "line" | "bar" =
    config.chart_type === "bar" ? "bar" : "line";

  if (!sql || !xKey || yKeys.length === 0) {
    return {
      ok: false,
      x: [],
      series: [],
      chart_type: chartType,
      error: "Need SQL, x column, and at least one y column.",
    };
  }

  const r = await runAdminSelect(sql);
  if (!r.ok) {
    return {
      ok: false,
      x: [],
      series: [],
      chart_type: chartType,
      error: r.error,
      placeholder: r.placeholder,
    };
  }

  const x = r.rows.map((row) => String(row[xKey] ?? ""));
  const series = yKeys.map((key) => ({
    label: key,
    values: r.rows.map((row) => {
      const v = Number(row[key]);
      return Number.isFinite(v) ? v : 0;
    }),
  }));

  return { ok: true, x, series, chart_type: chartType };
}

/* ─────────────────────── Markdown block ─────────────────────── */

export type MarkdownBlockConfig = {
  body?: string;
};

export type MarkdownResult = {
  html: string;
};

export async function executeMarkdownBlock(
  config: MarkdownBlockConfig
): Promise<MarkdownResult> {
  const body = String(config.body ?? "");
  return { html: renderMarkdown(body) };
}

/* ─────────────────────── Format helpers (shared with renderer) ─────────────────────── */

export function formatKpiValue(
  value: number | null,
  format: "number" | "currency" | "percent",
  currency = "USD"
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (format === "percent") {
    return `${(value * (Math.abs(value) <= 1 ? 100 : 1)).toFixed(1)}%`;
  }
  if (format === "currency") {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${currency} ${value.toLocaleString()}`;
    }
  }
  return value.toLocaleString();
}

export function formatTableCell(value: unknown, fmt?: TableColumn["format"]): string {
  if (value === null || value === undefined) return "—";
  if (fmt === "number" && typeof value === "number")
    return value.toLocaleString();
  if (fmt === "currency" && typeof value === "number")
    return formatKpiValue(value, "currency");
  if (fmt === "percent" && typeof value === "number")
    return formatKpiValue(value, "percent");
  if (fmt === "date" && (typeof value === "string" || typeof value === "number")) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  if (fmt === "datetime" && (typeof value === "string" || typeof value === "number")) {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toISOString().replace("T", " ").slice(0, 16);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
