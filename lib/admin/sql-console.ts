import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BLOCKED_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "truncate",
  "alter",
  "create",
  "grant",
  "revoke",
  "call",
  "do",
  "copy",
  "merge",
  "comment",
  "vacuum",
  "analyze",
  "reindex",
  "cluster",
  "security",
];

export type SqlCheck = {
  ok: boolean;
  error?: string;
  cleaned?: string;
  limit?: number;
};

/**
 * Validate that the query is a read-only SELECT with LIMIT ≤ 1000 and no
 * blocked keywords, no multi-statement semicolons.
 */
export function validateSelect(raw: string): SqlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Empty query" };

  // Strip trailing semicolon but reject internal semicolons.
  const noTrailing = trimmed.replace(/;+\s*$/, "");
  if (/;/.test(noTrailing)) {
    return { ok: false, error: "Multiple statements are not allowed" };
  }

  // Remove comments for keyword scan.
  const sanitized = noTrailing
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  const lower = sanitized.toLowerCase();

  // Must start with select (or "with ... select").
  if (!/^\s*(select|with)\b/.test(lower)) {
    return { ok: false, error: "Only SELECT (or WITH … SELECT) is allowed" };
  }

  // Block dangerous keywords on word boundaries.
  for (const kw of BLOCKED_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(sanitized)) {
      return { ok: false, error: `Blocked keyword: ${kw.toUpperCase()}` };
    }
  }

  // Extract LIMIT. Must exist and be <= 1000.
  const limitMatch = lower.match(/\blimit\s+(\d+)\b/);
  if (!limitMatch) {
    return { ok: false, error: "Query must include LIMIT (max 1000)" };
  }
  const lim = parseInt(limitMatch[1], 10);
  if (Number.isNaN(lim) || lim < 1 || lim > 1000) {
    return { ok: false, error: "LIMIT must be between 1 and 1000" };
  }

  return { ok: true, cleaned: noTrailing, limit: lim };
}

export type SqlRunResult = {
  ok: boolean;
  rows?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  durationMs?: number;
  error?: string;
};

/**
 * Executes the query via a Postgres RPC named `admin_exec_select` if present,
 * else returns an informative error. The RPC must be created by the admin
 * manually (documented in the admin SQL page help text) — we don't want to
 * ship the raw SQL executor in a migration.
 */
export async function runSelect(sql: string): Promise<SqlRunResult> {
  const check = validateSelect(sql);
  if (!check.ok || !check.cleaned) {
    return { ok: false, error: check.error || "Validation failed" };
  }
  const sb = createAdminClient();
  const start = Date.now();
  try {
    const { data, error } = await sb.rpc("admin_exec_select", {
      query: check.cleaned,
    });
    const durationMs = Date.now() - start;
    if (error) {
      return { ok: false, error: error.message, durationMs };
    }
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      ok: true,
      rows,
      columns,
      rowCount: rows.length,
      durationMs,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "RPC admin_exec_select not found. See help on the SQL page.",
      durationMs: Date.now() - start,
    };
  }
}

export async function logSqlQuery(entry: {
  admin_email: string;
  query: string;
  row_count?: number;
  duration_ms?: number;
  status: "ok" | "error" | "blocked";
  error_message?: string;
}): Promise<void> {
  try {
    const sb = createAdminClient();
    await sb.from("admin_sql_queries").insert({
      admin_email: entry.admin_email,
      query: entry.query,
      row_count: entry.row_count ?? null,
      duration_ms: entry.duration_ms ?? null,
      status: entry.status,
      error_message: entry.error_message ?? null,
    });
  } catch (e) {
    console.error("[sql-console] log failed:", e);
  }
}

export async function recentQueries(limit = 20): Promise<
  Array<{
    id: number;
    admin_email: string;
    query: string;
    row_count: number | null;
    duration_ms: number | null;
    status: string;
    created_at: string;
  }>
> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("admin_sql_queries")
      .select("id, admin_email, query, row_count, duration_ms, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return data as Array<{
      id: number;
      admin_email: string;
      query: string;
      row_count: number | null;
      duration_ms: number | null;
      status: string;
      created_at: string;
    }>;
  } catch {
    return [];
  }
}
