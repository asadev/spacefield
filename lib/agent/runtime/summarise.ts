/* Long-context summarisation.
 *
 * The dispatcher caps history at HISTORY_LIMIT turns, but a single turn
 * can carry a large tool output (CSV import, search across thousands of
 * rows), and the in-app chat panel keeps the same conversation alive
 * across days. Once the rolling history pushes past a token cap we
 * compress everything except the most recent N turns into a single
 * synthetic system message and prepend that.
 *
 * Token counting is approximate — Anthropic doesn't expose a tokeniser
 * client-side, and adding tiktoken would pull a wasm dep we don't need.
 * `chars/4` is the same rough estimate the Anthropic docs use for English.
 *
 * The summary call uses the same Anthropic client as the executor. We
 * intentionally don't go through `_models.ts` here: the summariser is a
 * fixed background utility, not a user-facing call_kind, and admins
 * shouldn't be swapping models on it. We pick Haiku 4.5 for cost.
 */

import Anthropic from "@anthropic-ai/sdk";

import { recordAiCall } from "@/lib/ai/cost";

const APPROX_CHARS_PER_TOKEN = 4;
const SUMMARY_MODEL = "claude-haiku-4-5";
const SUMMARY_MAX_OUTPUT_TOKENS = 700;

/** Token estimate via char count. Cheap, no deps, good enough for routing. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export interface SummarisableMessage {
  role: string;
  content: string;
}

export interface SummariseOptions {
  /** Token cap below which we don't summarise. Default 80k. */
  maxTokens?: number;
  /** Number of trailing turns to keep verbatim. Default 6. */
  keepRecent?: number;
  /** Anthropic client override (mostly for tests). */
  client?: Anthropic;
  /** Synchronous summariser override — when supplied, no API call is made.
   *  Used by the test harness and by callers that already have a
   *  summary they want to splice in (e.g. cached digest). */
  summariseSync?: (older: SummarisableMessage[]) => string;
}

let _client: Anthropic | null = null;
function defaultClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/** Total tokens (approx) across a message array. */
export function totalApproxTokens(messages: SummarisableMessage[]): number {
  let sum = 0;
  for (const m of messages) sum += estimateTokens(m.content);
  return sum;
}

/** Build the prompt we send to Haiku to digest older turns. */
function buildSummariseSystem(): string {
  return [
    "You compress a conversation transcript into a tight running summary.",
    "Goals:",
    "- Preserve named entities (people, companies, deal names, file names, IDs).",
    "- Preserve user intent and any open questions or pending actions.",
    "- Preserve facts the assistant already established (numbers, dates, statuses).",
    "- Drop pleasantries, repeated greetings, and tool-call boilerplate.",
    "- Stay under ~500 tokens. Plain text, third-person, no headings.",
    "Return only the summary text — no preamble.",
  ].join("\n");
}

function renderTranscript(messages: SummarisableMessage[]): string {
  return messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join("\n\n")
    .slice(0, 60_000);
}

async function summariseViaAnthropic(
  older: SummarisableMessage[],
  client: Anthropic
): Promise<string> {
  const transcript = renderTranscript(older);
  const startedAt = Date.now();
  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: SUMMARY_MAX_OUTPUT_TOKENS,
      system: buildSummariseSystem(),
      messages: [{ role: "user", content: transcript }],
    });
  } catch (e) {
    // The summariser doesn't know workspace_id / user_id — it runs as
    // a background helper. We still log the call so the cost ledger
    // sees the spend (with NULL attribution); admins can audit
    // anonymous rows in /admin/insights/ai-costs.
    void recordAiCall({
      model: SUMMARY_MODEL,
      latency_ms: Date.now() - startedAt,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
  void recordAiCall({
    model: SUMMARY_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    latency_ms: Date.now() - startedAt,
    status: "ok",
  });
  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || "(no summary available)";
}

/**
 * If `messages` is under the token cap, returns it unchanged. Otherwise
 * keeps the most recent N turns verbatim and replaces everything before
 * them with a single synthetic `system` message containing a compressed
 * summary.
 *
 * The synthetic message uses role 'system' so downstream code can detect
 * and route it appropriately. Anthropic's messages array doesn't accept
 * 'system' as a role — callers must either:
 *   (a) splice this into the `system` parameter, or
 *   (b) convert it to a user message with a "[prior conversation]" prefix.
 * The dispatcher does (b).
 */
export async function summariseIfNeeded(
  messages: SummarisableMessage[],
  maxTokensOrOpts: number | SummariseOptions = 80_000
): Promise<SummarisableMessage[]> {
  const opts: SummariseOptions =
    typeof maxTokensOrOpts === "number"
      ? { maxTokens: maxTokensOrOpts }
      : maxTokensOrOpts;
  const maxTokens = opts.maxTokens ?? 80_000;
  const keepRecent = opts.keepRecent ?? 6;

  if (messages.length === 0) return messages;

  const approx = totalApproxTokens(messages);
  if (approx <= maxTokens) return messages;

  // If we have fewer turns than keepRecent we can't compress anything.
  if (messages.length <= keepRecent) return messages;

  const splitAt = messages.length - keepRecent;
  const older = messages.slice(0, splitAt);
  const recent = messages.slice(splitAt);

  let summary: string;
  if (opts.summariseSync) {
    summary = opts.summariseSync(older);
  } else {
    summary = await summariseViaAnthropic(older, opts.client ?? defaultClient());
  }

  const digest: SummarisableMessage = {
    role: "system",
    content:
      `[Prior conversation summary — older turns compressed for context window.]\n` +
      summary,
  };
  return [digest, ...recent];
}

/**
 * Pure variant — never calls the network. Useful when the caller already
 * has a digest or wants a deterministic test. Returns the same shape as
 * summariseIfNeeded().
 */
export function summariseWithFn(
  messages: SummarisableMessage[],
  summariser: (older: SummarisableMessage[]) => string,
  opts: { maxTokens?: number; keepRecent?: number } = {}
): SummarisableMessage[] {
  const maxTokens = opts.maxTokens ?? 80_000;
  const keepRecent = opts.keepRecent ?? 6;
  if (messages.length === 0) return messages;
  if (totalApproxTokens(messages) <= maxTokens) return messages;
  if (messages.length <= keepRecent) return messages;
  const splitAt = messages.length - keepRecent;
  const older = messages.slice(0, splitAt);
  const recent = messages.slice(splitAt);
  const digest: SummarisableMessage = {
    role: "system",
    content:
      `[Prior conversation summary — older turns compressed for context window.]\n` +
      summariser(older),
  };
  return [digest, ...recent];
}
