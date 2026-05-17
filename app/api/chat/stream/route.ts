/* app/api/chat/stream/route.ts — SSE endpoint for the per-record /chat
 * surface.
 *
 * Why this lives next to but separate from `/api/agent/dispatch`:
 *  - dispatch is the full classifier→executor/orchestrator→formatter
 *    pipeline with tool calls + persisted history + credit accounting.
 *    It returns ONE JSON blob at the end of the chain.
 *  - This route is a thin "talk to the model with a context block"
 *    streaming sibling. No tools, no classifier, no formatter — we
 *    inject the entity context into the system prompt and stream the
 *    raw text deltas. The user is already looking at a specific
 *    record, so an open-ended tool call would be wasteful.
 *
 * Body: { context_ref?: string; message: string;
 *         images?: { mime: string; data: string }[] }
 *
 *   - `images[]` are inline data-URL-style attachments — each carries
 *     its mime type and a base64-encoded payload. We validate mime +
 *     size server-side and forward them as Anthropic `image` content
 *     blocks (base64 source) inside the user turn.
 *   - Data-URL form (`data:image/png;base64,...`) is also accepted for
 *     the `data` field — we split off the prefix before forwarding.
 *
 * Out:  text/event-stream with events {delta, done, error}
 *
 * Abort: `req.signal` is forwarded into the Anthropic SDK's
 *        AbortController so a client-side `stop()` actually tears down
 *        the upstream request (not just our local reader).
 *
 * Auth: standard cookie session. Workspace membership is verified
 *       against the context's workspace_id when a context ref resolves.
 *
 * Budget: the workspace's tier-level monthly USD spend is checked
 *         before opening a stream. When the workspace is over budget
 *         we emit a single friendly delta and close.
 *
 * Cost ledger: every successful (or failed) Anthropic call writes a
 *              row to `ai_calls` via `recordAiCall(...)`. Usage tokens
 *              are read from the SDK's final message after iteration
 *              ends.
 *
 * Runtime: Node — we share `getRuntimeModel()` with the rest of the
 * runtime, which uses the service-role admin client to read
 * `runtime_model_assignments`. That client is not edge-compatible.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { loadContext, trimContextChunk } from "@/lib/ai-context/load";
import { sseResponse } from "@/lib/ai-stream/server";
import {
  DEFAULT_PERSONA,
  loadPersona,
  personaSystemPrefix,
} from "@/lib/agent/runtime/persona";
import { getRuntimeModel } from "@/lib/agent/runtime/_models";
import {
  type ChatTurn,
  loadChatHistory,
  recordChatTurn,
} from "@/lib/chat/conversation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAiCall } from "@/lib/ai/cost";
import {
  getWorkspaceBudgetStatus,
  upgradeMessageForTier,
} from "@/lib/ai/budget-check";

export const runtime = "nodejs";
// 60s ceiling — same as /api/agent/dispatch. Long-running streams can
// exceed this on Vercel Hobby, but the client gets a clean `done` from
// the SSE-helper finalizer either way.
export const maxDuration = 60;

/** Allowed inline-image mime types. Matches what Anthropic accepts on
 *  vision-capable models (sonnet 3.5 / sonnet 4 / haiku 3 vision). */
const ALLOWED_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

/** Hard cap per image (base64-decoded). Anthropic's documented limit
 *  is 5 MB per image; we enforce the same cap pre-flight so a bad
 *  upload bounces with a 400 instead of a 502 from upstream. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Cap the total number of attachments per turn so a malicious caller
 *  can't drag the request past memory limits. The vision UX is "one
 *  picture, one question"; 4 is plenty for "compare these screenshots". */
const MAX_IMAGES_PER_TURN = 4;

interface ChatStreamImage {
  /** "image/png" | "image/jpeg" | "image/webp" | "image/gif". Normalised
   *  server-side; "image/jpg" is rewritten to "image/jpeg" before the
   *  Anthropic call. */
  mime: string;
  /** Raw base64 (no `data:...;base64,` prefix). Data-URL form is
   *  accepted and stripped in `parseImage()`. */
  data: string;
}

interface ChatStreamBody {
  context_ref?: string | null;
  message?: string;
  workspace_id?: string | null;
  /** Inline image attachments. Forwarded as Anthropic `image` content
   *  blocks alongside the text message. */
  images?: ChatStreamImage[];
}

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/** Strip a `data:image/...;base64,` prefix if present and return the
 *  raw base64 payload + inferred mime. Tolerates extra whitespace. */
