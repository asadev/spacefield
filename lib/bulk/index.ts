import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { BulkOperationRow } from "@/app/admin/_types";

/**
 * Bulk-operations helper.
 *
 * Pattern:
 *   - Insert a `bulk_operations` row in status='running' before iterating.
 *   - Run callbacks with bounded concurrency (default 5) so we don't
 *     hammer downstream APIs.
 *   - Aggregate per-id results into `results` jsonb.
 *   - Update the row to status='completed' (or 'failed' if every call
 *     errored) at the end and stamp finished_at.
 *
 * Callers (typically server actions in /admin) are expected to have
 * already called `assertAdmin()` and `recordAdminAction(...)` for the
 * top-level "bulk.X.start" event. The helper itself does NOT call those
 * (it's a generic concurrency primitive, not an admin gate).
 */

export type BulkResultEntry = {
  id: string;
  ok: boolean;
  error?: string | null;
  /** Optional small payload returned by the run callback. Kept JSON-safe. */
  data?: unknown;
};

export interface RunBulkOpts {
  /** Verb identifying what's being done — e.g. "user.suspend". */
  operation: string;
  /** Kind of target — "user", "workspace", "agent", etc. */
  target_kind: string;
  /** Target ids to iterate. Order is preserved. */
  target_ids: string[];
  /** Async function invoked once per id. Should resolve to {ok, error?, data?}. */
  run: (id: string) => Promise<{ ok: boolean; error?: string | null; data?: unknown }>;
  /** Max concurrent runs. Default 5. */
  concurrency?: number;
  /** Optional actor uuid to stamp on the row. */
  actor_id?: string | null;
  /** Optional metadata blob recorded on the row. */
  metadata?: Record<string, unknown>;
}

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 25;
const DEFAULT_CONCURRENCY = 5;

function clampConcurrency(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return DEFAULT_CONCURRENCY;
  const n = Math.floor(value as number);
  if (n < MIN_CONCURRENCY) return MIN_CONCURRENCY;
  if (n > MAX_CONCURRENCY) return MAX_CONCURRENCY;
  return n;
}

/** Execute `run(id)` for every id with bounded concurrency. */
async function executeAll(
  ids: string[],
  run: (id: string) => Promise<{ ok: boolean; error?: string | null; data?: unknown }>,
  concurrency: number
): Promise<BulkResultEntry[]> {
  const results: BulkResultEntry[] = new Array(ids.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const idx = cursor++;
      const id = ids[idx];
      try {
        const r = await run(id);
        results[idx] = {
          id,
          ok: !!r.ok,
          error: r.error ?? null,
          data: r.data ?? null,
        };
      } catch (err: unknown) {
        results[idx] = {
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          data: null,
        };
      }
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, ids.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}

/**
 * Run a bulk operation. Returns the final BulkOperationRow.
 *
 * Failure modes:
 *   - If every call fails, the row is marked `status='failed'`.
 *   - If at least one succeeds, `status='completed'` (with `failed > 0`
 *     visible on the row).
 *   - If the inserter throws (RLS / DB issue), the helper still attempts
 *     to run the callbacks but returns a synthetic row in status='failed'
 *     so the caller has something to display.
 */
export async function runBulk(opts: RunBulkOpts): Promise<BulkOperationRow> {
  const ids = Array.isArray(opts.target_ids) ? opts.target_ids.filter(Boolean) : [];
  const concurrency = clampConcurrency(opts.concurrency);
  const total = ids.length;

  const admin = createAdminClient();

  // Insert the row first so /admin/bulk shows "running" while we work.
  const insertPayload = {
    actor_id: opts.actor_id ?? null,
    operation: opts.operation,
    target_kind: opts.target_kind,
    target_ids: ids,
    total,
    succeeded: 0,
    failed: 0,
    status: "running" as const,
    results: [] as unknown[],
    metadata: opts.metadata ?? {},
  };

  let bulkId: string | null = null;
  let startedAt: string = new Date().toISOString();
  try {
    const { data, error } = await admin
      .from("bulk_operations")
      .insert(insertPayload)
      .select("id, started_at")
      .single();
    if (!error && data) {
      bulkId = (data as { id: string }).id;
      startedAt = (data as { started_at: string }).started_at ?? startedAt;
    }
  } catch {
    // Fall through — we still execute, then synthesize a row.
  }

  const entries = await executeAll(ids, opts.run, concurrency);
  const succeeded = entries.filter((e) => e.ok).length;
  const failed = entries.length - succeeded;
  const status: BulkOperationRow["status"] =
    total === 0
      ? "completed"
      : failed === total
        ? "failed"
        : "completed";
  const finishedAt = new Date().toISOString();

  if (bulkId) {
    try {
      const { data: updated, error } = await admin
        .from("bulk_operations")
        .update({
          succeeded,
          failed,
          status,
          results: entries,
          finished_at: finishedAt,
        })
        .eq("id", bulkId)
        .select("*")
        .single();
      if (!error && updated) {
        return normalizeBulkRow(updated);
      }
    } catch {
      // Fall through to synthesizing a row.
    }
  }

  // No DB row available — return a synthesized one so callers see results.
  return {
    id: bulkId ?? "",
    actor_id: opts.actor_id ?? null,
    operation: opts.operation,
    target_kind: opts.target_kind,
    target_ids: ids,
    total,
    succeeded,
    failed,
    status,
    results: entries,
    metadata: opts.metadata ?? {},
    started_at: startedAt,
    finished_at: finishedAt,
  };
}

/** Normalize a Postgres row (which may have unknown shape) into our type. */
function normalizeBulkRow(row: Record<string, unknown>): BulkOperationRow {
  return {
    id: String(row.id ?? ""),
    actor_id: (row.actor_id as string | null) ?? null,
    operation: String(row.operation ?? ""),
    target_kind: String(row.target_kind ?? ""),
    target_ids: Array.isArray(row.target_ids) ? (row.target_ids as string[]) : [],
    total: Number(row.total ?? 0),
    succeeded: Number(row.succeeded ?? 0),
    failed: Number(row.failed ?? 0),
    status: (row.status as BulkOperationRow["status"]) ?? "completed",
    results: Array.isArray(row.results) ? (row.results as unknown[]) : [],
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    started_at: String(row.started_at ?? ""),
    finished_at: (row.finished_at as string | null) ?? null,
  };
}

/** Read a single bulk row by id. Returns null if not found. */
export async function getBulkOperation(
  id: string
): Promise<BulkOperationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bulk_operations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeBulkRow(data as Record<string, unknown>);
}

/** List the most recent bulk rows (admin view). */
export async function listBulkOperations(opts?: {
  limit?: number;
  status?: BulkOperationRow["status"] | "all";
}): Promise<BulkOperationRow[]> {
  const admin = createAdminClient();
  const limit = Math.max(1, Math.min(500, opts?.limit ?? 100));
  let q = admin
    .from("bulk_operations")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (opts?.status && opts.status !== "all") {
    q = q.eq("status", opts.status);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map(normalizeBulkRow);
}

/** Format a duration in ms → friendly string. */
export function formatBulkDuration(
  startedAt: string,
  finishedAt: string | null
): string {
  if (!startedAt) return "—";
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "—";
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(end)) return "—";
  const diff = Math.max(0, end - start);
  if (diff < 1000) return `${diff} ms`;
  if (diff < 60_000) return `${(diff / 1000).toFixed(1)} s`;
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
