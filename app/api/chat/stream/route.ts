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
 * Body: { context_ref?: string; message: string }
 * Out:  text/event-stream with events {delta, done, error}
 *
 * Abort: `req.signal` is forwarded into the Anthropic SDK's
 *        AbortController so a client-side `stop()` actually tears down
 *        the upstream request (not just our local reader).
 *
 * Auth: standard cookie session. Workspace membership is verified
 *       against the context's workspace_id when a context ref resolves.
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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// 60s ceiling — same as /api/agent/dispatch. Long-running streams can
// exceed this on Vercel Hobby, but the client gets a clean `done` from
// the SSE-helper finalizer either way.
export const maxDuration = 60;

interface ChatStreamBody {
  context_ref?: string | null;
  message?: string;
  workspace_id?: string | null;
}

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
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
}): string {
  const base = `${opts.personaPrefix}

You are the Spacefield assistant answering questions about a specific record. The user (${opts.userEmail ?? "signed-in user"}) opened this chat from the record's detail page.

Rules:
- Answer ONLY from the record context provided below. Don't make up data the user didn't show you.
- If the user asks something the context doesn't cover, say so plainly — don't invent.
- Be concise: 2–4 sentences unless the user asks for detail.
- Plain text. Light markdown is fine but no headings.`;

  if (!opts.contextChunk) {
    return `${base}

(No record context was supplied — answer general workspace questions.)`;
  }
  return `${base}

— RECORD CONTEXT —
${opts.contextChunk}
— END CONTEXT —`;
}

/**
 * Stream Anthropic deltas as plain text chunks. Yields ONLY the
 * `text_delta` payloads — message_start/stop/content_block_* are
 * dropped because the SSE client doesn't need them. Honours
 * `signal.aborted` so the client's stop button propagates upstream.
 */
async function* streamAnthropicText(opts: {
  model: string;
  system: string;
  message: string;
  signal: AbortSignal;
  maxTokens: number;
  temperature: number;
}): AsyncIterable<string> {
  const stream = anthropic().messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system,
      messages: [{ role: "user", content: opts.message }],
    },
    { signal: opts.signal }
  );
  try {
    for await (const event of stream) {
      if (opts.signal.aborted) break;
      if (
        event.type === "content_block_delta" &&
        event.delta &&
        event.delta.type === "text_delta"
      ) {
        const t = event.delta.text;
        if (t) yield t;
      }
    }
  } finally {
    // Defensive: if the consumer broke out of the for-await early
    // (e.g. controller cancel), tear down the SDK stream too. Calling
    // abort() on an already-finished stream is a no-op.
    if (!stream.aborted) stream.abort();
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
  });

  // Hand the request's signal directly to the SDK + the SSE encoder so
  // an aborted client tears down the upstream request.
  const tokens = streamAnthropicText({
    model: resolved.id,
    system,
    message,
    signal: req.signal,
    maxTokens: resolved.maxTokens || 1024,
    temperature: resolved.temperature ?? 1.0,
  });

  return sseResponse(tokens, (chunk) => ({ event: "delta", data: chunk }), req.signal);
}
