#!/usr/bin/env -S pnpm tsx
/* eslint-disable no-console */

/**
 * Database growth projection.
 *
 * Generates `docs/database/GROWTH-PROJECTION.md` — a forecast of row
 * count and on-disk size at 6 and 12 months out, per public table.
 *
 * Inputs:
 *   - `public.table_sizes` view (current row estimate + on-disk bytes)
 *   - `public.slow_query_snapshots` over the last 30 days (proxy for
 *     write velocity — when row estimates aren't preserved historically
 *     we use the call counts on insert-shaped queries to bias growth)
 *
 * Methodology — deliberately humble:
 *   1. Pull current row estimate + bytes from `table_sizes`.
 *   2. Look at how many INSERT-like statements landed against each
 *      table in the last 30 days (via slow_query_snapshots).
 *   3. Compute "writes per day" = (insert calls / 30).
 *   4. Project forward:
 *        future_rows = current_rows + writes_per_day * days
 *        future_bytes = current_bytes * (future_rows / current_rows)
 *      (bytes scale linearly with rows; not perfect but good enough
 *      to spot the tables that'll need partitioning / pruning.)
 *
 * The script is idempotent — running it overwrites the markdown.
 *
 *   pnpm tsx scripts/db-growth-projection.ts
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded from
 *   .env.local automatically by `next-env`-style runtimes — for the
 *   raw `tsx` invocation we read them via process.env, so source them
 *   beforehand: `source credentials/spacefield-env.sh && pnpm tsx ...`).
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const PROJECT_ROOT = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(PROJECT_ROOT, "docs/database/GROWTH-PROJECTION.md");

/** How many days of slow_query_snapshots to consider. */
const WINDOW_DAYS = 30;
/** Projection horizons (in days). */
const HORIZONS = [
  { label: "6 months", days: 183 },
  { label: "12 months", days: 365 },
];

interface TableSizeRow {
  schema_name: string;
  table_name: string;
  total_bytes: number;
  total_pretty: string;
  row_estimate: number;
}

interface SnapshotRow {
  query: string;
  calls: number;
  captured_at: string;
}

interface TableProjection {
  table: string;
  current_rows: number;
  current_bytes: number;
  writes_per_day: number;
  rows_at: Record<string, number>;
  bytes_at: Record<string, number>;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
        "Source credentials/spacefield-env.sh and retry."
    );
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("• Reading table_sizes…");
  const { data: sizeRows, error: sizeErr } = await supabase
    .from("table_sizes")
    .select("schema_name, table_name, total_bytes, total_pretty, row_estimate");
  if (sizeErr) {
    console.error("table_sizes query failed:", sizeErr.message);
    process.exit(2);
  }
  const sizes = (sizeRows ?? []) as TableSizeRow[];
  console.log(`  ${sizes.length} tables.`);

  console.log("• Reading slow_query_snapshots…");
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data: snapRows, error: snapErr } = await supabase
    .from("slow_query_snapshots")
    .select("query, calls, captured_at")
    .gte("captured_at", since)
    .order("captured_at", { ascending: false })
    .limit(50_000);
  if (snapErr) {
    console.warn(
      "slow_query_snapshots query failed (forecasts will assume 0 writes/day):",
      snapErr.message
    );
  }
  const snaps = (snapRows ?? []) as SnapshotRow[];
  console.log(`  ${snaps.length} snapshot rows over ${WINDOW_DAYS}d.`);

  // Aggregate insert-like calls per table.
  const insertsPerTable = aggregateInsertCalls(snaps);

  // Build projections.
  const projections: TableProjection[] = sizes
    .map((row) => {
      const calls = insertsPerTable.get(row.table_name) ?? 0;
      const writesPerDay = calls / WINDOW_DAYS;
      const rowsAt: Record<string, number> = {};
      const bytesAt: Record<string, number> = {};
      for (const h of HORIZONS) {
        const futureRows = Math.max(
          0,
          row.row_estimate + Math.round(writesPerDay * h.days)
        );
        const scale =
          row.row_estimate > 0 ? futureRows / row.row_estimate : 1;
        rowsAt[h.label] = futureRows;
        bytesAt[h.label] = Math.round(row.total_bytes * scale);
      }
      return {
        table: row.table_name,
        current_rows: row.row_estimate,
        current_bytes: row.total_bytes,
        writes_per_day: writesPerDay,
        rows_at: rowsAt,
        bytes_at: bytesAt,
      };
    })
    .sort((a, b) => {
      // Sort by projected 12mo bytes (where growth pain materialises).
      const bMonth = HORIZONS[HORIZONS.length - 1].label;
      return (b.bytes_at[bMonth] ?? 0) - (a.bytes_at[bMonth] ?? 0);
    });

  console.log("• Writing markdown…");
  mkdirSyncIfMissing(dirname(OUTPUT_PATH));
  const md = renderMarkdown(projections);
  writeFileSync(OUTPUT_PATH, md, "utf8");
  console.log(`  wrote ${OUTPUT_PATH} (${projections.length} rows).`);
}

