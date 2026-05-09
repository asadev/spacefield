/* Haiku 4.5 single-tool executor.
 *
 * Used for "simple" intents: one skill in scope, one (sometimes two) tool
 * calls, deterministic action. We give it 6 turns of headroom so it can
 * recover from a bad tool call, but in practice it lands in 1–2.
 *
 * The system prompt + tool catalog get cache_control breakpoints so
 * repeated calls within a 5-minute window read at ~10% of normal price.
 * See cache.ts for the placement.
 *
 * Phase 2: accepts a persona (style only) and a permissions snapshot.
 * When a write tool would run under 'confirm' mode, the executor stops
 * and surfaces a pendingApproval to the dispatcher.
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
import type {
  CallUsage,
  ConversationMessage,
  IncomingChannel,
  SkillDefinition,
  UserContext,
} from "./types";

const MAX_TURNS = 6;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function channelStyleHint(channel: IncomingChannel): string {
  if (channel === "in_app") {
    return "You reach the user via an in-app chat panel inside their Spacefield workspace. Plain text or simple markdown lists are fine; keep replies tight.";
  }
  if (channel === "telegram") {
    return "You reach the user via Telegram — keep responses short, plain text, no markdown.";
  }
  return "You reach the user via WhatsApp — keep responses short, plain text, no markdown.";
}

function buildSystemPrompt(
  skills: SkillDefinition[],
  ctx: UserContext,
  persona: AgentPersona,
  channel: IncomingChannel
): string {
  const fragments = skills.map((s) => `[${s.id}] ${s.systemFragment}`).join("\n");
  return `${personaSystemPrefix(persona)}

You are the Spacefield workspace assistant.
The user is ${ctx.user.email ?? ctx.userId} (role: ${ctx.role}, tier: ${ctx.tier}) on workspace_id ${ctx.workspaceId}.
${channelStyleHint(channel)}

You have access to these skills:
${fragments}

Rules:
- Use a tool when the user asks for data or wants to change something. Don't guess.
- If a tool returns ok:false, briefly explain the error to the user; don't retry blindly.
- If a tool returns {pending_approval: true}, the action was paused waiting for the user. Tell them what you'd like to do and ask them to reply YES to confirm. Do NOT call any more tools in that turn.
- Don't list more than ~5 items in a reply unless the user asked for "all" of them.
- For destructive actions (delete, close-lost, etc.), confirm with the user first if their request was ambiguous. If they said "delete X", just do it.
- Respond in the user's language; default to English.`;
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

export interface ExecutorPendingApproval {
  skillId: string;
  toolName: string;
  summary: string;
}

export interface ExecutorResult {
  text: string;
  usage: CallUsage[];
  pendingApproval?: ExecutorPendingApproval;
}

export interface ExecutorOptions {
  persona?: AgentPersona;
  permissions?: PermissionsSnapshot;
  channel?: IncomingChannel;
}

function summarizeToolCall(toolName: string, input: unknown): string {
  // Keep it short — one line. Avoid dumping full JSON in the bot reply.
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

export async function runExecutor(
  userText: string,
  history: ConversationMessage[],
  skills: SkillDefinition[],
  ctx: UserContext,
  options: ExecutorOptions = {}
): Promise<ExecutorResult> {
  const usage: CallUsage[] = [];
  const persona = options.persona ?? DEFAULT_PERSONA;
  const channel: IncomingChannel = options.channel ?? ctx.channel;
  // Resolve the model lazily per dispatch so admin edits to
  // runtime_model_assignments take effect without a server restart.
  const resolved = await getRuntimeModel("executor");
  const MODEL = resolved.id;
  const system = cachedSystem(buildSystemPrompt(skills, ctx, persona, channel));
  const tools = cachedTools(toAnthropicTools(skills));

  const messages: Anthropic.Messages.MessageParam[] = [
    ...historyToAnthropic(history),
    { role: "user", content: userText },
  ];

  let finalText = "";
  let pendingApproval: ExecutorPendingApproval | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const cachedMsgs = cachedMessages(messages);
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages: cachedMsgs,
    });

    usage.push({
      bucket: "quick",
      tokens: totalInputTokens(response.usage) + response.usage.output_tokens,
      model: MODEL,
      callKind: "executor",
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
      // Append the assistant turn (incl. tool_use blocks) to history.
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

        // Permission gate. read_only tools always pass through here.
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

      // If we just paused a write, stop the loop after one final
      // model turn to let the model phrase the confirmation question.
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
          bucket: "quick",
          tokens:
            totalInputTokens(followup.usage) + followup.usage.output_tokens,
          model: MODEL,
          callKind: "executor",
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

    // Any other stop reason — collect any text and exit.
    finalText =
      response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "I hit a snag. Try again?";
    break;
  }

  return {
    text: finalText || "Done.",
    usage,
    pendingApproval,
  };
}
