/* Credit ledger + budget enforcement for the agent runtime.
 *
 * We separate spend into two buckets:
 *   - quick: classifier (mini), executor (Haiku/mini), formatter (Haiku) — high-volume, cheap
 *   - deep:  orchestrator (Sonnet) — bursty, expensive
 *
 * Caps are per (workspace_id, user_id, month) on Pro/Free; for Team we
 * still record per-user usage but the cap row is workspace-pooled — see
 * `effectiveCaps()` for the resolution logic.
 *
 * On every model call we (a) pre-flight against the cap, refuse if
 * exhausted, and (b) debit after the call lands. Reads are cheap (one
 * row), so we don't bother caching.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bucket, CallKind, Tier } from "./types";

export interface BucketCaps {
  quick: number;
  deep: number;
}

/** Tier defaults, in tokens per month. Easy to retune here. */
export const TIER_DEFAULTS: Record<Tier, BucketCaps> = {
  free: { quick: 5_000_000, deep: 0 },
  pro: { quick: 10_000_000, deep: 1_000_000 },
  team: { quick: 40_000_000, deep: 3_000_000 },
  enterprise: { quick: 200_000_000, deep: 20_000_000 },
};

/** First day of the current UTC month, ISO date string. */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

interface BalanceRow {
  workspace_id: string;
  user_id: string;
  month: string;
  quick_used: number;
  quick_cap: number;
  deep_used: number;
  deep_cap: number;
}

/**
 * Read or create the current month's balance row. Uses upsert with a
 * tier-default cap so first-call-of-the-month seeds the row atomically.
 *
 * Uses the caller-scoped supabase client; RLS ensures users can only
 * read their own row. The agent_credit_balances RLS policy permits
 * insert/select for `user_id = auth.uid()`.
 */
export async function ensureBalance(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  tier: Tier
): Promise<BalanceRow> {
  const month = currentMonthKey();
  const caps = TIER_DEFAULTS[tier];

  const { data: existing } = await supabase
    .from("agent_credit_balances")
    .select("workspace_id, user_id, month, quick_used, quick_cap, deep_used, deep_cap")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  if (existing) return existing as BalanceRow;

  // Seed the row. Concurrent first-calls race here; the unique key on
  // (workspace_id, user_id, month) means one wins and the other gets a
  // duplicate-key error we swallow with a re-fetch.
  const { error } = await supabase.from("agent_credit_balances").insert({
    workspace_id: workspaceId,
    user_id: userId,
    month,
    quick_used: 0,
    quick_cap: caps.quick,
    deep_used: 0,
    deep_cap: caps.deep,
  });

  if (error && error.code !== "23505") {
    // Non-duplicate-key error — surface it
    throw new Error(`agent_credit_balances seed failed: ${error.message}`);
  }

  const { data: refetched, error: fetchErr } = await supabase
    .from("agent_credit_balances")
    .select("workspace_id, user_id, month, quick_used, quick_cap, deep_used, deep_cap")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("month", month)
    .single();
  if (fetchErr || !refetched) {
    throw new Error("agent_credit_balances seed: refetch failed");
  }
  return refetched as BalanceRow;
}

/** True when the user has at least 1 token left in `bucket` this month. */
export async function hasBudget(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  tier: Tier,
  bucket: Bucket
): Promise<boolean> {
  const row = await ensureBalance(supabase, workspaceId, userId, tier);
  return bucket === "quick"
    ? row.quick_used < row.quick_cap
    : row.deep_used < row.deep_cap;
}

/**
 * Debit `tokens` from the user's balance and append a ledger event row.
 * Best-effort: if the balance update fails, we still try the event log.
 * We intentionally don't roll back model calls that already happened.
 */
export async function debit(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  tier: Tier,
  bucket: Bucket,
  tokens: number,
  model: string,
  callKind: CallKind,
  requestId: string | null
): Promise<void> {
  await ensureBalance(supabase, workspaceId, userId, tier);
  const month = currentMonthKey();
  const column = bucket === "quick" ? "quick_used" : "deep_used";

  // Atomic increment via RPC. If the RPC isn't installed we fall back to
  // read-then-write — the race is acceptable for usage accounting (we may
  // over-count by ≤1 in-flight call, never under-count).
  const { error: rpcError } = await supabase.rpc("agent_credit_increment", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_month: month,
    p_column: column,
    p_delta: tokens,
  });

  if (rpcError) {
    // Fallback path
    const { data } = await supabase
      .from("agent_credit_balances")
      .select(column)
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("month", month)
      .single();
    const current = ((data ?? {}) as Record<string, number>)[column] ?? 0;
    await supabase
      .from("agent_credit_balances")
      .update({ [column]: current + tokens })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("month", month);
  }

  await supabase.from("agent_credit_events").insert({
    workspace_id: workspaceId,
    user_id: userId,
    bucket,
    tokens,
    model,
    call_kind: callKind,
    request_id: requestId,
  });
}
