import "server-only";

/* lib/ai/budget-check.ts — workspace-tier AI spend budget guard.
 *
 * The admin panel shows a per-workspace "X% of monthly AI budget used"
 * progress bar via the <AICostBudget /> server component (see
 * components/AICostBudget.tsx). That component already does the maths,
 * but it lives in the React layer and isn't callable from the runtime.
 *
 * This module mirrors that logic in a pure server-side helper the
 * executor / orchestrator / /chat route can consult before kicking off
 * a fresh model call. The rule is simple:
 *
 *   if the workspace owner's tier defines a finite monthly USD
 *   allowance AND the last-30-day spend has reached or exceeded it,
 *   we refuse the next call with a friendly "Upgrade to continue"
 *   message.
 *
 * `enterprise` and any tier with budget = 0 (e.g. "platform" admin
 * views) are always permitted.
 *
 * Why per-tier USD and not credits: the runtime already runs a
 * token-bucket credit ledger (lib/agent/runtime/budget.ts). That guard
 * fires deep within a single dispatch. This one is one level higher —
 * the workspace has overall blown past its tier's $-per-month budget,
 * which is the marketing-facing limit the user signed up for. It's
 * cheap (one RPC) and runs once per dispatch.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAiCostSummary } from "./cost";

/** 30 days = one billing cycle. */
const WINDOW_MINUTES_30_DAYS = 43_200;

/**
 * Per-tier monthly AI-spend allowance, in USD. Mirrors the same map
 * exported by `components/AICostBudget.tsx`. Duplicated here to keep
 * this module React-free — it must be importable from server-side
 * runtime code that doesn't pull `react` into its bundle.
 *
 * Keep the two maps in sync until we centralise tier metadata.
 */
const TIER_AI_BUDGET_USD: Record<string, number> = {
  free: 0,
  pro: 10,
  business: 50,
  // Aliases for the older tier ids that ship in subscription_tiers.
  team: 50,
  enterprise: 500,
};

export interface BudgetCheckResult {
  /** True iff the workspace has consumed ≥100% of its tier allowance. */
  over: boolean;
  /** Workspace owner's resolved tier, or "free" when unknown. */
  tier: string;
  /** Total USD spent in the last 30 days (cost_usd sum). */
  used: number;
  /** Monthly USD allowance for the tier (0 = unlimited / no cap). */
  budget: number;
  /** Percentage used (0–100+). 0 when budget is 0 (no cap). */
  pct: number;
}

/**
 * Resolve a workspace's tier by walking workspace.user_id → user's
 * active subscription row. Mirrors AICostBudget.resolveWorkspaceTier
 * — kept in this file (rather than imported from the component) so a
 * non-React server caller doesn't have to pull a "use client" subtree
 * into its bundle.
 */
async function resolveWorkspaceTier(workspaceId: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data: ws } = await admin
      .from("workspaces")
      .select("user_id")
      .eq("id", workspaceId)
      .maybeSingle();
    const ownerId = (ws as { user_id?: string | null } | null)?.user_id;
    if (!ownerId) return "free";
    const { data: sub } = await admin
      .from("subscriptions")
      .select("tier_id, status")
      .eq("user_id", ownerId)
      .maybeSingle();
    const row = sub as { tier_id?: string; status?: string } | null;
    if (!row) return "free";
    if (row.status && row.status !== "active" && row.status !== "trialing") {
      return "free";
    }
    return row.tier_id ?? "free";
  } catch {
    return "free";
  }
}

/**
 * The friendly "Upgrade to continue" copy. Surfaced verbatim by the
 * executor/orchestrator/stream route when the budget guard trips. We
 * keep it short so it reads well as both an in-app reply and an SSE
 * delta. Plain text — no markdown — to match the formatter's house style.
 */
export function upgradeMessageForTier(tier: string): string {
  if (tier === "free") {
    return (
      "You're on the Free plan, which doesn't include AI usage. " +
      "Upgrade to Pro in Settings → Billing to keep chatting."
    );
  }
  if (tier === "pro") {
    return (
      "You've used 100% of this month's AI budget on the Pro plan. " +
      "Upgrade to Business in Settings → Billing to continue, or wait " +
      "until next month's reset."
    );
  }
  if (tier === "team" || tier === "business") {
    return (
      "You've used 100% of this month's AI budget on the Business plan. " +
      "Upgrade to Enterprise in Settings → Billing to keep going, or " +
      "wait until next month's reset."
    );
  }
  // enterprise / unknown — budget will be 0 (no cap) and we won't ever
  // reach this string, but keep a reasonable fallback just in case.
  return (
    "You've reached this month's AI usage cap. Contact support to raise " +
    "your limit, or wait until next month's reset."
  );
}

/**
 * Compute the current spend / budget state for a workspace.
 *
 * Returns a `BudgetCheckResult`. Callers that just want a boolean can
 * destructure `.over` — see `isWorkspaceOverBudget` for the convenience
 * wrapper.
 *
 * Failures (network glitch, RPC missing, etc.) intentionally degrade
 * to `over: false` — we'd rather let an AI call through than silently
 * black-hole a paying customer.
 */
export async function getWorkspaceBudgetStatus(
  workspaceId: string | null | undefined
): Promise<BudgetCheckResult> {
  if (!workspaceId) {
    return { over: false, tier: "platform", used: 0, budget: 0, pct: 0 };
  }
  try {
    const [tier, rows] = await Promise.all([
      resolveWorkspaceTier(workspaceId),
      fetchAiCostSummary(WINDOW_MINUTES_30_DAYS, workspaceId),
    ]);
    const used = rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
    const budget = TIER_AI_BUDGET_USD[tier] ?? 0;
    const pct = budget > 0 ? (used / budget) * 100 : 0;
    const over = budget > 0 && used >= budget;
    return { over, tier, used, budget, pct };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[budget-check] failed:",
      e instanceof Error ? e.message : String(e)
    );
    return { over: false, tier: "free", used: 0, budget: 0, pct: 0 };
  }
}

/**
 * Convenience boolean wrapper. Use this when you only care about the
 * yes/no and don't need to surface used/budget back to the user.
 *
 *     if (await isWorkspaceOverBudget(ctx.workspaceId)) { ... }
 */
export async function isWorkspaceOverBudget(
  workspaceId: string | null | undefined
): Promise<boolean> {
  const { over } = await getWorkspaceBudgetStatus(workspaceId);
  return over;
}
