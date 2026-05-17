/**
 * Primary-then-fallback AI call wrapper with circuit-breaker awareness.
 *
 * Wraps any "call a model" function with three behaviours:
 *
 *  1. Provider circuit breaker. Before invoking the primary, we ask
 *     circuit-breaker.ts whether the provider is even worth trying.
 *     If the breaker is open we skip straight to the fallback. If both
 *     breakers are open we throw `AllProvidersUnavailableError`.
 *
 *  2. Fallback on failure. If the primary throws (or returns a 5xx-ish
 *     error) we try the fallback. The fallback is a separate provider
 *     in practice — claude-* → gpt-4o-mini, gpt-* → claude-haiku.
 *     Embedding models skip fallback (no like-for-like option).
 *
 *  3. Per-call cost ledger hook. The caller passes a `recordCall`
 *     callback so the existing `recordAiCall` plumbing keeps working
 *     unchanged. Each attempted call (primary + fallback) is logged.
 *
 * The wrapper is intentionally provider-agnostic: callers pass two
 * `attempt()` thunks (one for primary, one for fallback) so this file
 * doesn't need to know the SDK details of either Anthropic or OpenAI.
 * The runtime files (executor/orchestrator/chat-stream) own that.
 *
 * Design note on what counts as "retryable":
 *   - Anthropic SDK throws typed errors with .status. 5xx + 429 +
 *     APIConnectionError are retryable. 4xx auth/validation errors are
 *     NOT — re-trying gpt-4o-mini won't fix a bad input schema.
 *   - We use a duck-typed `isRetryableError()` so this file doesn't
 *     have to import either SDK.
 */

import {
  canCall,
  recordFailure,
  recordSuccess,
  type CircuitConfig,
} from "./circuit-breaker";

/** Provider identifiers used by the circuit-breaker map. Adding a new
 *  provider only requires a new string here + a corresponding breaker
 *  threshold in the call-site config. */
export type AIProvider = "anthropic" | "openai" | string;

/** What the caller is calling — used for ledger + observability. */
export type CallKind =
  | "executor"
  | "orchestrator"
  | "formatter"
  | "classifier"
  | "chat_stream"
  | "embedding"
  | "other";

export interface ModelAttempt<T> {
  /** Provider this attempt hits ("anthropic" | "openai" | ...). */
  provider: AIProvider;
  /** Model id (used for logging + ledger). */
  model: string;
  /** The actual SDK call. Should throw on failure, return on success. */
  run: () => Promise<T>;
}

export interface FallbackOptions<T> {
  primary: ModelAttempt<T>;
  /** Pass `null` to opt out of fallback (e.g. embeddings). */
  fallback: ModelAttempt<T> | null;
  /** Optional per-attempt circuit config. Defaults to module defaults. */
  circuitConfig?: Partial<CircuitConfig>;
  /** Called after every attempt (success or failure). Hook for
   *  recordAiCall so the cost ledger sees both the primary error AND
   *  the fallback success. The runtime files already build a
   *  recordAiCall payload — this gives them a place to write it. */
  recordAttempt?: (entry: {
    provider: AIProvider;
    model: string;
    status: "ok" | "error" | "skipped_circuit_open";
    error?: string;
    latencyMs: number;
    wasFallback: boolean;
  }) => void;
  /** Tagging — propagates into observability. Not required. */
  callKind?: CallKind;
}

export interface FallbackResult<T> {
  value: T;
  /** Which provider actually answered. Surfaces in the ledger. */
  providerUsed: AIProvider;
  modelUsed: string;
  /** True if the fallback model answered instead of the primary. */
  wasFallback: boolean;
}

/**
 * Thrown when both primary and fallback are unavailable (either
 * circuit-open, or both attempts failed). The caller should treat this
 * as the signal to render the "AI temporarily unavailable" UX rather
 * than a 500.
 */
export class AllProvidersUnavailableError extends Error {
  readonly primaryError?: Error;
  readonly fallbackError?: Error;
  constructor(
    message: string,
    opts?: { primaryError?: Error; fallbackError?: Error }
  ) {
    super(message);
    this.name = "AllProvidersUnavailableError";
    this.primaryError = opts?.primaryError;
    this.fallbackError = opts?.fallbackError;
  }
}

