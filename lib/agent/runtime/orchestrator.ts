/* Sonnet 4.5 multi-tool orchestrator.
 *
 * Used for "complex" intents — anything that needs planning, multi-step
 * reasoning, or coordinating across skills. Same loop shape as the
 * executor but with a longer turn budget (10) and the more capable
 * model. We aggressively cache the system prompt + tool catalog because
 * Sonnet's input price is the heaviest cost in the runtime.
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

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TURNS = 10;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function buildSystemPrompt(skills: SkillDefinition[], ctx: UserContext): string {
  const fragments = skills.map((s) => `[${s.id}] ${s.systemFragment}`).join("\n");
  return `You are the Spacefield workspace orchestrator — handling multi-step user requests over WhatsApp.
The user is ${ctx.user.email ?? ctx.userId} (role: ${ctx.role}, tier: ${ctx.tier}) on workspace_id ${ctx.workspaceId}.

Skills in scope:
${fragments}

Approach:
1. Plan the steps in your head before calling any tool.
2. Call tools in parallel when they don't depend on each other.
3. After each tool call, decide if you have enough to answer or need another step.
4. Stop as soon as you have what the user wants.

Output rules:
- Plain text, no markdown headings, no bullet lists with **bold**.
- Short paragraphs, the kind that look right in a WhatsApp bubble.
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

export interface OrchestratorResult {
  text: string;
  usage: CallUsage[];
}

export async function runOrchestrator(
  userText: string,
  history: ConversationMessage[],
  skills: SkillDefinition[],
  ctx: UserContext
): Promise<OrchestratorResult> {
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

    finalText =
      response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "I hit a snag working through that. Could you try rephrasing?";
    break;
  }

  return {
    text: finalText || "Done.",
    usage,
  };
}
