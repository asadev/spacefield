import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { recordAdminAction } from "@/app/admin/_audit";
import type { AiAgentRow } from "@/app/admin/_types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* POST /api/admin/playground/agent-run
 *
 * Body: { agent_id: string, message: string, history?: { role, content }[] }
 *
 * Loads the agent row, calls the Anthropic SDK directly with the agent's
 * `system_prompt` + `model`, returns `{ ok, reply, model, tokens_in,
 * tokens_out }`. Logs to `ai_agent_runs` and audit-logs as
 * `playground.agent_run`.
 *
 * No skill / tool dispatch — this is the simplest "what does the system
 * prompt sound like" loop. The full runtime (executor.ts + tool guard)
 * needs a real user context; here we just hit the model.
 */

type HistoryItem = { role: "user" | "assistant"; content: string };

type AgentRunBody = {
  agent_id?: unknown;
  message?: unknown;
  history?: unknown;
};

function parseHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryItem[] = [];
  for (const item of raw.slice(-30)) {
    if (!item || typeof item !== "object") continue;
    const r = (item as Record<string, unknown>).role;
    const c = (item as Record<string, unknown>).content;
    if ((r !== "user" && r !== "assistant") || typeof c !== "string") continue;
    if (!c.trim()) continue;
    out.push({ role: r, content: c.slice(0, 8000) });
  }
  return out;
}

function excerpt(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export async function POST(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  let parsed: AgentRunBody;
  try {
    parsed = (await req.json()) as AgentRunBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const agentId =
    typeof parsed.agent_id === "string" ? parsed.agent_id.trim() : "";
  const message =
    typeof parsed.message === "string" ? parsed.message.trim() : "";
  if (!agentId || !message) {
    return NextResponse.json(
      { ok: false, error: "agent_id_and_message_required" },
      { status: 400 }
    );
  }

  const history = parseHistory(parsed.history);

  const adminDb = createAdminClient();
  const { data: agentData, error: agentErr } = await adminDb
    .from("ai_agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr) {
    return NextResponse.json(
      { ok: false, error: agentErr.message },
      { status: 500 }
    );
  }
  const agent = agentData as AiAgentRow | null;
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "agent_not_found" },
      { status: 404 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: "no_api_key" });
  }

  const startedAt = Date.now();
  let reply = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let runStatus: "success" | "error" = "success";
  let runError: string | null = null;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history,
      { role: "user", content: message },
    ];

    const response = await client.messages.create({
      model: agent.model || "claude-sonnet-4-6",
      max_tokens: Math.max(64, Math.min(agent.max_tokens || 1024, 8192)),
      temperature:
        typeof agent.temperature === "number"
          ? Math.max(0, Math.min(agent.temperature, 1))
          : 0.4,
      system: agent.system_prompt || "",
      messages,
    });

    for (const block of response.content) {
      if (block.type === "text") reply += block.text;
    }
    tokensIn = response.usage?.input_tokens ?? 0;
    tokensOut = response.usage?.output_tokens ?? 0;
  } catch (e) {
    runStatus = "error";
    runError = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;

  // Log the run (best-effort — never block the response on this).
  try {
    await adminDb.from("ai_agent_runs").insert({
      agent_id: agent.id,
      workspace_id: null,
      user_id: auth.userId,
      channel: "admin_playground",
      status: runStatus,
      input_excerpt: excerpt(message, 500),
      output_excerpt: reply ? excerpt(reply, 500) : null,
      tokens_in: tokensIn || null,
      tokens_out: tokensOut || null,
      duration_ms: durationMs,
      model: agent.model,
      error: runError,
      metadata: {
        source: "admin_playground",
        history_length: history.length,
      },
    });
  } catch {
    /* non-fatal */
  }

  try {
    await recordAdminAction({
      action: "playground.agent_run",
      targetType: "ai_agent",
      targetId: agent.id,
      metadata: {
        model: agent.model,
        status: runStatus,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        duration_ms: durationMs,
      },
    });
  } catch {
    /* non-fatal */
  }

  if (runStatus === "error") {
    return NextResponse.json(
      {
        ok: false,
        error: runError ?? "model_error",
        model: agent.model,
        duration_ms: durationMs,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    reply,
    model: agent.model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    duration_ms: durationMs,
  });
}