function parseImage(img: ChatStreamImage): {
  ok: true;
  mime: string;
  base64: string;
  bytes: number;
} | {
  ok: false;
  error: string;
} {
  if (!img || typeof img.data !== "string") {
    return { ok: false, error: "image_data_required" };
  }
  let mime = (img.mime ?? "").trim().toLowerCase();
  let raw = img.data.trim();

  // Accept full data URLs as well as bare base64.
  if (raw.startsWith("data:")) {
    const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return { ok: false, error: "image_invalid_data_url" };
    if (!mime) mime = match[1].toLowerCase();
    raw = match[2];
  }
  // Whitespace-tolerant — some clients line-wrap base64.
  raw = raw.replace(/\s+/g, "");

  // Quick sanity check: base64 only contains [A-Za-z0-9+/=].
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) {
    return { ok: false, error: "image_invalid_base64" };
  }
  // Normalise "image/jpg" → "image/jpeg" (Anthropic only accepts the
  // canonical form). Other typos we let through so the SDK can surface
  // a clean error rather than us guessing.
  if (mime === "image/jpg") mime = "image/jpeg";

  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return { ok: false, error: `image_mime_not_supported:${mime}` };
  }

  // Cheap byte-count estimate: each base64 char is 6 bits, minus
  // padding. Avoids materialising the Buffer just to measure.
  const padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((raw.length * 3) / 4) - padding;
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: "image_too_large" };
  }
  return { ok: true, mime, base64: raw, bytes };
}

/**
 * Build the system prompt used for the streamed chat. We deliberately
 * keep it small + deterministic so prompt caching can hit across turns
 * (the context block changes between entities but is stable within a
 * single /chat session).
 */
function buildSystemPrompt(opts: {
  personaPrefix: string;
  userEmail: string | null;
  contextChunk: string;
  hasImages: boolean;
}): string {
  const visionLine = opts.hasImages
    ? "\n- The user has attached one or more images. Describe what they show when relevant and use them to answer the question."
    : "";
  const base = `${opts.personaPrefix}

You are the Spacefield assistant answering questions about a specific record. The user (${opts.userEmail ?? "signed-in user"}) opened this chat from the record's detail page.

Rules:
- Answer ONLY from the record context provided below. Don't make up data the user didn't show you.
- If the user asks something the context doesn't cover, say so plainly — don't invent.
- Be concise: 2–4 sentences unless the user asks for detail.
- Plain text. Light markdown is fine but no headings.${visionLine}`;

  if (!opts.contextChunk) {
    return `${base}

(No record context was supplied — answer general workspace questions.)`;
  }
  return `${base}

— RECORD CONTEXT —
${opts.contextChunk}
— END CONTEXT —`;
}

/** Build the user-turn content blocks. Always includes the text. When
 *  images are attached, each becomes an Anthropic `image` block with a
 *  base64 source. Images come first so the model's attention lands on
 *  them before the question (matches Anthropic's prompting guidance). */
function buildUserContent(
  message: string,
  images: { mime: string; base64: string }[]
): Anthropic.Messages.ContentBlockParam[] {
  if (images.length === 0) {
    return [{ type: "text", text: message }];
  }
  const blocks: Anthropic.Messages.ContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mime as
        | "image/png"
        | "image/jpeg"
        | "image/webp"
        | "image/gif",
      data: img.base64,
    },
  }));
  blocks.push({ type: "text", text: message });
  return blocks;
}

/** Holder so the async generator can hand back token usage to the
 *  caller after the stream finishes. JS doesn't let us `return` from a
 *  generator's consumer cleanly — closing over this object is the
 *  simplest approach. */
interface UsageRef {
  usage?: Anthropic.Messages.Usage;
  errorMessage?: string;
}

/**
 * Stream Anthropic deltas as plain text chunks. Yields ONLY the
 * `text_delta` payloads — message_start/stop/content_block_* are
 * dropped because the SSE client doesn't need them. Honours
 * `signal.aborted` so the client's stop button propagates upstream.
 *
 * Token usage is captured into the supplied `usageRef` after the
 * generator finishes so the caller can write a single recordAiCall
 * row with accurate counts.
 */