/**
 * True if an SDK error is worth retrying on a different provider.
 *
 * We retry on:
 *   - Server errors (status >= 500)
 *   - Rate limits (429)
 *   - Connection / timeout errors (no status, but APIConnectionError
 *     subclass marker — both SDKs use `.name === "APIConnectionError"`
 *     or similar)
 *   - Plain Error with a "fetch failed" / "ECONNRESET" / "timeout"
 *     message (last-ditch heuristic)
 *
 * We do NOT retry on:
 *   - 400/401/403/404/422 — those are caller bugs, not provider issues
 *   - User aborts (`APIUserAbortError` / `AbortError`)
 */
export function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  // Aborts are never retryable — the user/client gave up.
  const anyErr = err as { name?: string; status?: number; message?: string };
  if (anyErr.name === "APIUserAbortError" || anyErr.name === "AbortError") {
    return false;
  }
  // Typed SDK errors.
  if (typeof anyErr.status === "number") {
    if (anyErr.status === 429) return true;
    if (anyErr.status >= 500) return true;
    return false; // 4xx: not retryable
  }
  // Connection / fetch / timeout heuristics.
  if (
    anyErr.name === "APIConnectionError" ||
    anyErr.name === "APIConnectionTimeoutError" ||
    anyErr.name === "FetchError" ||
    anyErr.name === "TimeoutError"
  ) {
    return true;
  }
  const msg = (anyErr.message ?? "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("socket hang up")
  ) {
    return true;
  }
  return false;
}

/**
 * Run `primary`; on retryable failure or open primary breaker, run
 * `fallback`. Throws `AllProvidersUnavailableError` if both unavailable
 * (or fallback is null and primary failed).
 *
 * Hot-path use: wrap your existing `client.messages.create(...)` in a
 * `run: () => client.messages.create(...)` thunk and hand the same
 * thunk for the fallback model with the OpenAI client. The wrapper
 * doesn't care which SDK either side uses, only that they share a
 * return shape (your call site does the shape juggling).
 */
export async function callWithFallback<T>(
  opts: FallbackOptions<T>
): Promise<FallbackResult<T>> {
  const { primary, fallback, recordAttempt, circuitConfig } = opts;

  // 1) Primary attempt — gated by circuit breaker.
  const primaryDecision = canCall(primary.provider, circuitConfig);
  let primaryError: Error | undefined;

  if (primaryDecision.allow) {
    const startedAt = Date.now();
    try {
      const value = await primary.run();
      const latencyMs = Date.now() - startedAt;
      recordSuccess(primary.provider);
      recordAttempt?.({
        provider: primary.provider,
        model: primary.model,
        status: "ok",
        latencyMs,
        wasFallback: false,
      });
      return {
        value,
        providerUsed: primary.provider,
        modelUsed: primary.model,
        wasFallback: false,
      };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const error = err instanceof Error ? err : new Error(String(err));
      primaryError = error;
      // Record the failure for both the circuit AND the cost ledger.
      // Aborts don't trip the breaker (the call never reached the
      // provider in a way that signals provider health).
      if (isRetryableError(err)) {
        recordFailure(primary.provider, error.message);
      } else {
        // 4xx and user aborts shouldn't poison the breaker, but the
        // ledger still wants the row.
      }
      recordAttempt?.({
        provider: primary.provider,
        model: primary.model,
        status: "error",
        error: error.message,
        latencyMs,
        wasFallback: false,
      });
      // Non-retryable errors are not provider-health signals; rethrow
      // so the caller sees the real auth/validation failure instead of
      // silently swapping to a different model.
      if (!isRetryableError(err)) {
        throw error;
      }
      // Otherwise: fall through to fallback below.
    }
  } else {
    recordAttempt?.({
      provider: primary.provider,
      model: primary.model,
      status: "skipped_circuit_open",
      error: primaryDecision.lastError,
      latencyMs: 0,
      wasFallback: false,
    });
  }

  // 2) Fallback attempt — only reached if primary was skipped or
  //    retryable-failed.
  if (!fallback) {
    throw new AllProvidersUnavailableError(
      `AI provider ${primary.provider} unavailable and no fallback configured`,
      { primaryError }
    );
  }

  const fallbackDecision = canCall(fallback.provider, circuitConfig);
  if (!fallbackDecision.allow) {
    recordAttempt?.({
      provider: fallback.provider,
      model: fallback.model,
      status: "skipped_circuit_open",
      error: fallbackDecision.lastError,
      latencyMs: 0,
      wasFallback: true,
    });
    throw new AllProvidersUnavailableError(
      `Both AI providers unavailable (${primary.provider}, ${fallback.provider})`,
      { primaryError }
    );
  }

  const fbStartedAt = Date.now();
  try {
    const value = await fallback.run();
    const latencyMs = Date.now() - fbStartedAt;
    recordSuccess(fallback.provider);
    recordAttempt?.({
      provider: fallback.provider,
      model: fallback.model,
      status: "ok",
      latencyMs,
      wasFallback: true,
    });
    return {
      value,
      providerUsed: fallback.provider,
      modelUsed: fallback.model,
      wasFallback: true,
    };
  } catch (err) {
    const latencyMs = Date.now() - fbStartedAt;
    const error = err instanceof Error ? err : new Error(String(err));
    if (isRetryableError(err)) {
      recordFailure(fallback.provider, error.message);
    }
    recordAttempt?.({
      provider: fallback.provider,
      model: fallback.model,
      status: "error",
      error: error.message,
      latencyMs,
      wasFallback: true,
    });
    if (!isRetryableError(err)) {
      // Non-retryable fallback error — surface the real reason rather
      // than wrapping it.
      throw error;
    }
    throw new AllProvidersUnavailableError(
      `Both AI providers failed (${primary.provider}, ${fallback.provider})`,
      { primaryError, fallbackError: error }
    );
  }
}

