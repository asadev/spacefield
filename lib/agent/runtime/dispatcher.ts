/* The runtime entrypoint. Loads recent conversation history, classifies,
 * branches to executor or orchestrator, formats the reply, debits credits.
 *
 * Conversation history is per-(user, channel). For WhatsApp we cap at the
 * last ~20 turns and let the LLM rely on prompt caching for the static
 * prefix. We don't store full transcripts long-term — agent_credit_events
 * has the audit trail we need.
 *
 * Phase 2 additions:
 *   - persona      — workspace-level tone/name injected into every prompt
 *   - permissions  — per-skill allow/confirm/deny gating
 *   - scope        — restrict skill catalog for per-app in-app chat
 *   - approval flow — when a 'confirm' tool comes up the bot pauses,
 *     stores a row in agent_pending_approvals, replies "say YES",
 *     and resumes execution on the next turn.
 */

import { randomUUID } from "node:crypto";
import { classify } from "./classifier";
import { runExecutor } from "./executor";
import { runOrchestrator } from "./orchestrator";
import { formatReply } from "./formatter";
import { debit, hasBudget } from "./budget";
import { ALL_SKILLS, executeToolGuarded, findTool, getSkillsByIds } from "@/lib/agent/skills";
import {
  DEFAULT_PERSONA,
  loadPersona,
  type AgentPersona,
} from "./persona";
import {
  clearPendingApproval,
  effectiveMode,
  isAffirmation,
  isNegation,
  loadPermissions,
  readPendingApproval,
  writePendingApproval,
  type PermissionsSnapshot,
} from "./permissions";
import type {
  CallUsage,
  ConversationMessage,
  DispatchResult,
  DispatchScope,
  IncomingMessage,
  SkillDefinition,
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

function isLikelySpacefieldProductQuestion(
  text: string,
  channel: IncomingMessage["channel"],
  scope: DispatchScope
): boolean {
  const q = text.toLowerCase();
  const productWords =
    /\b(spacefield|workspace|app|apps|installed|install|uninstall|tool|tools|store|market pulse|market snapshot|dashboard|crm|files?|boards?)\b/;
  if (!productWords.test(q)) return false;
  return (
    channel === "in_app" ||
    scope !== null ||
    /\b(spacefield|workspace|crm|files?|boards?|market pulse)\b/.test(q)
  );
}

function isLikelyAppsQuestion(text: string): boolean {
  return /\b(app|apps|installed|install|uninstall|tool|tools|store|market pulse|market snapshot|dashboard)\b/.test(
    text.toLowerCase()
  );
}

/** Restrict the skill catalog for a per-app scope. Always keeps `meta`. */
function applyScope(
  skills: SkillDefinition[],
  scope: DispatchScope
): SkillDefinition[] {
  if (!scope) return skills;
  const prefixes: Record<NonNullable<DispatchScope>, string[]> = {
    crm: ["crm.", "meta", "workspace"],
    files: ["files", "meta", "workspace"],
    boards: ["boards", "meta", "workspace"],
  };
  const allow = prefixes[scope];
  return skills.filter((s) =>
    allow.some((p) => s.id === p || s.id.startsWith(p))
  );
}

/** Resolve which skill owns a given tool name. */
function findSkillForTool(
  skills: SkillDefinition[],
  toolName: string
): SkillDefinition | null {
  for (const s of skills) {
    if (s.tools.some((t) => t.name === toolName)) return s;
  }
  return null;
}

function totalDebit(usage: CallUsage[]): { quick: number; deep: number } {
  const out = { quick: 0, deep: 0 };
  for (const u of usage) {
    if (u.bucket === "quick") out.quick += u.tokens;
    else out.deep += u.tokens;
  }
  return out;
}

export interface DispatchOptions {
  scope?: DispatchScope;
  persona?: AgentPersona;
  permissions?: PermissionsSnapshot;
}

export async function dispatch(
  message: IncomingMessage,
  ctx: UserContext,
  options: DispatchOptions = {}
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
  const channel = message.channel;
  const scope = options.scope ?? null;

  const persona =
    options.persona ?? (await loadPersona(ctx.supabase, ctx.workspaceId));
  const permissions =
    options.permissions ??
    (await loadPermissions(ctx.supabase, ctx.workspaceId));

  // 0) If there's a pending approval and the user said yes/no, resolve it
  // before calling any model. This is a deterministic short-circuit.
  const pending = await readPendingApproval(
    ctx.supabase,
    ctx.workspaceId,
    ctx.userId,
    channel
  );
  if (pending) {
    if (isAffirmation(message.text)) {
      const tool = findTool(ALL_SKILLS, pending.tool_name);
      if (!tool) {
        await clearPendingApproval(ctx.supabase, pending.id);
        const reply = "I lost track of that pending action. Try again from the top.";
        await appendHistory(ctx, channel, message.text, reply);
        return { reply, usage, creditUsed: { quick: 0, deep: 0 } };
      }
      // Re-check permissions against the current snapshot. If an admin
      // flipped this skill to 'deny' between the request and the YES,
      // we must not execute. The snapshot loaded above for this turn
      // is the freshest view we have.
      const mode = effectiveMode(permissions, pending.skill_id, tool);
      if (mode === "deny") {
        await clearPendingApproval(ctx.supabase, pending.id);
        const reply =
          "That action was disabled by an admin since you asked. Cancelled.";
        await appendHistory(ctx, channel, message.text, reply);
        return { reply, usage, creditUsed: { quick: 0, deep: 0 } };
      }
      const result = await executeToolGuarded(tool, pending.tool_input, ctx);
      await clearPendingApproval(ctx.supabase, pending.id);
      const reply = result.ok
        ? `Done — ${pending.summary}.`
        : `Couldn't complete that: ${result.error ?? "unknown error"}`;
      await appendHistory(ctx, channel, message.text, reply);
      return { reply, usage, creditUsed: { quick: 0, deep: 0 } };
    }
    if (isNegation(message.text)) {
      await clearPendingApproval(ctx.supabase, pending.id);
      const reply = "Cancelled. Nothing changed.";
      await appendHistory(ctx, channel, message.text, reply);
      return { reply, usage, creditUsed: { quick: 0, deep: 0 } };
    }
    // Neither yes nor no — drop the pending row and continue with normal
    // flow. Better to interpret the new message than to hold the user
    // hostage.
    await clearPendingApproval(ctx.supabase, pending.id);
  }

  const history = await loadHistory(ctx, channel);

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
      creditUsed: { quick: 0, deep: 0 },
    };
  }

  const classification = await classify(message.text, history);
  let classified = classification.result;
  if (
    isLikelyAppsQuestion(message.text) &&
    classified.complexity !== "off_topic" &&
    !classified.skills.includes("apps")
  ) {
    classified = {
      ...classified,
      skills: [...new Set([...classified.skills, "apps"])],
    };
  }
  if (
    classified.complexity === "off_topic" &&
    isLikelySpacefieldProductQuestion(message.text, channel, scope)
  ) {
    classified = {
      ...classified,
      complexity: "simple",
      requires_clarification: false,
      suggested_reply: undefined,
      skills: [...new Set([...classified.skills, "apps", "meta"])],
    };
  }
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
  if (classified.complexity === "off_topic") {
    const reply =
      classified.suggested_reply ??
      "I'm built for your Spacefield workspace — try 'show my pipeline' or 'what can you do'.";
    await appendHistory(ctx, channel, message.text, reply);
    return { reply, usage, creditUsed: totalDebit(usage) };
  }

  // 3) Bucket budget pre-check for the heavy call we're about to make.
  const bucket = pickBucket(classified.complexity);
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
      const skills = applyScope(
        getSkillsByIds(classified.skills),
        scope
      );
      const exec = await runExecutor(message.text, history, skills, ctx, {
        persona,
        permissions,
        channel,
      });
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
      const formatted = await formatReply(exec.text, persona);
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
      await appendHistory(ctx, channel, message.text, reply);
      return {
        reply,
        usage,
        budgetExhausted: true,
        creditUsed: totalDebit(usage),
        requiresApproval: exec.pendingApproval ?? undefined,
      };
    }
  }

  // 4) Run the appropriate model branch.
  const skills = applyScope(getSkillsByIds(classified.skills), scope);
  const branch =
    bucket === "deep"
      ? await runOrchestrator(message.text, history, skills, ctx, {
          persona,
          permissions,
          channel,
        })
      : await runExecutor(message.text, history, skills, ctx, {
          persona,
          permissions,
          channel,
        });

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

  // 5) Format for the channel.
  const formatted = await formatReply(branch.text, persona);
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

  await appendHistory(ctx, channel, message.text, formatted.text);

  return {
    reply: formatted.text,
    usage,
    creditUsed: totalDebit(usage),
    requiresApproval: branch.pendingApproval ?? undefined,
  };
}

// Re-exports for runtime helpers callers may need.
export {
  applyScope,
  findSkillForTool,
  DEFAULT_PERSONA,
  effectiveMode,
  loadPersona,
  loadPermissions,
  writePendingApproval,
};
