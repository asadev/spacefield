/* Prompt caching helpers for Anthropic calls.
 *
 * Spacefield's executor/orchestrator both replay the same large system
 * prompt + tool catalog on every WhatsApp turn. With Anthropic's prompt
 * caching, the cached prefix lands at ~10% input cost, vs. 100% baseline
 * + a 25% write premium on the very first turn. The whole point is to
 * keep the prefix BYTE-IDENTICAL across requests — any drift (timestamp,
 * varying skill list, reordered tools) silently invalidates the cache
 * and we pay full price again. See shared/prompt-caching.md for the
 * audit checklist.
 *
 * Render order is tools → system → messages. We put a cache_control
 * breakpoint on:
 *   1. The last system text block — caches tools + system together
 *   2. The last cached user turn (for multi-turn replay)
 *
 * That's 2 of the 4 allowed breakpoints; we leave the others for future
 * use (e.g. a separate "long-running session" breakpoint).
 */

import type Anthropic from "@anthropic-ai/sdk";

/** Wrap a plain string system prompt as a cacheable text block array. */
export function cachedSystem(
  text: string
): Anthropic.Messages.TextBlockParam[] {
  return [
    {
      type: "text",
      text,
      cache_control: { type: "ephemeral" },
    },
  ];
}

/**
 * Annotate the last tool with cache_control so the entire tool list is
 * cached together with the system prompt. Returns a new array; does not
 * mutate input.
 */
export function cachedTools(
  tools: Anthropic.Messages.Tool[]
): Anthropic.Messages.Tool[] {
  if (tools.length === 0) return tools;
  const out: Anthropic.Messages.Tool[] = tools.slice(0, -1);
  const last = tools[tools.length - 1];
  out.push({
    ...last,
    cache_control: { type: "ephemeral" },
  });
  return out;
}

/**
 * Mark the most recent user message as a cache breakpoint for multi-turn
 * conversations. Subsequent requests will read from this cache point.
 *
 * No-op when there's only a single message (cache write costs more than
 * a one-shot read pays back).
 */
export function cachedMessages(
  messages: Anthropic.Messages.MessageParam[]
): Anthropic.Messages.MessageParam[] {
  if (messages.length < 2) return messages;
  const out = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  if (typeof last.content === "string") {
    out.push({
      role: last.role,
      content: [
        {
          type: "text",
          text: last.content,
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  } else {
    // Already structured — annotate the last block.
    const blocks = last.content.slice(0, -1);
    const lastBlock = last.content[last.content.length - 1];
    if ("cache_control" in lastBlock || lastBlock.type !== "text") {
      out.push(last);
    } else {
      blocks.push({
        ...lastBlock,
        cache_control: { type: "ephemeral" },
      });
      out.push({ role: last.role, content: blocks });
    }
  }
  return out;
}

/** Sum total input tokens (cached + uncached) from an Anthropic response. */
export function totalInputTokens(usage: Anthropic.Messages.Usage): number {
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return usage.input_tokens + cacheCreate + cacheRead;
}
