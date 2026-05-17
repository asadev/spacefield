/* Sonnet 4.5 multi-tool orchestrator.
 *
 * Used for "complex" intents — anything that needs planning, multi-step
 * reasoning, or coordinating across skills. Same loop shape as the
 * executor but with a longer turn budget (10) and the more capable
 * model. We aggressively cache the system prompt + tool catalog because
 * Sonnet's input price is the heaviest cost in the runtime.
 *
 * Phase 2 mirrors the executor: persona prefix, permission gate, and
 * pending-approval surface.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  cachedMessages,
  cachedSystem,
  cachedTools,
  totalInputTokens,
} from "./cache";
import {
  executeToolGuarded,
  findTool,
  getAllTools,
} from "@/lib/agent/skills";
import { getRuntimeModel } from "./_models";
import { DEFAULT_PERSONA, personaSystemPrefix, type AgentPersona } from "./persona";
import {
  effectiveMode,
  writePendingApproval,
  type PermissionsSnapshot,
} from "./permissions";
import { redact, unredact, mergeRedactionMaps } from "./redact";
import { summariseIfNeeded } from "./summarise";
import type {
  CallUsage,
  ConversationMessage,
  IncomingChannel,
  SkillDefinition,
  UserContext,
} from "./types";

const MAX_TURNS = 10;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function channelStyleHint(channel: IncomingChannel): string {
  if (channel === "in_app") {
    return "You reach the user via an in-app chat panel. Plain text or simple lists are fine; keep replies tight and skim-friendly.";
  }
  if (channel === "telegram") {
    return "You reach the user via Telegram — short paragraphs, no markdown.";
  }
  return "You reach the user via WhatsApp — short paragraphs, no markdown, the kind that look right in a chat bubble.";
}

function buildSystemPrompt(
  skills: SkillDefinition[],
  ctx: UserContext,
  persona: AgentPersona,
  channel: IncomingChannel
): string {
  const fragments = skills.map((s) => `[${s.id}] ${s.systemFragment}`).join("\n");
  return `${personaSystemPrefix(persona)}

You are the Spacefield workspace orchestrator — handling multi-step user requests.
The user is ${ctx.user.email ?? ctx.userId} (role: ${ctx.role}, tier: ${ctx.tier}) on workspace_id ${ctx.workspaceId}.
${channelStyleHint(channel)}

Skills in scope:
${fragments}

Approach:
1. Plan the steps in your head before calling any tool.
2. Call tools in parallel when they don't depend on each other.
3. After each tool call, decide if you have enough to answer or need another step.
4. Stop as soon as you have what the user wants.
5. If a tool returns {pending_approval: true}, the workspace requires the user to confirm. Tell the user what you'd like to do and stop. Do not call any more tools that turn.

Output rules:
- Plain text, no markdown headings, no bullet lists with **bold**.
- Quote the actual values (deal name, amount, contact name) so the user knows what happened.
- If something failed, say so plainly.`;
}

function toAnthropicTools(skills: SkillDefinition[]): Anthropic.Messages.Tool[] {
  return getAllTools(skills).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool["input_schema"],
  }));
}

function historyToAnthropic(
  history: ConversationMessage[]
): Anthropic.Messages.MessageParam[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

export interface OrchestratorPendingApproval {
  skillId: string;
  toolName: string;
  summary: string;
}

export interface OrchestratorResult {
  text: string;
  usage: CallUsage[];
  pendingApproval?: OrchestratorPendingApproval;
}

export interface OrchestratorOptions {
  persona?: AgentPersona;
  permissions?: PermissionsSnapshot;
  channel?: IncomingChannel;
}

function summarizeToolCall(toolName: string, input: unknown): string {
  const safeInput =
    typeof input === "object" && input !== null
      ? Object.entries(input as Record<string, unknown>)
          .slice(0, 3)
          .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
          .join(", ")
      : "";
  return safeInput
    ? `${toolName.replace(/_/g, " ")} (${safeInput})`
    : toolName.replace(/_/g, " ");
}

export async function runOrchestrator(
  userText: string,
  history: ConversationMessage[],
  skills: SkillDefinition[],
  ctx: UserContext,
  options: OrchestratorOptions = {}
): Promise<OrchestratorResult> {
  const usage: CallUsage[] = [];
  const persona = options.persona ?? DEFAULT_PERSONA;
  const channel: IncomingChannel = options.channel ?? ctx.channel;
  // Resolve the model lazily per dispatch so admin edits to
  // runtime_model_assignments take effect without a server restart.
  const resolved = await getRuntimeModel("orchestrator");
  const MODEL = resolved.id;
  // System prompt + tool catalog get cache_control: ephemeral markers
  // (via cachedSystem / cachedTools) so the heavy Sonnet prefix bills at
  // ~10% on repeated turns.
  const system = cachedSystem(buildSystemPrompt(skills, ctx, persona, channel));
  const tools = cachedTools(toAnthropicTools(skills));

  // Strip PII from history + user input before crossing the network.
  const redactedHistory = history.map((m) => {
    const r = redact(m.content);
    return { role: m.role, content: r.text, _map: r.map };
  });
  const redactedUser = redact(userText);
  const piiMap = mergeRedactionMaps([
    ...redactedHistory.map((m) => m._map),
    redactedUser.map,
  ]);

  // Long-context guard. Orchestrator gets the same 80k cap; if the
  // history exceeds it we collapse older turns to a Haiku summary.
  const flat = redactedHistory.map((m) => ({ role: m.role, content: m.content }));
  const compacted = await summariseIfNeeded(flat, 80_000);

  const messages: Anthropic.Messages.MessageParam[] = compacted.map((m) => {
    if (m.role === "system") {
      return { role: "user", content: m.content };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });
  messages.push({ role: "user", content: redactedUser.text });

  let finalText = "";
  let pendingApproval: OrchestratorPendingApproval | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const cachedMsgs = cachedMessages(messages);
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools,
      messages: cachedMsgs,
    });

    usage.push({
      bucket: "deep",
      tokens: totalInputTokens(response.usage) + response.usage.output_tokens,
      model: MODEL,
      callKind: "orchestrator",
    });

    if (response.stop_reason === "end_turn") {
      finalText =
        response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim() || finalText;
      break;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
      );
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const owningSkill = skills.find((s) =>
          s.tools.some((t) => t.name === use.name)
        );
        const tool = findTool(skills, use.name);
        if (!tool || !owningSkill) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `error: tool ${use.name} not found`,
            is_error: true,
          });
          continue;
        }
        if (options.permissions) {
          const mode = effectiveMode(options.permissions, owningSkill.id, tool);
          if (mode === "deny") {
            toolResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify({
                ok: false,
                error: "permission_denied",
                message: `The workspace has disabled ${owningSkill.id} writes via the assistant.`,
              }),
              is_error: true,
            });
            continue;
          }
          if (mode === "confirm" && !tool.read_only) {
            const summary = summarizeToolCall(use.name, use.input);
            await writePendingApproval(ctx.supabase, {
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              channel,
              skillId: owningSkill.id,
              toolName: use.name,
              toolInput: use.input,
              summary,
            });
            pendingApproval = {
              skillId: owningSkill.id,
              toolName: use.name,
              summary,
            };
            toolResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify({
                ok: false,
                pending_approval: true,
                summary,
                message: `Action paused. Asked the user to confirm: "${summary}". Reply with the confirmation prompt; do NOT call this tool again until they say yes.`,
              }),
            });
            continue;
          }
        }
        const result = await executeToolGuarded(tool, use.input, ctx);
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result),
          is_error: !result.ok,
        });
      }
      messages.push({ role: "user", content: toolResults });

      if (pendingApproval) {
        const cachedMsgs2 = cachedMessages(messages);
        const followup = await client().messages.create({
          model: MODEL,
          max_tokens: 256,
          system,
          tools,
          messages: cachedMsgs2,
        });
        usage.push({
          bucket: "deep",
          tokens:
            totalInputTokens(followup.usage) + followup.usage.output_tokens,
          model: MODEL,
          callKind: "orchestrator",
        });
        finalText =
          followup.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim() ||
          `I'd like to ${pendingApproval.summary}. Reply YES to confirm.`;
        break;
      }
      continue;
    }

    finalText =
      response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "I hit a snag working through that. Could you try rephrasing?";
    break;
  }

  const renderedText = unredact(finalText || "Done.", piiMap);

  return {
    text: renderedText,
    usage,
    pendingApproval,
  };
}
