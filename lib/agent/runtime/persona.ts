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

import type { SupabaseClient } from "@supabase/supabase-js";

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
  const lines: string[] = [];
  lines.push(`You are "${p.bot_name}".`);
  lines.push(TONE_GUIDANCE[p.voice_tone]);
  if (p.persona_description.trim().length > 0) {
    lines.push(`About you: ${p.persona_description.trim()}`);
  }
  return lines.join("\n");
}
