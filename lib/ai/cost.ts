import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { priceCall } from "./pricing";

/**
 * Per-AI-call cost ledger.
 *
 * The runtime should call `recordAiCall(...)` on every AI call —
 * orchestrator / executor / formatter / classifier / embeddings —
 * after the call returns. Errors are swallowed; this is fire-and-forget
 * by design (we don't want logging to take down the AI path).
 *
 * Cost is computed locally from `lib/ai/pricing.ts` so the DB doesn't
 * need to know about pricing. If the model isn't in the pricing table
 * we record cost=0 (caller can override with `cost_usd` if they want
 * to bypass the lookup).
 */
export interface RecordAiCallInput {
  workspace_id?: string | null;
  user_id?: string | null;
  agent_id?: string | null;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  /** Override the auto-computed cost (e.g. when we already know it). */
  cost_usd?: number;
  latency_ms?: number;
  status?: "ok" | "error" | string;
  error?: string | null;
}

export async function recordAiCall(input: RecordAiCallInput): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.floor(input.input_tokens ?? 0));
    const outputTokens = Math.max(0, Math.floor(input.output_tokens ?? 0));
    const cost =
      typeof input.cost_usd === "number"
        ? input.cost_usd
        : priceCall(input.model, inputTokens, outputTokens);

    const admin = createAdminClient();
    const { error } = await admin.from("ai_calls").insert({
      workspace_id: input.workspace_id ?? null,
      user_id: input.user_id ?? null,
      agent_id: input.agent_id ?? null,
      model: input.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      latency_ms: input.latency_ms ?? null,
      status: input.status ?? "ok",
      error: input.error ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[ai-cost] insert failed:", error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ai-cost] unexpected error:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

/**
 * Row shape returned by the `ai_cost_summary` RPC. Exposed so callers
 * don't have to redeclare it.
 */
export interface AiCostSummaryRow {
  agent_id: string | null;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/**
 * Convenience wrapper around the RPC. Pass a workspace_id to scope to
 * one workspace; omit for platform-wide.
 */
export async function fetchAiCostSummary(
  windowMinutes: number,
  workspaceId?: string | null
): Promise<AiCostSummaryRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ai_cost_summary", {
    p_window_minutes: windowMinutes,
    p_workspace_id: workspaceId ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[ai-cost] summary rpc failed:", error.message);
    return [];
  }
  return (data ?? []) as AiCostSummaryRow[];
}
