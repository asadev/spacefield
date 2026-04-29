/* Reply formatter — Haiku rewrites raw executor/orchestrator output into
 * natural WhatsApp text.
 *
 * The executor and orchestrator already aim for plain-text output, but
 * Sonnet sometimes leaks markdown fences or numbered lists; the formatter
 * is a single cheap pass that normalizes that. We skip the formatter for
 * very short replies (<140 chars) — they're already on-brand.
 */

import Anthropic from "@anthropic-ai/sdk";
import { totalInputTokens } from "./cache";
import type { CallUsage } from "./types";

const MODEL = "claude-haiku-4-5";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM = `You rewrite messages to fit WhatsApp.
Rules:
- Plain text. No markdown headings. No **bold** or *italic*. No bullet symbols (•, –). Hyphens are fine.
- Maximum 4 short paragraphs. Each ≤ ~3 lines.
- Keep all factual content (names, numbers, dates) verbatim.
- Don't add greetings or sign-offs.
- Don't apologize for length; just shorten.
Return only the rewritten text.`;

export interface FormatterResult {
  text: string;
  usage: CallUsage[];
}

export async function formatReply(raw: string): Promise<FormatterResult> {
  const trimmed = raw.trim();
  if (trimmed.length < 140 && !/[*_#`]/.test(trimmed)) {
    return { text: trimmed, usage: [] };
  }

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM,
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
