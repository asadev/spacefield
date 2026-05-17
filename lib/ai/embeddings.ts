import "server-only";

import OpenAI from "openai";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAiCall } from "./cost";

/**
 * pgvector embeddings + RAG search.
 *
 * Backend choice: OpenAI's text-embedding-3-small (1536-d, $0.02 per
 * 1M tokens). Anthropic still has no first-party embedding endpoint at
 * the time of this build, so when `OPENAI_API_KEY` is absent we fall
 * back to a no-op + warn — the caller gets back a zero-vector so any
 * SQL inserts still go through (useful in test env without the key).
 *
 * Chunking is the caller's responsibility. `indexChunk` writes one
 * row; chunk text yourself before calling.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
// OpenAI hard-caps each item at 8192 input tokens; we conservatively
// cap chunk length here (chars, not tokens) — rough 1 token ≈ 4 chars,
// so ~24k chars ≈ 6k tokens with headroom.
const MAX_CHARS_PER_CHUNK = 24_000;

let _openai: OpenAI | null = null;
function openai(): OpenAI | null {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

function truncate(s: string): string {
  if (s.length <= MAX_CHARS_PER_CHUNK) return s;
  return s.slice(0, MAX_CHARS_PER_CHUNK);
}

/**
 * Embed a single string. Returns the raw 1536-d vector. Falls back to
 * a zero-vector when OpenAI isn't configured — callers should treat
 * `result.length === 0` ⊕ all-zero as "embeddings unavailable" rather
 * than a real result.
 */
export async function embed(text: string): Promise<number[]> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return new Array(EMBEDDING_DIM).fill(0);

  const client = openai();
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ai-embeddings] OPENAI_API_KEY not set — returning zero-vector"
    );
    return new Array(EMBEDDING_DIM).fill(0);
  }

  const startedAt = Date.now();
  try {
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncate(trimmed),
    });
    const usage = res.usage;
    // Fire-and-forget cost log. Embeddings only bill on input tokens.
    void recordAiCall({
      model: EMBEDDING_MODEL,
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: 0,
      latency_ms: Date.now() - startedAt,
      status: "ok",
    });
    return res.data[0]?.embedding ?? new Array(EMBEDDING_DIM).fill(0);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void recordAiCall({
      model: EMBEDDING_MODEL,
      latency_ms: Date.now() - startedAt,
      status: "error",
      error: message,
    });
    // eslint-disable-next-line no-console
    console.warn("[ai-embeddings] embed() failed:", message);
    return new Array(EMBEDDING_DIM).fill(0);
  }
}

export interface IndexChunkInput {
  workspace_id?: string | null;
  entity_type: string;
  entity_id: string;
  chunk_index?: number;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Embed `content` then insert a row into `public.embeddings`. Uses the
 * service-role client (RLS-bypassing) because indexing typically runs
 * from server-side jobs that don't carry a user session.
 *
 * Returns the inserted row id, or `null` on failure (already logged).
 */
export async function indexChunk(input: IndexChunkInput): Promise<string | null> {
  const content = (input.content ?? "").trim();
  if (!content) return null;
  const vector = await embed(content);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("embeddings")
    .insert({
      workspace_id: input.workspace_id ?? null,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      chunk_index: input.chunk_index ?? 0,
      content,
      embedding: vector,
      model: EMBEDDING_MODEL,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[ai-embeddings] indexChunk insert failed:", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

export interface SemanticSearchInput {
  query: string;
  workspace_id?: string | null;
  entity_type?: string | null;
  limit?: number;
}

export interface SemanticSearchHit {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * Embed `query` then call the `semantic_search` RPC. The RPC itself
 * enforces workspace membership for any workspace-scoped row; global
 * rows (workspace_id NULL) are visible to everyone.
 */
export async function semanticSearch(
  input: SemanticSearchInput
): Promise<SemanticSearchHit[]> {
  const q = (input.query ?? "").trim();
  if (!q) return [];
  const vector = await embed(q);
  // All-zero vector means embedding generation failed — short-circuit.
  if (vector.every((v) => v === 0)) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("semantic_search", {
    p_query_embedding: vector as unknown as string, // postgrest serialises as JSON array
    p_workspace_id: input.workspace_id ?? null,
    p_entity_type: input.entity_type ?? null,
    p_limit: Math.max(1, Math.min(50, input.limit ?? 10)),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[ai-embeddings] semantic_search rpc failed:", error.message);
    return [];
  }
  return (data ?? []) as SemanticSearchHit[];
}