async function* streamAnthropicText(opts: {
  model: string;
  system: string;
  message: string;
  history: ChatTurn[];
  images: { mime: string; base64: string }[];
  signal: AbortSignal;
  maxTokens: number;
  temperature: number;
  usageRef: UsageRef;
  /** Called once with the full assistant text when the stream completes
   *  cleanly. Skipped on abort (we don't want to persist half a reply
   *  attributed to the assistant). Errors inside are swallowed by the
   *  caller — persistence is best-effort. */
  onComplete?: (assistantText: string) => Promise<void> | void;
}): AsyncIterable<string> {
  // The Anthropic SDK expects alternating user/assistant turns ending
  // in `user`. History is already in chronological order (loadChatHistory
  // reverses on read). We append the fresh user turn carrying any
  // attached images (vision input) via buildUserContent.
  const messages = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: buildUserContent(opts.message, opts.images) },
  ];

  const stream = anthropic().messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system,
      messages,
    },
    { signal: opts.signal }
  );

  let assistantText = "";
  let completed = false;
  try {
    for await (const event of stream) {
      if (opts.signal.aborted) break;
      if (
        event.type === "content_block_delta" &&
        event.delta &&
        event.delta.type === "text_delta"
      ) {
        const t = event.delta.text;
        if (t) {
          assistantText += t;
          yield t;
        }
      }
    }
    // Mark completion only if we got through the loop without an
    // upstream error AND the client didn't abort. Read finalMessage()
    // for usage tokens even on abort (finalMessage rejects on abort —
    // we swallow). usageRef is read after the stream by the cost-log
    // wrapper.
    completed = !opts.signal.aborted;
    try {
      const final = await stream.finalMessage();
      opts.usageRef.usage = final.usage;
    } catch {
      // finalMessage() rejects after a controller abort — that's fine,
      // we just won't have token counts for an aborted call.
    }
  } catch (err) {
    opts.usageRef.errorMessage =
      err instanceof Error ? err.message : String(err ?? "stream_error");
    throw err;
  } finally {
    // Defensive: if the consumer broke out of the for-await early
    // (e.g. controller cancel), tear down the SDK stream too. Calling
    // abort() on an already-finished stream is a no-op.
    if (!stream.aborted) stream.abort();

    // Best-effort assistant-turn persistence. Wrap in try/catch so a
    // DB error never bubbles into the SSE stream (we already emitted
    // `done`). Skip on abort so we don't store a truncated reply that
    // would mislead future turns.
    if (completed && assistantText && opts.onComplete) {
      try {
        await opts.onComplete(assistantText);
      } catch {
        // Swallowed — logged inside recordChatTurn.
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 60 req/min per user — twice the dispatch limit because streaming
  // surfaces tend to retry on aborted UIs.
  const limited = await enforceRateLimit(
    `user:${user.id}:chat-stream`,
    60,
    60
  );
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as ChatStreamBody;
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "message_required" },
      { status: 400 }
    );
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "message_too_long" },
      { status: 400 }
    );
  }

  // Validate + normalise inline image attachments. Each one is decoded
  // once (size-checked via base64 length) and forwarded to Anthropic
  // as a base64 source block. Failures return 400 so the client can
  // surface a clear "this image didn't upload" message.
  const rawImages = Array.isArray(body.images) ? body.images : [];
  if (rawImages.length > MAX_IMAGES_PER_TURN) {
    return NextResponse.json(
      {
        error: "too_many_images",
        max: MAX_IMAGES_PER_TURN,
      },
      { status: 400 }
    );
  }
  const validatedImages: { mime: string; base64: string }[] = [];
  for (const img of rawImages) {
    const parsed = parseImage(img);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    validatedImages.push({ mime: parsed.mime, base64: parsed.base64 });
  }

  // Resolve context. When `context_ref` is missing or unresolvable we
  // still serve the request — the chat is useful without it.
  const loaded = await loadContext(body.context_ref ?? null);

  // Workspace resolution: prefer the context's workspace (so the
  // persona we load matches what the user is reading); fall back to
  // the explicit workspace_id in the body; final fallback is the
  // user's first workspace via service-role lookup (RLS can hide own
  // membership rows in some SSR sessions).
  let workspaceId: string | null = loaded.workspace_id ?? body.workspace_id ?? null;
  const admin = createAdminClient();
  if (!workspaceId) {
    const { data } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    workspaceId = (data?.workspace_id as string | undefined) ?? null;
  }

  // Verify membership when we have a workspace — defence in depth in
  // case the context loader resolved a row the user shouldn't see (it
  // shouldn't, since `loadContext` reads through RLS, but better safe).
  if (workspaceId) {
    const { data: mem } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!mem) workspaceId = null;
  }

  // Tier budget guard. Identical check the executor/orchestrator run
  // before kicking off a model call. If the workspace has consumed
  // 100% of its tier's monthly USD allowance we still return an SSE
  // stream — but with a single delta carrying the upgrade message,
  // then `done`. The UI doesn't have to special-case this; the user
  // just sees the assistant explain the cap.
  if (workspaceId) {
    const budget = await getWorkspaceBudgetStatus(workspaceId);
    if (budget.over) {
      const message = upgradeMessageForTier(budget.tier);
      async function* singleMessage(): AsyncIterable<string> {
        yield message;
      }
      return sseResponse(
        singleMessage(),
        (chunk) => ({ event: "delta", data: chunk }),
        req.signal
      );
    }
  }

  // Persona is workspace-scoped. Without a workspace we use the
  // defaults — keeps the route usable for unscoped chats.
  const persona = workspaceId
    ? await loadPersona(supabase, workspaceId).catch(() => DEFAULT_PERSONA)
    : DEFAULT_PERSONA;

  // Model: piggyback on the executor assignment. Executor is the
  // single-skill / tight-loop branch and is the closest match for our
  // "answer one question concisely" use case.
  const resolved = await getRuntimeModel("executor").catch(() => ({
    id: "claude-haiku-4-5",
    provider: "anthropic" as const,
    fallbackId: null,
    temperature: 1.0,
    maxTokens: 1024,
  }));

  const system = buildSystemPrompt({
    personaPrefix: personaSystemPrefix(persona),
    userEmail: user.email ?? null,
    contextChunk: trimContextChunk(loaded.prompt_chunk),
    hasImages: validatedImages.length > 0,
  });

  // Conversation memory (Y3) — workspace-scoped persistence so the
  // /chat surface remembers prior turns. Persistence is workspace-FK'd
  // so an unscoped chat can't be recorded. Loading and the user-turn
  // write are both fire-and-forget (errors swallowed inside the lib).
  const contextRef = (body.context_ref ?? "").trim() || null;
  const history: ChatTurn[] = workspaceId
    ? await loadChatHistory({
        workspaceId,
        userId: user.id,
        contextRef,
      }).catch(() => [])
    : [];

  if (workspaceId) {
    void recordChatTurn({
      workspaceId,
      userId: user.id,
      contextRef,
      role: "user",
      content: message,
    });
  }

  // Cost-ledger plumbing (Y5) — usageRef populated by streamAnthropicText
  // after finalMessage() resolves; userIdForLog captured so the
  // generator closure has it without re-narrowing.
  const usageRef: UsageRef = {};
  const startedAt = Date.now();
  const userIdForLog = user.id;

  // Hand the request's signal directly to the SDK + the SSE encoder so
  // an aborted client tears down the upstream request.
  const tokens = streamAnthropicText({
    model: resolved.id,
    system,
    message,
    history,
    images: validatedImages,
    signal: req.signal,
    maxTokens: resolved.maxTokens || 1024,
    temperature: resolved.temperature ?? 1.0,
    usageRef,
    onComplete: workspaceId
      ? async (assistantText) => {
          await recordChatTurn({
            workspaceId: workspaceId!,
            userId: user.id,
            contextRef,
            role: "assistant",
            content: assistantText,
          });
        }
      : undefined,
  });

  // Wrap the SSE producer so we can write a cost-ledger row after the
  // stream closes. We do this by tee-ing the async iterable through a
  // small wrapper that records on completion.
  async function* withCostLog(): AsyncIterable<string> {
    try {
      for await (const chunk of tokens) {
        yield chunk;
      }
      // Successful close. usageRef.usage may still be undefined if the
      // client aborted before finalMessage() resolved.
      void recordAiCall({
        workspace_id: workspaceId,
        user_id: userIdForLog,
        model: resolved.id,
        input_tokens: usageRef.usage?.input_tokens ?? 0,
        output_tokens: usageRef.usage?.output_tokens ?? 0,
        latency_ms: Date.now() - startedAt,
        status: "ok",
      });
    } catch (err) {
      void recordAiCall({
        workspace_id: workspaceId,
        user_id: userIdForLog,
        model: resolved.id,
        input_tokens: usageRef.usage?.input_tokens ?? 0,
        output_tokens: usageRef.usage?.output_tokens ?? 0,
        latency_ms: Date.now() - startedAt,
        status: "error",
        error:
          usageRef.errorMessage ??
          (err instanceof Error ? err.message : String(err)),
      });
      throw err;
    }
  }

  return sseResponse(
    withCostLog(),
    (chunk) => ({ event: "delta", data: chunk }),
    req.signal
  );
}