/**
 * Walk slow-query snapshots and count `insert into <table>` matches.
 * Counts include UPDATE/DELETE roughly because we want a "total write
 * pressure" number, not strictly inserts — UPDATEs that affect TOAST
 * still impact on-disk size and HOT churn.
 *
 * Snapshots are weekly-cumulative, so we use the MAX (latest) per
 * (query prefix) bucket to avoid double-counting overlapping captures.
 */
function aggregateInsertCalls(snaps: SnapshotRow[]): Map<string, number> {
  const insertRe =
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?["]?(\w+)["]?/i;
  // Bucket by (query-prefix → max calls observed) so re-captures of
  // the same statement don't multiply.
  const byPrefix = new Map<string, { table: string; calls: number }>();
  for (const s of snaps) {
    const match = insertRe.exec(s.query);
    if (!match) continue;
    const table = match[1].toLowerCase();
    const prefixKey = s.query.slice(0, 200);
    const existing = byPrefix.get(prefixKey);
    const calls = Number(s.calls ?? 0);
    if (!existing || calls > existing.calls) {
      byPrefix.set(prefixKey, { table, calls });
    }
  }
  const out = new Map<string, number>();
  for (const { table, calls } of byPrefix.values()) {
    out.set(table, (out.get(table) ?? 0) + calls);
  }
  return out;
}

function renderMarkdown(rows: TableProjection[]): string {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];
  lines.push("# Database growth projection");
  lines.push("");
  lines.push(`> Generated ${generatedAt} by \`scripts/db-growth-projection.ts\`. Do not edit by hand — re-run the script.`);
  lines.push("");
  lines.push("## Methodology");
  lines.push("");
  lines.push(
    "Forecasts use the current `table_sizes` row estimate plus an INSERT/UPDATE/DELETE rate derived from the last 30 days of `slow_query_snapshots`. Bytes scale linearly with rows (rough, but it surfaces tables that need attention before they become problems). Tables not appearing in `slow_query_snapshots` show as 0 writes/day — that's a snapshot gap, not necessarily a write-quiet table."
  );
  lines.push("");
  lines.push(`## Top tables — projected 12-month size`);
  lines.push("");
  lines.push(
    "| Table | Current rows | Current size | Writes / day | Rows in 6mo | Size in 6mo | Rows in 12mo | Size in 12mo |"
  );
  lines.push(
    "|---|---:|---:|---:|---:|---:|---:|---:|"
  );
  for (const r of rows.slice(0, 50)) {
    lines.push(
      [
        `\`${r.table}\``,
        formatNumber(r.current_rows),
        formatBytes(r.current_bytes),
        formatNumber(Math.round(r.writes_per_day)),
        formatNumber(r.rows_at["6 months"] ?? 0),
        formatBytes(r.bytes_at["6 months"] ?? 0),
        formatNumber(r.rows_at["12 months"] ?? 0),
        formatBytes(r.bytes_at["12 months"] ?? 0),
      ].join(" | ")
    );
  }
  lines.push("");
  lines.push("## All tables (full list)");
  lines.push("");
  lines.push(
    "<details><summary>Click to expand</summary>"
  );
  lines.push("");
  lines.push(
    "| Table | Current rows | Current size | Writes / day |"
  );
  lines.push("|---|---:|---:|---:|");
  for (const r of rows) {
    lines.push(
      [
        `\`${r.table}\``,
        formatNumber(r.current_rows),
        formatBytes(r.current_bytes),
        formatNumber(Math.round(r.writes_per_day)),
      ].join(" | ")
    );
  }
  lines.push("");
  lines.push("</details>");
  lines.push("");
  return lines.join("\n");
}

function mkdirSyncIfMissing(dir: string): void {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const precision = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(precision)} ${units[i]}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
