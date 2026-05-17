/* Per-workspace persona — name, tone, optional flavor description.
 *
 * The runtime loads the persona once per dispatch and threads it through
 * the classifier / executor / orchestrator / formatter system prompts as
 * a SHORT prefix block. Tools + skills stay locked. The persona only
 * affects style.
 *
 * Defaults (no row in agent_personas) are baked into DEFAULT_PERSONA so
 * the runtime is identity-stable when persistence is unavailable.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripPromptInjectionMarkers } from "./_sanitize";

// Persona fields are authored by workspace admins and flow straight into
// the system prompt. A hostile (or compromised) admin could embed
// `system:` directives, role-tag tokens, or newline-padded payloads to
// override the model's instructions for every dispatch in the workspace.
// We strip those markers and clamp length so the persona block is style-
// only, never authoritative.
const PERSONA_DESCRIPTION_MAX = 1500;
const BOT_NAME_MAX = 60;

function sanitizeBotName(s: string): string {
  // Single-line, length-capped, role-tag-stripped.
  let out = stripPromptInjectionMarkers(s);
  out = out.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (out.length > BOT_NAME_MAX) out = out.slice(0, BOT_NAME_MAX);
  return out;
}

function sanitizePersonaDescription(s: string): string {
  // Multi-line allowed but role tags / control chars stripped + capped.
  let out = stripPromptInjectionMarkers(s);
  // Collapse runs of blank lines so an admin can't pad a fake system
  // directive far away from the description body.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  if (out.length > PERSONA_DESCRIPTION_MAX) {
    out = out.slice(0, PERSONA_DESCRIPTION_MAX) + "… [truncated]";
  }
  return out;
}

export type VoiceTone = "friendly" | "formal" | "casual" | "direct" | "playful";

export interface AgentPersona {
  bot_name: string;
  persona_description: string;
  voice_tone: VoiceTone;
  custom_greeting: string;
}

export const DEFAULT_PERSONA: AgentPersona = {
  bot_name: "Spacefield Assistant",
  persona_description: "",
  voice_tone: "friendly",
  custom_greeting: "",
};

const TONE_GUIDANCE: Record<VoiceTone, string> = {
  friendly:
    "Tone: warm and conversational. Sound like a helpful colleague — not a corporate bot.",
  formal:
    "Tone: professional and precise. No slang, no emoji, full sentences.",
  casual:
    "Tone: relaxed, low-friction. Contractions, short sentences, no stiffness.",
  direct:
    "Tone: brisk and to the point. Skip filler. State the answer first; explain only when asked.",
  playful:
    "Tone: lightly witty. A small joke is fine when nothing's at stake; never sarcastic about errors.",
};

function isValidTone(s: string): s is VoiceTone {
  return (
    s === "friendly" ||
    s === "formal" ||
    s === "casual" ||
    s === "direct" ||
    s === "playful"
  );
}

/** Read the workspace's persona, falling back to defaults. */
export async function loadPersona(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<AgentPersona> {
  const { data, error } = await supabase
    .from("agent_personas")
    .select("bot_name, persona_description, voice_tone, custom_greeting")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_PERSONA };
  return {
    bot_name:
      typeof data.bot_name === "string" && data.bot_name.trim().length > 0
        ? (data.bot_name as string)
        : DEFAULT_PERSONA.bot_name,
    persona_description:
      typeof data.persona_description === "string"
        ? (data.persona_description as string)
        : "",
    voice_tone:
      typeof data.voice_tone === "string" && isValidTone(data.voice_tone)
        ? data.voice_tone
        : DEFAULT_PERSONA.voice_tone,
    custom_greeting:
      typeof data.custom_greeting === "string"
        ? (data.custom_greeting as string)
        : "",
  };
}

/** Render a system-prompt prefix for the persona. Stable across calls so
 *  prompt-caching still hits, as long as the underlying row hasn't
 *  changed within the cache window. */
export function personaSystemPrefix(p: AgentPersona): string {
  const safeName = sanitizeBotName(p.bot_name) || DEFAULT_PERSONA.bot_name;
  const safeDesc = sanitizePersonaDescription(p.persona_description);
  const lines: string[] = [];
  lines.push(`You are "${safeName}".`);
  lines.push(TONE_GUIDANCE[p.voice_tone]);
  if (safeDesc.length > 0) {
    lines.push(`About you: ${safeDesc}`);
  }
  return lines.join("\n");
}

/**
 * Return the persona prefix as an Anthropic TextBlockParam with
 * `cache_control: ephemeral`. This is useful when callers want to split
 * the system field into multiple cache breakpoints — e.g. persona block
 * (stable per-workspace), skill catalogue (stable per-deploy), tail
 * rules (stable per-call). Anthropic caches a block only when it's
 * ≥1024 tokens; for short persona prefixes the breakpoint still costs
 * nothing (cache miss simply reads at base price).
 *
 * Today the executor and orchestrator concatenate the persona into the
 * full system string and cache the whole block via cachedSystem(). This
 * helper exists so future call sites (e.g. a long-running session agent
 * with a stable workspace persona but rotating system rules) can place a
 * cache breakpoint specifically at the persona boundary.
 */
export function personaCachedSystemBlock(
  p: AgentPersona
): Anthropic.Messages.TextBlockParam {
  return {
    type: "text",
    text: personaSystemPrefix(p),
    cache_control: { type: "ephemeral" },
  };
}
