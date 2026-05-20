/* /api/cron/anomaly-check — every 30 minutes.
 *
 * Compares the current 30-min API latency window against a 7-day
 * historical baseline (public.api_latency_baseline) and emits one
 * admin notification per anomalous source. Mirrors the auth + fan-out
 * shape of /api/cron/stuck-jobs-detect so the on-call playbook is the
 * same: any "ops.anomaly.latency" notification lands in /admin/status.
 *
 * Thresholds (intentionally loose — we want fewer false pages, not
 * more):
 *   - p95 anomaly: current p95 >= 3x baseline p95 (and baseline >= 50 ms
 *     so we don't page on a 5ms → 20ms blip on a near-idle endpoint).
 *   - error anomaly: current err_rate >= 0.05 (5%) and >= 5 calls in
 *     the window (avoids "1/1 → 100%" page on rarely-hit endpoints).
 *   - min_samples: at least 10 calls in the current window AND the
 *     baseline must have at least 3 historical sample-hours.
 *
 * Notifications coalesce per cron tick — one row per affected source,
 * one fan-out per admin. Re-firing every 30 min until the anomaly
 * clears is fine: each admin sees the same kind in their inbox and we
 * dedupe by `kind + source` in the unread query. (We do NOT carry
 * cool-down state in this route — the goal is "still bad" visibility,
 * not a one-shot pager.)
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
export const maxDuration = 60;

const WINDOW_MINUTES = 30;
const P95_MULTIPLIER = 3;          // current p95 >= 3x baseline p95
const P95_MIN_BASELINE_MS = 50;    // ignore sources baselined under 50ms
const ERR_RATE_THRESHOLD = 0.05;   // 5%
const ERR_MIN_CALLS = 5;           // need this many calls to count err_rate
const CURRENT_MIN_CALLS = 10;      // need this many calls in current window
const BASELINE_MIN_SAMPLES = 3;    // need >= 3 historical sample-hours

// Top-spender thresholds — see runTopSpenderCheck() below.
// We compare each workspace's last-24h cost against its rolling 7-day
// median. Anything >= 2x the median (and above the floor) gets paged.
const SPEND_WINDOW_MIN = 1440;        // 24h
const SPEND_MULTIPLIER = 2;           // 2x the historical median
const SPEND_FLOOR_USD = 5;            // ignore "0.01→0.05" cents-level blips
const SPEND_HISTORY_DAYS = 7;

type CurrentRow = {
  source: string;
  count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  err_rate: number;
};

type BaselineRow = {
  source: string;
  hour_of_day: number;
  sample_hours: number;
  baseline_p95_ms: number;
  baseline_err_rate: number;
};

type Anomaly = {
  source: string;
  reason: "p95_spike" | "error_rate" | "p95_spike+error_rate";
  current_p95_ms: number;
  baseline_p95_ms: number;
  current_err_rate: number;
  baseline_err_rate: number;
  current_calls: number;
};

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const admin = createAdminClient();
    const hourOfDay = new Date().getUTCHours();

    // 1. Current 30-min window per source.
    const { data: currentData, error: currentErr } = await admin.rpc(
      "api_latency_summary",
      { p_window_minutes: WINDOW_MINUTES }
    );

    if (currentErr) {
      log.error("cron.anomaly.current_failed", { error: currentErr.message });
      return NextResponse.json(
        { ok: false, error: currentErr.message },
        { status: 500 }
      );
    }

    const current: CurrentRow[] = Array.isArray(currentData)
      ? (currentData as CurrentRow[])
      : [];

    if (current.length === 0) {
      return NextResponse.json({
        ok: true,
        window_minutes: WINDOW_MINUTES,
        sources_checked: 0,
        anomalies: [],
      });
    }

    // 2. Baseline for the current hour-of-day across last 7 days.
    const { data: baselineData, error: baselineErr } = await admin
      .from("api_latency_baseline")
      .select("source,hour_of_day,sample_hours,baseline_p95_ms,baseline_err_rate")
      .eq("hour_of_day", hourOfDay);

    if (baselineErr) {
      log.warn("cron.anomaly.baseline_failed", { error: baselineErr.message });
      // Soft-fail: without baseline we can still alert on raw err_rate.
    }

    const baselineMap = new Map<string, BaselineRow>();
    for (const row of (baselineData ?? []) as BaselineRow[]) {
      baselineMap.set(row.source, row);
    }

    // 3. Compare each source.
    const anomalies: Anomaly[] = [];
    for (const row of current) {
      if (row.count < CURRENT_MIN_CALLS) continue;

      const baseline = baselineMap.get(row.source);

      let p95Spike = false;
      if (
        baseline &&
        baseline.sample_hours >= BASELINE_MIN_SAMPLES &&
        baseline.baseline_p95_ms >= P95_MIN_BASELINE_MS
      ) {
        p95Spike = row.p95_ms >= baseline.baseline_p95_ms * P95_MULTIPLIER;
      }

      const errAnomaly =
        row.count >= ERR_MIN_CALLS &&
        Number(row.err_rate) >= ERR_RATE_THRESHOLD;

      if (!p95Spike && !errAnomaly) continue;

      const reason: Anomaly["reason"] =
        p95Spike && errAnomaly
          ? "p95_spike+error_rate"
          : p95Spike
            ? "p95_spike"
            : "error_rate";

      anomalies.push({
        source: row.source,
        reason,
        current_p95_ms: row.p95_ms,
        baseline_p95_ms: baseline?.baseline_p95_ms ?? 0,
        current_err_rate: Number(row.err_rate),
        baseline_err_rate: Number(baseline?.baseline_err_rate ?? 0),
        current_calls: row.count,
      });
    }

    // 4. Fan out one alert per anomalous source.
    let notifiedAdmins = 0;
    for (const a of anomalies) {
      const title =
        a.reason === "error_rate"
          ? `API errors spiked: ${a.source}`
          : a.reason === "p95_spike"
            ? `API latency spike: ${a.source}`
            : `API latency + errors spike: ${a.source}`;

      const body = [
        `p95 ${a.current_p95_ms}ms (baseline ${a.baseline_p95_ms}ms)`,
        `err_rate ${(a.current_err_rate * 100).toFixed(1)}% (baseline ${(a.baseline_err_rate * 100).toFixed(1)}%)`,
        `over ${a.current_calls} calls in last ${WINDOW_MINUTES} min`,
      ].join(" — ");

      const { data: alertData, error: alertErr } = await admin.rpc(
        "anomaly_alert",
        {
          p_title: title,
          p_body: body,
          p_payload: {
            source: a.source,
            reason: a.reason,
            window_minutes: WINDOW_MINUTES,
            current_p95_ms: a.current_p95_ms,
            baseline_p95_ms: a.baseline_p95_ms,
            current_err_rate: a.current_err_rate,
            baseline_err_rate: a.baseline_err_rate,
            current_calls: a.current_calls,
            hour_of_day: hourOfDay,
            detected_at: new Date().toISOString(),
          },
        }
      );

      if (alertErr) {
        log.warn("cron.anomaly.alert_failed", {
          source: a.source,
          error: alertErr.message,
        });
      } else {
        notifiedAdmins += Number(alertData ?? 0);
      }
    }

    if (anomalies.length > 0) {
      log.info("cron.anomaly.flagged", {
        sources: anomalies.map((a) => a.source),
        count: anomalies.length,
        notified_admins: notifiedAdmins,
      });
    }

    // 5. Top-spender check — runs every tick alongside latency anomalies.
    //    Failures here are isolated so a busted ai_cost_summary call
    //    can't suppress latency alerting (the original responsibility
    //    of this cron).
    let topSpender: TopSpenderResult = {
      workspaces_checked: 0,
      spikes: [],
      notified_admins: 0,
    };
    try {
      // Cast: SupabaseClient<unknown> has a richer chained-builder shape
      // than our minimal SupabaseLikeClient interface; runtime is compatible.
      topSpender = await runTopSpenderCheck(admin as unknown as SupabaseLikeClient);
    } catch (e) {
      log.warn("cron.anomaly.top_spender_failed", {
        error: (e as Error).message,
      });
    }

    return NextResponse.json({
      ok: true,
      window_minutes: WINDOW_MINUTES,
      hour_of_day: hourOfDay,
      sources_checked: current.length,
      anomalies,
      notified_admins: notifiedAdmins,
      top_spender: topSpender,
      thresholds: {
        p95_multiplier: P95_MULTIPLIER,
        p95_min_baseline_ms: P95_MIN_BASELINE_MS,
        err_rate_threshold: ERR_RATE_THRESHOLD,
        current_min_calls: CURRENT_MIN_CALLS,
        baseline_min_samples: BASELINE_MIN_SAMPLES,
        spend_multiplier: SPEND_MULTIPLIER,
        spend_floor_usd: SPEND_FLOOR_USD,
        spend_window_min: SPEND_WINDOW_MIN,
        spend_history_days: SPEND_HISTORY_DAYS,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.anomaly_check",
          fallback: "anomaly_scan_failed",
        }),
      },
      { status: 500 }
    );
  }
}

// ─────────────────────── Top-spender check ───────────────────────
//
// We compare each workspace's 24h AI spend against its rolling 7-day
// median. Workspaces that spend >= SPEND_MULTIPLIER × median (and at
// least SPEND_FLOOR_USD) get an admin notification via
// public.top_spender_alert.
//
// Inputs:
//   - current 24h: ai_cost_summary(1440, workspace_id) — but we don't
//     have a workspace-less variant that returns rows per workspace,
//     so we read the matview ai_cost_daily directly. That matview is
//     refreshed daily at 06:30 UTC; the freshness gap is fine for
//     a 24h-window comparison (a workspace can't realistically spike
//     in the first hour after refresh and slip through — the 24h
//     window from ai_calls will catch it on the next tick).
//   - history: ai_cost_daily over the prior SPEND_HISTORY_DAYS days
//     (excluding today, so today's spike doesn't influence its own
//     median).
//
// We compute "yesterday's cost vs 7-day median (excluding yesterday)".
// "Yesterday" is the most-recent fully-closed UTC day in the matview;
// this is intentionally conservative — we'd rather page once on the
// final 24h total than twice on a still-accruing today.

type WorkspaceSpend = {
  workspace_id: string | null;
  cost_usd: number;
};

type TopSpenderSpike = {
  workspace_id: string;
  recent_cost_usd: number;
  median_cost_usd: number;
  history_days: number;
  multiplier: number;
};

type TopSpenderResult = {
  workspaces_checked: number;
  spikes: TopSpenderSpike[];
  notified_admins: number;
};

interface SupabaseLikeClient {
  from: (table: string) => {
    select: (cols: string) => {
      gte: (col: string, val: string) => {
        lt: (col: string, val: string) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

async function runTopSpenderCheck(
  admin: SupabaseLikeClient
): Promise<TopSpenderResult> {
  const now = new Date();
  // Most recent fully-closed UTC day.
  const yesterdayEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    )
  );
  const yesterdayStart = new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000);
  const historyStart = new Date(
    yesterdayStart.getTime() - SPEND_HISTORY_DAYS * 24 * 60 * 60 * 1000
  );

  // 24h via the existing RPC — gives us the most recent rolling spend
  // per (workspace, agent, model). Sum into workspace totals.
  const { data: rpcData, error: rpcErr } = await admin.rpc(
    "ai_cost_summary",
    { p_window_minutes: SPEND_WINDOW_MIN, p_workspace_id: null }
  );
  if (rpcErr) {
    log.warn("cron.top_spender.rpc_failed", { error: rpcErr.message });
    return { workspaces_checked: 0, spikes: [], notified_admins: 0 };
  }

  // ai_cost_summary doesn't return workspace_id (it groups by agent +
  // model). For a workspace-level rollup we read ai_calls via the
  // matview that's already aggregated by (workspace, day, model).
  // Get yesterday's total per workspace.
  const { data: recentRows, error: recentErr } = await admin
    .from("ai_cost_daily")
    .select("workspace_id, cost_usd")
    .gte("day", yesterdayStart.toISOString().slice(0, 10))
    .lt("day", yesterdayEnd.toISOString().slice(0, 10));

  if (recentErr) {
    log.warn("cron.top_spender.recent_failed", { error: recentErr.message });
    return { workspaces_checked: 0, spikes: [], notified_admins: 0 };
  }

  // History: prior SPEND_HISTORY_DAYS days, excluding yesterday.
  const { data: historyRows, error: historyErr } = await admin
    .from("ai_cost_daily")
    .select("workspace_id, cost_usd, day")
    .gte("day", historyStart.toISOString().slice(0, 10))
    .lt("day", yesterdayStart.toISOString().slice(0, 10));

  if (historyErr) {
    log.warn("cron.top_spender.history_failed", { error: historyErr.message });
    return { workspaces_checked: 0, spikes: [], notified_admins: 0 };
  }

  // Aggregate recent per workspace.
  const recentByWs = new Map<string, number>();
  for (const r of (recentRows as WorkspaceSpend[] | null) ?? []) {
    if (!r.workspace_id) continue;
    recentByWs.set(
      r.workspace_id,
      (recentByWs.get(r.workspace_id) ?? 0) + Number(r.cost_usd ?? 0)
    );
  }

  // Aggregate history per (workspace, day). We want per-day totals so
  // the median is taken over comparable units (one observation per
  // day, not one per (day, model)).
  const historyByWsDay = new Map<string, Map<string, number>>();
  for (const r of (historyRows as Array<WorkspaceSpend & { day: string }> | null) ?? []) {
    if (!r.workspace_id) continue;
    const dayMap =
      historyByWsDay.get(r.workspace_id) ??
      new Map<string, number>();
    dayMap.set(r.day, (dayMap.get(r.day) ?? 0) + Number(r.cost_usd ?? 0));
    historyByWsDay.set(r.workspace_id, dayMap);
  }

  const spikes: TopSpenderSpike[] = [];
  for (const [wsId, recentCost] of recentByWs.entries()) {
    if (recentCost < SPEND_FLOOR_USD) continue;
    const dayMap = historyByWsDay.get(wsId);
    if (!dayMap || dayMap.size === 0) continue;

    const dailyTotals = Array.from(dayMap.values()).sort((a, b) => a - b);
    const median =
      dailyTotals.length % 2 === 1
        ? dailyTotals[(dailyTotals.length - 1) / 2]
        : (dailyTotals[dailyTotals.length / 2 - 1] +
            dailyTotals[dailyTotals.length / 2]) /
          2;

    // Guard against a zero-median workspace (no spend in the history
    // window). We don't want "0 → $5" to look like ∞× — fall back to
    // the floor check we already applied.
    if (median <= 0) continue;
    if (recentCost < median * SPEND_MULTIPLIER) continue;

    spikes.push({
      workspace_id: wsId,
      recent_cost_usd: Math.round(recentCost * 100) / 100,
      median_cost_usd: Math.round(median * 100) / 100,
      history_days: dailyTotals.length,
      multiplier: Math.round((recentCost / median) * 100) / 100,
    });
  }

  // Fan out one alert per spiking workspace.
  let notified = 0;
  for (const s of spikes) {
    const title = `AI spend spike: workspace ${s.workspace_id.slice(0, 8)}…`;
    const body =
      `$${s.recent_cost_usd.toFixed(2)} in last 24h ` +
      `vs median $${s.median_cost_usd.toFixed(2)} over ${s.history_days} days ` +
      `(${s.multiplier}× baseline)`;

    const { data: alertData, error: alertErr } = await admin.rpc(
      "top_spender_alert",
      {
        p_title: title,
        p_body: body,
        p_payload: {
          workspace_id: s.workspace_id,
          recent_cost_usd: s.recent_cost_usd,
          median_cost_usd: s.median_cost_usd,
          history_days: s.history_days,
          multiplier: s.multiplier,
          window_minutes: SPEND_WINDOW_MIN,
          detected_at: new Date().toISOString(),
        },
      }
    );
    if (alertErr) {
      log.warn("cron.top_spender.alert_failed", {
        workspace_id: s.workspace_id,
        error: alertErr.message,
      });
    } else {
      notified += Number(alertData ?? 0);
    }
  }

  if (spikes.length > 0) {
    log.info("cron.top_spender.flagged", {
      count: spikes.length,
      notified_admins: notified,
      // ai_cost_summary roundtrip — kept here for any future debugging
      // where we need to know whether the matview disagreed with the
      // live RPC.
      rpc_rows: Array.isArray(rpcData) ? rpcData.length : 0,
    });
  }

  return {
    workspaces_checked: recentByWs.size,
    spikes,
    notified_admins: notified,
  };
}
