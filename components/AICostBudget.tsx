import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAiCostSummary } from "@/lib/ai/cost";

/**
 * AICostBudget — server component showing "X% of monthly AI budget
 * used" for a workspace (or the platform, if no workspace given).
 *
 * Budget is derived from the workspace owner's tier via a fixed map
 * (see TIER_AI_BUDGET_USD below). The marketing-side plan tiers ship
 * in `subscription_tiers` but don't yet expose an AI-spend allowance
 * column — when one is added we'll switch to reading it directly.
 *
 * Window = last 30 days (43,200 minutes) to match a monthly billing
 * cycle. Refresh on page render — this is a server component, so the
 * caller decides cacheability via the wrapping route's revalidation.
 */

const WINDOW_MINUTES_30_DAYS = 43_200;

/** Monthly AI-spend allowance per tier, in USD. */
export const TIER_AI_BUDGET_USD: Record<string, number> = {
  free: 0,
  pro: 10,
  business: 50,
  // Aliases for the older tier ids that ship in subscription_tiers
  // (we currently have `team` instead of `business`, and `enterprise`
  // is bespoke — give it a generous but finite default).
  team: 50,
  enterprise: 500,
};

export interface AICostBudgetProps {
  workspaceId?: string | null;
  /** Header label override. Default: "AI budget · last 30 days". */
  title?: string;
}

export default async function AICostBudget({
  workspaceId,
  title,
}: AICostBudgetProps) {
  const rows = await fetchAiCostSummary(WINDOW_MINUTES_30_DAYS, workspaceId);
  const used = rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

  const tier = workspaceId
    ? await resolveWorkspaceTier(workspaceId)
    : "platform";
  const budget = budgetForTier(tier);
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
  const overspend = budget > 0 && used > budget;
  const accent = overspend
    ? "#ef4444"
    : pct > 80
      ? "#f97316"
      : pct > 50
        ? "#eab308"
        : "#10b981";

  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            {title ?? "AI budget · last 30 days"}
          </div>
          <div className="mt-1 text-sm font-semibold text-app">
            {tier === "platform" ? (
              <>Platform total</>
            ) : (
              <>
                Tier: <span className="font-mono text-secondary">{tier}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg tabular-nums text-app">
            {formatUsd(used)}
          </div>
          {budget > 0 ? (
            <div className="text-[10px] text-faint">
              of {formatUsd(budget)} budget
            </div>
          ) : (
            <div className="text-[10px] text-faint">no monthly budget</div>
          )}
        </div>
      </div>

      {budget > 0 ? (
        <>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-app"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label="AI spend vs monthly budget"
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${pct}%`,
                backgroundColor: accent,
              }}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between text-[11px]">
            <span className="text-muted">
              {pct.toFixed(1)}% used
              {overspend ? (
                <span className="ml-2 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                  over budget
                </span>
              ) : null}
            </span>
            <span className="font-mono tabular-nums text-faint">
              {formatUsd(Math.max(0, budget - used))} left
            </span>
          </div>
        </>
      ) : (
        <div className="mt-3 text-[11px] text-muted">
          {tier === "free"
            ? "Upgrade to enable AI features."
            : "Usage shown for visibility — no spend cap on this view."}
        </div>
      )}
    </div>
  );
}

function budgetForTier(tier: string): number {
  if (tier === "platform") return 0;
  return TIER_AI_BUDGET_USD[tier] ?? 0;
}

/**
 * Resolve a workspace's tier by looking up the owner's subscription.
 * Workspaces are owned by a single user (`workspaces.user_id`), and
 * subscriptions are user-scoped. Returns the tier id (defaults to
 * "free" when the owner has no row).
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

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
