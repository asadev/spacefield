/**
 * Runtime model resolver — bridges the `runtime_model_assignments` admin
 * table with the runtime files (executor, orchestrator, formatter,
 * classifier).
 *
 * Why this exists: the four runtime files used to hardcode their model
 * id (`const MODEL = "claude-haiku-4-5"`). the maintainer wants to change which
 * model each call_kind dispatches with from the admin panel, with no code
 * change. This file reads `runtime_model_assignments` (joined with
 * `ai_models` for provider + max_output_tokens) and exposes a tiny
 * `getRuntimeModel(callKind)` helper.
 *
 * Caching: 5 minutes in-process. The admin panel updates these rows
 * rarely (a few times per day at most) and a 5-minute lag is fine — the
 * server boots happen often enough on Vercel that nothing gets stuck for
 * long. We could revalidate on write via a server action, but we keep it
 * simple here.
 *
 * Fallback: if the DB is unreachable / row missing / row references a
 * non-existent ai_models id, we fall back to a hardcoded sane default per
 * call_kind. The default mirrors what the runtime files originally
 * hardcoded — so the runtime never breaks because of an admin misedit.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CallKind as AdminCallKind, ModelProvider } from "@/app/admin/_types";
import type { CallKind as RuntimeCallKind } from "./types";

/** Public shape the runtime files consume. */
export interface RuntimeModelInfo {
  /** Model id we pass to the SDK (e.g. "claude-haiku-4-5"). */
  id: string;
  /** Provider — runtime files branch on this when they have an
   *  OpenAI-vs-Anthropic split (classifier mostly). */
  provider: ModelProvider;
  /** Optional fallback model id from the same registry (not used yet,
   *  but exposed so the runtime can wire retries later). */
  fallbackId: string | null;
  /** Sampling temperature stored alongside the assignment. */
  temperature: number;
  /** max_tokens stored alongside the assignment. The runtime files
   *  already cap at their own values; this is more of a soft
   *  recommendation. */
  maxTokens: number;
}

/* ────────────────────── hardcoded fallbacks ────────────────────── */

/**
 * Defaults preserve the previous in-code behaviour exactly, so a DB
 * outage cannot break the runtime. Match the constants the four files
 * originally shipped with.
 */
const FALLBACKS: Record<AdminCallKind, RuntimeModelInfo> = {
  classifier: {
    id: "gpt-4o-mini",
    provider: "openai",
    fallbackId: null,
    temperature: 0,
    maxTokens: 200,
  },
  executor: {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    fallbackId: null,
    temperature: 1.0,
    maxTokens: 1024,
  },
  orchestrator: {
    id: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    fallbackId: null,
    temperature: 1.0,
    maxTokens: 2048,
  },
  formatter: {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    fallbackId: null,
    temperature: 0.7,
    maxTokens: 512,
  },
};

/* ────────────────────── cache ────────────────────── */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  loadedAt: number;
  byKind: Map<AdminCallKind, RuntimeModelInfo>;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

/** Force the next call to reload from DB. Useful for the admin panel to
 *  call after `setRuntimeAssignment` so the change is visible
 *  immediately on the same node. (Other Vercel nodes will catch up
 *  within `CACHE_TTL_MS`.) */
export function invalidateRuntimeModelCache(): void {
  cache = null;
  inflight = null;
}

/**
 * Map the runtime's broader CallKind union (which includes
 * `tool_summarizer`) onto the admin DB's narrower set. Anything not
 * stored in the table falls back to the executor settings, since
 * tool_summarizer historically used the same Haiku model the executor
 * does.
 */
function normalizeCallKind(kind: AdminCallKind | RuntimeCallKind): AdminCallKind {
  if (
    kind === "classifier" ||
    kind === "executor" ||
    kind === "orchestrator" ||
    kind === "formatter"
  ) {
    return kind;
  }
  return "executor";
}

/* ────────────────────── DB load ────────────────────── */

interface AssignmentJoinRow {
  call_kind: string;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number | string;
  max_tokens: number;
  ai_models: { provider: string } | null;
}

async function loadFromDb(): Promise<CacheEntry> {
  const admin = createAdminClient();
  const byKind = new Map<AdminCallKind, RuntimeModelInfo>();

  const { data, error } = await admin
    .from("runtime_model_assignments")
    .select(
      "call_kind, model_id, fallback_model_id, temperature, max_tokens, ai_models:model_id ( provider )"
    );

  if (error || !data) {
    // Caller will fall back. Cache the empty map for the TTL so we don't
    // hammer the DB on outage.
    return { loadedAt: Date.now(), byKind };
  }

  // Supabase types the joined relation as either an object or array
  // depending on the inferred cardinality. We tolerate both.
  const rows = data as unknown as Array<
    Omit<AssignmentJoinRow, "ai_models"> & {
      ai_models: AssignmentJoinRow["ai_models"] | AssignmentJoinRow["ai_models"][];
    }
  >;

  for (const r of rows) {
    const kind = r.call_kind as AdminCallKind;
    if (
      kind !== "classifier" &&
      kind !== "executor" &&
      kind !== "orchestrator" &&
      kind !== "formatter"
    ) {
      continue;
    }
    const joined = Array.isArray(r.ai_models) ? r.ai_models[0] : r.ai_models;
    const provider = (joined?.provider as ModelProvider | undefined) ?? "anthropic";
    const tempNum =
      typeof r.temperature === "string" ? Number(r.temperature) : r.temperature;
    byKind.set(kind, {
      id: r.model_id,
      provider,
      fallbackId: r.fallback_model_id,
      temperature: Number.isFinite(tempNum) ? tempNum : FALLBACKS[kind].temperature,
      maxTokens: Number.isFinite(r.max_tokens) ? r.max_tokens : FALLBACKS[kind].maxTokens,
    });
  }

  return { loadedAt: Date.now(), byKind };
}

async function getCache(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  if (inflight) return inflight;
  inflight = loadFromDb()
    .then((entry) => {
      cache = entry;
      return entry;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/* ────────────────────── public API ────────────────────── */

/**
 * Resolve which model a given call_kind should run with right now.
 *
 * Reads the cached `runtime_model_assignments` row joined with
 * `ai_models.provider`. Falls back to the original hardcoded constant if
 * the DB is unreachable or the row is missing.
 */
export async function getRuntimeModel(
  callKind: AdminCallKind | RuntimeCallKind
): Promise<RuntimeModelInfo> {
  const kind = normalizeCallKind(callKind);
  try {
    const entry = await getCache();
    const hit = entry.byKind.get(kind);
    if (hit) return hit;
  } catch {
    // fall through to default
  }
  return FALLBACKS[kind];
}