/* ────────────────────────── fallback chain helpers ────────────────────────── */

/**
 * Suggest a fallback model id for a given primary model id. Centralises
 * the chain so call sites don't each invent their own mapping.
 *
 * Chain in use:
 *   - claude-haiku-*       → gpt-4o-mini
 *   - claude-sonnet-*      → gpt-4o
 *   - claude-opus-*        → gpt-4o
 *   - gpt-4o*              → claude-haiku-4-5
 *   - gpt-4*               → claude-haiku-4-5
 *   - text-embedding-*     → null (no fallback)
 *   - everything else      → null (caller can pass an explicit override)
 */
export function suggestFallback(primaryModel: string): {
  provider: AIProvider;
  model: string;
} | null {
  const m = primaryModel.toLowerCase();
  if (m.startsWith("claude-haiku")) {
    return { provider: "openai", model: "gpt-4o-mini" };
  }
  if (m.startsWith("claude-sonnet")) {
    return { provider: "openai", model: "gpt-4o" };
  }
  if (m.startsWith("claude-opus")) {
    return { provider: "openai", model: "gpt-4o" };
  }
  if (m.startsWith("claude-")) {
    // Any other Claude model we haven't enumerated — default to mini.
    return { provider: "openai", model: "gpt-4o-mini" };
  }
  if (m.startsWith("gpt-4o-mini")) {
    return { provider: "anthropic", model: "claude-haiku-4-5" };
  }
  if (m.startsWith("gpt-4o") || m.startsWith("gpt-4")) {
    return { provider: "anthropic", model: "claude-haiku-4-5" };
  }
  if (m.startsWith("text-embedding-")) {
    return null;
  }
  return null;
}

/**
 * Return the provider for a given model id (best-effort prefix match).
 * Used by call sites that have a model id but not its provider — e.g.
 * `getRuntimeModel()` returns the provider, but the chat-stream route
 * resolves an `executor` assignment and only has the model string.
 */
export function providerForModel(model: string): AIProvider {
  const m = model.toLowerCase();
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gpt-") || m.startsWith("text-embedding-") || m.startsWith("o1") || m.startsWith("o3")) {
    return "openai";
  }
  return "anthropic"; // safest default for us — most of the runtime is Claude
}
