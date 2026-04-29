/* Haiku 4.5 single-tool executor.
 *
 * Used for "simple" intents: one skill in scope, one (sometimes two) tool
 * calls, deterministic action. We give it 6 turns of headroom so it can
 * recover from a bad tool call, but in practice it lands in 1–2.
 *
 * The system prompt + tool catalog get cache_control breakpoints so
 * repeated calls within a 5-minute window read at ~10% of normal price.
 * See cache.ts for the placement.
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
import type {
  CallUsage,
  ConversationMessage,
  SkillDefinition,
  UserContext,
} from "./types";

const MODEL = "claude-haiku-4-5";
const MAX_TURNS = 6;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function buildSystemPrompt(skills: SkillDefinition[], ctx: UserContext): string {
  const fragments = skills.map((s) => `[${s.id}] ${s.systemFragment}`).join("\n");
  return `You are the Spacefield workspace assistant.
The user is ${ctx.user.email ?? ctx.userId} (role: ${ctx.role}, tier: ${ctx.tier}) on workspace_id ${ctx.workspaceId}.
You reach the user via WhatsApp — keep responses short, plain text, no markdown.

You have access to these skills:
${fragments}

Rules:
- Use a tool when the user asks for data or wants to change something. Don't guess.
- If a tool returns ok:false, briefly explain the error to the user; don't retry blindly.
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

export interface ExecutorResult {
  text: string;
  usage: CallUsage[];
}

export async function runExecutor(
  userText: string,
  history: ConversationMessage[],
  skills: SkillDefinition[],
  ctx: UserContext
): Promise<ExecutorResult> {
  const usage: CallUsage[] = [];
  const system = cachedSystem(buildSystemPrompt(skills, ctx));
  const tools = cachedTools(toAnthropicTools(skills));

  const messages: Anthropic.Messages.MessageParam[] = [
    ...historyToAnthropic(history),
    { role: "user", content: userText },
  ];

  let finalText = "";

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
        const tool = findTool(skills, use.name);
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `error: tool ${use.name} not found`,
            is_error: true,
          });
          continue;
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
  };
}
