/* The runtime entrypoint. Loads recent conversation history, classifies,
 * branches to executor or orchestrator, formats the reply, debits credits.
 *
 * Conversation history is per-(user, channel). For WhatsApp we cap at the
 * last ~20 turns and let the LLM rely on prompt caching for the static
 * prefix. We don't store full transcripts long-term — agent_credit_events
 * has the audit trail we need.
 */

import { randomUUID } from "node:crypto";
import { classify } from "./classifier";
import { runExecutor } from "./executor";
import { runOrchestrator } from "./orchestrator";
import { formatReply } from "./formatter";
import { debit, hasBudget } from "./budget";
import { getSkillsByIds } from "@/lib/agent/skills";
import type {
  CallUsage,
  ConversationMessage,
  DispatchResult,
  IncomingMessage,
  UserContext,
} from "./types";

const HISTORY_LIMIT = 20;

async function loadHistory(
  ctx: UserContext,
  channel: string
): Promise<ConversationMessage[]> {
  const { data, error } = await ctx.supabase
    .from("agent_conversation_messages")
    .select("role, content")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error || !data) return [];
  // Reverse so oldest comes first.
  return (data as ConversationMessage[]).reverse();
}

async function appendHistory(
  ctx: UserContext,
  channel: string,
  user: string,
  assistant: string
): Promise<void> {
  await ctx.supabase.from("agent_conversation_messages").insert([
    {
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      channel,
      role: "user",
      content: user,
    },
    {
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      channel,
      role: "assistant",
      content: assistant,
    },
  ]);
}

function pickBucket(complexity: "simple" | "complex" | "off_topic"): "quick" | "deep" {
  return complexity === "complex" ? "deep" : "quick";
}

export async function dispatch(
  message: IncomingMessage,
  ctx: UserContext
): Promise<DispatchResult> {
  if (message.kind !== "text") {
    return {
      reply:
        "I can only handle text messages right now. Voice and image support are on the roadmap.",
      usage: [],
    };
  }

  const requestId = randomUUID();
  const usage: CallUsage[] = [];
  const history = await loadHistory(ctx, message.channel);

  // 1) Classify (Quick bucket).
  const quickOk = await hasBudget(
    ctx.supabase,
    ctx.workspaceId,
    ctx.userId,
    ctx.tier,
    "quick"
  );
  if (!quickOk) {
    return {
      reply:
        "You're out of monthly credits for the assistant. Open Spacefield → Settings → AI to top up.",
      usage,
      budgetExhausted: true,
    };
  }

  const classification = await classify(message.text, history);
  usage.push({
    bucket: "quick",
    tokens: classification.tokens,
    model: classification.model,
    callKind: "classifier",
  });
  await debit(
    ctx.supabase,
    ctx.workspaceId,
    ctx.userId,
    ctx.tier,
    "quick",
    classification.tokens,
    classification.model,
    "classifier",
    requestId
  );

  // 2) Off-topic short-circuit.
  if (classification.result.complexity === "off_topic") {
    const reply =
      classification.result.suggested_reply ??
      "I'm built for your Spacefield workspace — try 'show my pipeline' or 'what can you do'.";
    await appendHistory(ctx, message.channel, message.text, reply);
    return { reply, usage };
  }

  // 3) Bucket budget pre-check for the heavy call we're about to make.
  const bucket = pickBucket(classification.result.complexity);
  if (bucket === "deep") {
    const deepOk = await hasBudget(
      ctx.supabase,
      ctx.workspaceId,
      ctx.userId,
      ctx.tier,
      "deep"
    );
    if (!deepOk) {
      // Fall back to executor — better a partial answer than nothing.
      const skills = getSkillsByIds(classification.result.skills);
      const exec = await runExecutor(message.text, history, skills, ctx);
      usage.push(...exec.usage);
      for (const u of exec.usage) {
        await debit(
          ctx.supabase,
          ctx.workspaceId,
          ctx.userId,
          ctx.tier,
          u.bucket,
          u.tokens,
          u.model,
          u.callKind,
          requestId
        );
      }
      const formatted = await formatReply(exec.text);
      usage.push(...formatted.usage);
      for (const u of formatted.usage) {
        await debit(
          ctx.supabase,
          ctx.workspaceId,
          ctx.userId,
          ctx.tier,
          u.bucket,
          u.tokens,
          u.model,
          u.callKind,
          requestId
        );
      }
      const reply = `${formatted.text}\n\n(Heads up: you're out of Deep credits this month, so I used the simpler model. Top up in Settings.)`;
      await appendHistory(ctx, message.channel, message.text, reply);
      return { reply, usage, budgetExhausted: true };
    }
  }

  // 4) Run the appropriate model branch.
  const skills = getSkillsByIds(classification.result.skills);
  const branch =
    bucket === "deep"
      ? await runOrchestrator(message.text, history, skills, ctx)
      : await runExecutor(message.text, history, skills, ctx);

  usage.push(...branch.usage);
  for (const u of branch.usage) {
    await debit(
      ctx.supabase,
      ctx.workspaceId,
      ctx.userId,
      ctx.tier,
      u.bucket,
      u.tokens,
      u.model,
      u.callKind,
      requestId
    );
  }

  // 5) Format for WhatsApp.
  const formatted = await formatReply(branch.text);
  usage.push(...formatted.usage);
  for (const u of formatted.usage) {
    await debit(
      ctx.supabase,
      ctx.workspaceId,
      ctx.userId,
      ctx.tier,
      u.bucket,
      u.tokens,
      u.model,
      u.callKind,
      requestId
    );
  }

  await appendHistory(ctx, message.channel, message.text, formatted.text);

  return { reply: formatted.text, usage };
}
