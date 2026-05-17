/**
 * AI availability check — surfaces a single "is AI usable right now?"
 * answer that UI banners + degraded code paths can call.
 *
 * Built on top of circuit-breaker.ts. The rule: AI is available iff at
 * least one provider's circuit is not fully open. Half-open still counts
 * as available (we're about to try a probe).
 *
 * This lib lives separate from circuit-breaker.ts so consumers don't have
 * to know the breaker internals — they just call `isAIAvailable()` and
 * get a boolean + reason.
 */

import {
  allSnapshots,
  snapshot,
  type CircuitSnapshot,
  type CircuitState,
} from "./circuit-breaker";

/** Providers we consider when evaluating overall AI availability. */
const KNOWN_PROVIDERS = ["anthropic", "openai"] as const;

export interface AvailabilityStatus {
  /** True if at least one configured provider is not fully open. */
  available: boolean;
  /** Per-provider state for diagnostics + admin status pages. */
  providers: CircuitSnapshot[];
  /** Human-readable summary — surface in the banner. */
  message: string;
  /** When the soonest open provider can be retried. ms since epoch.
   *  Null when all providers are closed (no retry needed). */
  earliestRetryAt: number | null;
}

const FRIENDLY_UNAVAILABLE =
  "AI is temporarily unavailable. We're trying to reconnect — your message has been saved and will be answered shortly.";

/**
 * Synchronous availability check. Reads in-process circuit state only;
 * no network calls. Safe to call from server components, API handlers,
 * and the SSR layer.
 *
 * Note: state is per-Vercel-node and resets on cold start. A node that
 * has never failed will report `available: true` even if its sibling
 * nodes are seeing failures. This is a deliberate trade-off documented
 * in `docs/ai/RELIABILITY.md` — sharing state across nodes would
 * require Redis or similar.
 */
export function isAIAvailable(): AvailabilityStatus {
  const seen = new Map<string, CircuitSnapshot>();
  for (const snap of allSnapshots()) {
    seen.set(snap.provider, snap);
  }
  // Ensure we report on the providers we care about even if they've
  // never been hit (a freshly-deployed node).
  for (const p of KNOWN_PROVIDERS) {
    if (!seen.has(p)) seen.set(p, snapshot(p));
  }
  const providers = Array.from(seen.values());

  // "Available" if at least one provider is closed OR half-open.
  const anyUsable = providers.some(
    (p) => p.state === "closed" || p.state === "half_open"
  );

  if (anyUsable) {
    return {
      available: true,
      providers,
      message: "AI services operational.",
      earliestRetryAt: null,
    };
  }

  // All open. Compute the soonest retry time.
  const earliest = providers
    .filter((p) => p.state === "open" && p.openedAt !== null)
    .map((p) => p.openedAt! + p.cooldownRemainingMs)
    .reduce<number | null>(
      (acc, t) => (acc === null || t < acc ? t : acc),
      null
    );

  return {
    available: false,
    providers,
    message: FRIENDLY_UNAVAILABLE,
    earliestRetryAt: earliest,
  };
}

/**
 * Check a single provider. Useful when the caller knows it only wants
 * (say) Anthropic — embeddings are OpenAI-only, for example.
 */
export function isProviderAvailable(provider: string): AvailabilityStatus {
  const snap = snapshot(provider);
  const usable = snap.state === "closed" || snap.state === "half_open";
  return {
    available: usable,
    providers: [snap],
    message: usable
      ? `${provider} operational.`
      : `${provider} is temporarily unavailable. ${snap.lastError ?? ""}`.trim(),
    earliestRetryAt:
      usable || snap.openedAt === null
        ? null
        : snap.openedAt + snap.cooldownRemainingMs,
  };
}

/** Friendly outage copy reused across surfaces (chat, banner, /chat
 *  empty state). Centralised here so we update one string. */
export const AI_UNAVAILABLE_MESSAGE = FRIENDLY_UNAVAILABLE;

export type { CircuitState };
