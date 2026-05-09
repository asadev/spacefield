/* Reply formatter — Haiku rewrites raw executor/orchestrator output into
 * natural plain text fit for the channel.
 *
 * The executor and orchestrator already aim for plain-text output, but
 * Sonnet sometimes leaks markdown fences or numbered lists; the formatter
 * is a single cheap pass that normalizes that. We skip the formatter for
 * very short replies (<140 chars) — they're already on-brand.
 *
 * Phase 2: optional persona — we don't restyle the content, but we use
 * the bot_name when needed and keep the tone consistent.
 */

import Anthropic from "@anthropic-ai/sdk";
import { totalInputTokens } from "./cache";
import { getRuntimeModel } from "./_models";
import { DEFAULT_PERSONA, type AgentPersona } from "./persona";
import type { CallUsage } from "./types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function buildSystem(persona: AgentPersona): string {
  return `You rewrite messages so they read well in a chat (WhatsApp / Telegram / in-app).
You are "${persona.bot_name}".
Rules:
- Plain text. No markdown headings. No **bold** or *italic*. No bullet symbols (•, –). Hyphens are fine.
- Maximum 4 short paragraphs. Each ≤ ~3 lines.
- Keep all factual content (names, numbers, dates) verbatim.
- Don't add greetings or sign-offs.
- Don't apologize for length; just shorten.
Return only the rewritten text.`;
}

export interface FormatterResult {
  text: string;
  usage: CallUsage[];
}

export async function formatReply(
  raw: string,
  persona: AgentPersona = DEFAULT_PERSONA
): Promise<FormatterResult> {
  const trimmed = raw.trim();
  if (trimmed.length < 140 && !/[*_#`]/.test(trimmed)) {
    return { text: trimmed, usage: [] };
  }

  // Resolve the model lazily per call so admin edits to
  // runtime_model_assignments take effect without a server restart.
  const resolved = await getRuntimeModel("formatter");
  const MODEL = resolved.id;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: buildSystem(persona),
    messages: [{ role: "user", content: trimmed }],
  });

  const text =
    response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || trimmed;

  return {
    text,
    usage: [
      {
        bucket: "quick",
        tokens: totalInputTokens(response.usage) + response.usage.output_tokens,
        model: MODEL,
        callKind: "formatter",
      },
    ],
  };
}
