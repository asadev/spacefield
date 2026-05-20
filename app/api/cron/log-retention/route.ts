/* /api/cron/log-retention — daily at 04:00 UTC.
 *
 * Prunes our observability + security telemetry tables down to the
 * configured retention. We were already purging audit and paddle
 * events via dedicated crons; this one consolidates retention for
 * everything else so we don't keep accumulating bigserial rows
 * forever.
 *
 * Per-table retention (days) is a hard-coded map below. The default is
 * 90 days, matching audit_purge / paddle_retention. Keeping retention
 * in code (vs a DB config table) means:
 *   - Reviewable in git history.
 *   - No round-trip on cron start to read the policy.
 *   - Easier to defend in security review than "whatever the admin
 *     last typed into a settings page."
 *
 * If a table doesn't exist in this Supabase project (e.g. fresh
 * branch DB), the per-table delete soft-fails and we keep going —
 * the missing-table error is logged and the cron returns the
 * per-table outcomes so the operator sees what was actually deleted.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// We're potentially deleting from 7 tables; each is a single
// `delete where ts < ...` round trip. Pin to the 60s ceiling so a
// large backlog on day-one doesn't 504 mid-table.
export const maxDuration = 60;

// Per-table retention policy. `days` is the number of days to keep;
// `column` is the timestamp column used by the delete filter. We
// don't assume a single naming convention because the tables grew
// organically — some use `ts`, some `occurred_at`, some `created_at`.
const RETENTION: ReadonlyArray<{
  table: string;
  column: string;
  days: number;
}> = [
  { table: "error_events",     column: "occurred_at", days: 90 },
  { table: "admin_audit_log",  column: "created_at",  days: 90 },
  { table: "auth_failures",    column: "occurred_at", days: 90 },
  { table: "login_events",     column: "occurred_at", days: 90 },
  { table: "api_latency",      column: "ts",          days: 90 },
  { table: "ai_calls",         column: "ts",          days: 90 },
  { table: "app_metrics",      column: "ts",          days: 90 },
];

interface TableResult {
  table: string;
  days: number;
  ok: boolean;
  deleted: number | null;
  error: string | null;
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const results: TableResult[] = [];

  for (const policy of RETENTION) {
    const cutoff = new Date(
      Date.now() - policy.days * 24 * 60 * 60 * 1000
    ).toISOString();

    // `count: 'exact'` so we can report how many rows were pruned per
    // table. The cost is one extra count() in the delete round-trip,
    // which we accept here — the cron runs once a day and the
    // visibility is worth more than the CPU.
    const { error, count } = await admin
      .from(policy.table)
      .delete({ count: "exact" })
      .lt(policy.column, cutoff);

    if (error) {
      log.warn("cron.log_retention.table_failed", {
        table: policy.table,
        error: error.message,
      });
      results.push({
        table: policy.table,
        days: policy.days,
        ok: false,
        deleted: null,
        error: error.message,
      });
      continue;
    }

    results.push({
      table: policy.table,
      days: policy.days,
      ok: true,
      deleted: count ?? 0,
      error: null,
    });
  }

  const totalDeleted = results.reduce(
    (acc, r) => acc + (r.deleted ?? 0),
    0
  );
  const failed = results.filter((r) => !r.ok).length;

  log.info("cron.log_retention.done", {
    total_deleted: totalDeleted,
    failed,
    tables: results.length,
  });

  try {
    return NextResponse.json({
      ok: failed === 0,
      total_deleted: totalDeleted,
      failed,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.log_retention",
          fallback: "retention_failed",
        }),
      },
      { status: 500 }
    );
  }
}

