/* Shared helpers for skill tool implementations.
 *
 * Tool execute() functions must always go through the caller's Supabase
 * client (ctx.supabase) so RLS still gates every read/write. We never
 * construct a service-role client here — even for "read-only" lookups,
 * because the caller's tier + workspace_member check is RLS-enforced.
 */

import type { ToolExecuteResult, UserContext } from "@/lib/agent/runtime/types";

/** Wrap an arbitrary thrown value into a structured ToolExecuteResult. */
export function toolError(message: string): ToolExecuteResult {
  return { ok: false, error: message };
}

export function toolOk(data: unknown): ToolExecuteResult {
  return { ok: true, data };
}

/** Asserts ctx.role meets the tool's required minimum. */
export function checkRole(
  ctx: UserContext,
  required: "owner" | "admin" | "member"
): string | null {
  const order: Record<string, number> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
  };
  const have = order[ctx.role] ?? 0;
  const need = order[required] ?? 1;
  if (have < need) {
    return `requires_${required}_role`;
  }
  return null;
}

/** Free-tier guard: refuses non-readonly tools. */
export function checkFreeTier(
  ctx: UserContext,
  readOnly: boolean
): string | null {
  if (ctx.tier === "free" && !readOnly) {
    return "free_tier_read_only";
  }
  return null;
}

/**
 * Run a Supabase query and convert the response into a ToolExecuteResult,
 * stripping null/undefined and normalizing error shape.
 */
export async function runQuery<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<ToolExecuteResult> {
  try {
    const { data, error } = await promise;
    if (error) return toolError(error.message);
    return toolOk(data ?? null);
  } catch (e) {
    return toolError((e as Error).message);
  }
}

/**
 * Truncate a list result to at most `limit` items so the LLM doesn't get
 * pages of context for a "show me my deals" question.
 */
export function clampList<T>(items: T[] | null | undefined, limit = 25): T[] {
  if (!items) return [];
  return items.slice(0, limit);
}
