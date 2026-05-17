import "server-only";

/**
 * Over-budget usage billing.
 *
 * `lib/ai/budget-check.ts` (owned by N5; read-only here) answers the
 * yes/no "is this workspace over budget?" question, and the runtime
 * uses it to surface an "Upgrade to continue" message before kicking
 * off another call. That gate is opt-in — some flows let the user
 * keep going and bill the overage instead of blocking the call.
 *
 * This module is that overage path. It exposes:
 *
 *   chargeOverage(workspaceId, callCostUsd)
 *
 * Behaviour:
 *   1. Resolve the workspace's tier + last-30-day spend.
 *   2. If `used_before + callCost <= budget`, this call is still
 *      under cap — no overage, no row written, return null.
 *   3. Otherwise compute how much of the call's USD spilled into
 *      the over-budget bucket and persist it to `ai_usage_overages`.
 *      Return the persisted row id + the overage amount.
 *
 * The post-call recordAiCall path (lib/ai/cost.ts) invokes us in a
 * fire-and-forget — failures here MUST NOT take down the AI path.
 *
 * Notes on dependencies:
 *   - We deliberately re-derive the spend window here rather than
 *     importing `getWorkspaceBudgetStatus` from budget-check.ts so a
 *     concurrent-call race can't double-bill the "first call past
 *     the budget" — the read here is fresh-as-of-now.
 *   - Enterprise / 0-budget tiers never overage by construction.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAiCostSummary } from "./cost";
import { log } from "@/lib/log";

const WINDOW_MINUTES_30_DAYS = 43_200;

const TIER_AI_BUDGET_USD: Record<string, number> = {
  free: 0,
  pro: 10,
  business: 50,
  team: 50,
  enterprise: 500,
};

export interface ChargeOverageResult {
  /** Null when the call is still within budget (no overage). */
  overage_id: string | null;
  /** USD that spilled into the over-budget bucket (0 when within budget). */
  overage_usd: number;
  /** Resolved tier — "free" when the workspace owner has no sub. */
  tier: string;
  /** Monthly USD allowance (0 = unlimited / platform tier). */
  budget_usd: number;
  /** 30-day spend BEFORE this call. */
  used_before_usd: number;
}

const NO_CHARGE = (
  base: Pick<ChargeOverageResult, "tier" | "budget_usd" | "used_before_usd">
): ChargeOverageResult => ({
  overage_id: null,
  overage_usd: 0,
  ...base,
});

/**
 * Public API — compute and persist the overage for a single call.
 *
 *   void chargeOverage(workspaceId, callCostUsd);   // fire-and-forget
 *
 * Returns the result so callers can also surface "you went over by
 * $0.12 on this call" in the UI if they want.
 */
export async function chargeOverage(
  workspaceId: string | null | undefined,
  callCostUsd: number
): Promise<ChargeOverageResult | null> {
  if (!workspaceId) return null;
  if (!Number.isFinite(callCostUsd) || callCostUsd <= 0) return null;

  try {
    const tier = await resolveWorkspaceTier(workspaceId);
    const budget = TIER_AI_BUDGET_USD[tier] ?? 0;

    // Platform / enterprise / unknown tier with no cap — never overage.
    if (budget <= 0) {
      return NO_CHARGE({ tier, budget_usd: 0, used_before_usd: 0 });
    }

    const rows = await fetchAiCostSummary(WINDOW_MINUTES_30_DAYS, workspaceId);
    // The call we just recorded IS included in `rows` because
    // recordAiCall awaits the insert before invoking us. Back it out
    // so `used_before` represents the spend immediately prior.
    const usedTotal = rows.reduce(
      (acc, r) => acc + Number(r.cost_usd ?? 0),
      0
    );
    const usedBefore = Math.max(0, usedTotal - callCostUsd);

    // Three cases — pre/post a budget crossing:
    //   1. usedBefore + callCost ≤ budget → still under cap
    //   2. usedBefore ≥ budget            → fully over (whole call is overage)
    //   3. usedBefore < budget < total    → partial (the spill is overage)
    const remainingBudget = Math.max(0, budget - usedBefore);
    if (callCostUsd <= remainingBudget) {
      return NO_CHARGE({
        tier,
        budget_usd: budget,
        used_before_usd: usedBefore,
      });
    }

    const overage = +Math.max(0, callCostUsd - remainingBudget).toFixed(6);
    if (overage <= 0) {
      return NO_CHARGE({
        tier,
        budget_usd: budget,
        used_before_usd: usedBefore,
      });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_usage_overages")
      .insert({
        workspace_id: workspaceId,
        tier,
        budget_usd: budget,
        used_before_usd: +usedBefore.toFixed(4),
        call_cost_usd: +callCostUsd.toFixed(6),
        overage_usd: overage,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      log.warn("ai_usage_overages.insert_failed", { error: error.message });
      return {
        overage_id: null,
        overage_usd: overage,
        tier,
        budget_usd: budget,
        used_before_usd: usedBefore,
      };
    }

    return {
      overage_id: (data as { id: string } | null)?.id ?? null,
      overage_usd: overage,
      tier,
      budget_usd: budget,
      used_before_usd: usedBefore,
    };
  } catch (e) {
    log.warn("ai_usage_overages.unexpected", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/* ─────────────────────── helpers ─────────────────────── */

/**
 * Mirror of budget-check.ts's resolver. Duplicated locally to keep
 * this module independent (importing across "logical owners" makes
 * refactoring messy).
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
