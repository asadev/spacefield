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
 * Auth pattern matches sibling crons (CRON_SECRET / vercel-cron UA /
 * x-vercel-cron header). See /api/cron/stuck-jobs-detect.
 */

import { NextResponse, type NextRequest } from "next/server";

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
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

    return NextResponse.json({
      ok: true,
      window_minutes: WINDOW_MINUTES,
      hour_of_day: hourOfDay,
      sources_checked: current.length,
      anomalies,
      notified_admins: notifiedAdmins,
      thresholds: {
        p95_multiplier: P95_MULTIPLIER,
        p95_min_baseline_ms: P95_MIN_BASELINE_MS,
        err_rate_threshold: ERR_RATE_THRESHOLD,
        current_min_calls: CURRENT_MIN_CALLS,
        baseline_min_samples: BASELINE_MIN_SAMPLES,
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

function isAuthorizedCronCall(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("vercel-cron")) return true;
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}
