import "server-only";

/**
 * lib/whatsapp/ai.ts — server-side AI assist for the inbox (EPIC-11).
 *
 * Reuses the platform's already-configured AI provider keys (ANTHROPIC_API_KEY
 * preferred, OPENAI_API_KEY fallback) — both SDKs are already dependencies
 * (@anthropic-ai/sdk, openai) and used elsewhere (lib/ai/*). We do NOT add a
 * parallel AI system: this is a thin task-shaped wrapper around the same keys.
 *
 * Four one-click tasks, all inbox-side (read + sendText only, no new WhatsApp
 * protocol dependency):
 *   - draft      : suggest a reply from thread + contact context (operator edits)
 *   - summarize  : condense a long haggling thread
 *   - translate  : Urdu <-> English <-> Roman-Urdu
 *   - transcribe : inbound voice note bytes -> text (written to
 *                  whatsapp_messages.transcription by the route)
 *
 * If NEITHER provider key is configured, isAIConfigured() is false and the
 * route returns a clear "ai_not_configured" state instead of failing — so the
 * UI degrades gracefully and the build never depends on a key being present.
 *
 * All calls are server-side; keys are never sent to the browser.
 */

export type AIProvider = "anthropic" | "openai" | "none";

export function aiProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export function isAIConfigured(): boolean {
  return aiProvider() !== "none";
}

// Conservative model picks — small/fast, cheap, and widely available. Kept as
// env-overridable so ops can point at whatever the account has provisioned.
const ANTHROPIC_MODEL =
  process.env.WHATSAPP_AI_ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
const OPENAI_MODEL = process.env.WHATSAPP_AI_OPENAI_MODEL || "gpt-4o-mini";

const TIMEOUT_MS = 30_000;

/** Low-level text completion against whichever provider is configured. */
async function complete(
  system: string,
  user: string,
  opts?: { maxTokens?: number },
): Promise<string> {
  const provider = aiProvider();
  const maxTokens = opts?.maxTokens ?? 700;

  if (provider === "anthropic") {
    // Lazy import so the SDK isn't pulled into bundles that don't call AI.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: TIMEOUT_MS,
    });
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    return res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  }

  if (provider === "openai") {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: TIMEOUT_MS,
    });
    const res = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  }

  throw new Error("ai_not_configured");
}

export interface ThreadTurn {
  direction: "inbound" | "outbound";
  body: string;
  created_at?: string | null;
}

function renderThread(turns: ThreadTurn[], contactName?: string | null): string {
  const who = (d: "inbound" | "outbound") =>
    d === "inbound" ? contactName?.trim() || "Customer" : "Shop";
  return turns
    .filter((t) => (t.body ?? "").trim())
    .map((t) => `${who(t.direction)}: ${t.body.trim()}`)
    .join("\n");
}

/** Suggest a reply the operator can edit before sending. */
export async function aiDraftReply(params: {
  turns: ThreadTurn[];
  contactName?: string | null;
  instruction?: string | null;
}): Promise<string> {
  const system =
    "You are a helpful, polite assistant for a small business answering " +
    "WhatsApp messages from customers. Write a SHORT reply (1-3 sentences) " +
    "the shopkeeper can send. Match the customer's language (English, Urdu, " +
    "or Roman-Urdu). Be warm and concrete. Do NOT invent prices, stock, or " +
    "delivery details you were not given — if unknown, ask politely. Output " +
    "ONLY the reply text, no preamble, no quotes.";
  const thread = renderThread(params.turns, params.contactName);
  const extra = params.instruction?.trim()
    ? `\n\nOperator instruction for this reply: ${params.instruction.trim()}`
    : "";
  const user = `Conversation so far:\n${thread}${extra}\n\nWrite the next reply from the shop:`;
  return complete(system, user, { maxTokens: 400 });
}

/** Summarize a long thread into a few bullets. */
export async function aiSummarize(params: {
  turns: ThreadTurn[];
  contactName?: string | null;
}): Promise<string> {
  const system =
    "You summarize a WhatsApp customer conversation for a busy shopkeeper. " +
    "Give 3-6 short bullet points: what the customer wants, key details " +
    "(sizes/colors/quantities/prices/city if mentioned), any commitments " +
    "made, and the open question or next step. Be terse. Output bullets only.";
  const thread = renderThread(params.turns, params.contactName);
  const user = `Conversation:\n${thread}\n\nSummary:`;
  return complete(system, user, { maxTokens: 500 });
}

export type TranslateTarget = "english" | "urdu" | "roman_urdu";

const TARGET_LABEL: Record<TranslateTarget, string> = {
  english: "English",
  urdu: "Urdu (Nastaʿlīq script)",
  roman_urdu: "Roman Urdu (Urdu written in Latin letters)",
};

/** Translate arbitrary text to the requested target. */
export async function aiTranslate(params: {
  text: string;
  target: TranslateTarget;
}): Promise<string> {
  const label = TARGET_LABEL[params.target] ?? "English";
  const system =
    `You are a translator. Translate the user's message into ${label}. ` +
    "Preserve meaning and tone; keep it natural for everyday WhatsApp chat. " +
    "Output ONLY the translation, nothing else.";
  return complete(system, params.text, { maxTokens: 600 });
}

/**
 * Transcribe an inbound voice note. base64 audio + mimetype. Uses the
 * OpenAI audio-transcription endpoint when an OpenAI key is present (Whisper
 * drops Urdu badly per prior CAD-agent finding, but it's the only transcription
 * surface we have wired without a new dep — language is left auto). Returns
 * null when transcription isn't possible so callers degrade gracefully.
 */
export async function aiTranscribe(params: {
  base64: string;
  mimetype: string;
}): Promise<string | null> {
  // Transcription needs OpenAI specifically (Anthropic has no audio endpoint).
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
    });
    const bytes = Buffer.from(params.base64, "base64");
    const ext = params.mimetype.includes("mp4")
      ? "mp4"
      : params.mimetype.includes("mpeg")
        ? "mp3"
        : params.mimetype.includes("wav")
          ? "wav"
          : "ogg";
    // `toFile` builds a File the SDK accepts without touching the filesystem.
    const { toFile } = await import("openai/uploads");
    const file = await toFile(bytes, `voice.${ext}`, { type: params.mimetype });
    const res = await client.audio.transcriptions.create({
      model: process.env.WHATSAPP_AI_TRANSCRIBE_MODEL || "whisper-1",
      file,
    });
    return (res.text ?? "").trim() || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.ai] transcribe failed:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
