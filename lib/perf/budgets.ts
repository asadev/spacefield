import "server-only";

import { log } from "@/lib/log";

/**
 * lib/perf/budgets.ts — per-route latency budgets.
 *
 * A budget is the *expected* upper bound for a route handler's wall
 * time. Breaching it doesn't fail the request — it logs a structured
 * warning so the budget can be surfaced in /admin/insights/latency and
 * alerted on. Think of it as an SLO line in the sand, owned in code
 * and grep-able next to the handler.
 *
 * The budgets here are starting estimates pulled from the kind of work
 * each surface does:
 *
 *   - Internal admin reads (RPC calls, table scans): 600 ms.
 *   - Public catalog reads (cached, edge-friendly): 400 ms.
 *   - Auth flows (round-trips to Supabase Auth + cookie writes): 800 ms.
 *   - AI streaming bootstraps (provider handshake, NOT total stream): 1200 ms.
 *   - Webhook receivers (Paddle, etc — signature verify + INSERT): 500 ms.
 *   - File-upload presign / metadata (no payload transit): 600 ms.
 *
 * Tune as the production p95 graph drifts — these are "loud at runtime
 * if you're 2x too slow" guards, not artistic statements.
 *
 * Wiring is opt-in. Routes that want budget tracking call
 * `withLatencyBudget("source.id", handler)`; everything else is
 * unaffected. We deliberately do NOT modify the existing
 * `withApiHandler` wrap (owned by lib/api-wrap.ts) — this is an
 * additive layer that callers can stack on top.
 */

/**
 * Budget defaults, in milliseconds. Keys must match the `source` tag
 * used by `withApiHandler` / `log.*` calls so cross-referencing
 * dashboards (api_latency.source) is one-to-one.
 *
 * Missing key → `DEFAULT_BUDGET_MS` applies (300 ms).
 */
export const LATENCY_BUDGET_MS: Readonly<Record<string, number>> = Object.freeze({
  // Admin read panels — RPC + a few table scans.
  "admin.insights.latency": 800,
  "admin.insights.ai-costs": 800,
  "admin.insights.health": 800,
  "admin.insights.slow-queries": 800,
  "admin.status.checklist": 600,
  "admin.alerts.list": 500,
  "admin.audit.list": 600,
  "admin.users.list": 600,
  "admin.workspaces.list": 600,

  // Public catalog / marketing
  "public.pricing": 400,
  "public.compare": 400,
  "public.developers": 400,
  "public.landing": 400,

  // Auth + session
  "auth.signin": 800,
  "auth.signout": 400,
  "auth.callback": 1000,

  // AI bootstrap — provider handshake, not the full stream. We measure
  // TTFB on streamed responses elsewhere.
  "ai.chat.start": 1200,
  "ai.skill.invoke": 1200,
  "ai.embed": 1000,

  // Webhooks — verify signature + write one row, no fan-out.
  "webhook.paddle": 500,
  "webhook.resend": 400,
  "webhook.supabase-auth": 400,

  // File-upload presign (no payload, just signed URL minting).
  "files.presign": 600,
  "files.metadata": 600,

  // Cron triggers — these have their own runtime budgets via
  // maxDuration; the budget here is for the "did anything happen"
  // bookkeeping path.
  "cron.anomaly-check": 5000,
  "cron.stuck-jobs-detect": 5000,
});

export const DEFAULT_BUDGET_MS = 300;

/**
 * Look up the budget for a source. Falls back to DEFAULT_BUDGET_MS.
 */
export function budgetForSource(source: string): number {
  return LATENCY_BUDGET_MS[source] ?? DEFAULT_BUDGET_MS;
}

/**
 * Synchronous helper: given a source + elapsed ms, log a structured
 * warning if the budget was breached. Returns true on breach so the
 * caller can decide whether to surface it further.
 *
 * Used when you've already measured elapsed time yourself (e.g. inside
 * a streaming handler where wrapping the whole function isn't useful).
 */
export function checkLatencyBudget(source: string, elapsedMs: number): boolean {
  const budget = budgetForSource(source);
  if (elapsedMs <= budget) return false;
  log.warn("perf.budget.breach", {
    source,
    elapsed_ms: elapsedMs,
    budget_ms: budget,
    over_pct: Math.round(((elapsedMs - budget) / budget) * 100),
  });
  return true;
}

/**
 * Wrap a handler so it warns when elapsed wall time exceeds the
 * budget for `source`. The wrapped function returns whatever the
 * inner one returns; the budget check is fire-and-forget.
 *
 * This is intentionally NOT a drop-in replacement for `withApiHandler`
 * — that wrapper handles admin gates, rate-limit, and latency-table
 * writes. This helper is meant to be stacked on top of, or used
 * inside, server components and tools where the api-wrap is overkill.
 *
 * Usage:
 *   export default async function Page() {
 *     return await withLatencyBudget("admin.insights.health", async () => {
 *       // ... render
 *     });
 *   }
 */
export async function withLatencyBudget<T>(
  source: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    checkLatencyBudget(source, Date.now() - started);
  }
}
