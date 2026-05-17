/**
 * Per-provider circuit breaker for AI calls.
 *
 * A small in-process state machine that short-circuits AI calls when a
 * provider has been failing recently. Three states:
 *
 *   closed     — normal operation. Failures are counted in a rolling
 *                window. If `failureThreshold` failures land within
 *                `windowMs`, transition to `open`.
 *   open       — fast-fail every call without touching the provider.
 *                After `cooldownMs` elapses since the trip, transition
 *                to `half_open` on the next call attempt.
 *   half_open  — let exactly one probe call through. Success → closed
 *                (counter reset). Failure → open (cooldown resets).
 *
 * State lives in a module-level Map keyed by provider name (e.g.
 * "anthropic", "openai"). This is per-instance state and resets on cold
 * starts — a deliberate trade-off for serverless. A truly distributed
 * breaker would need Redis (or similar) to share state across nodes.
 * The trade-off is documented in `docs/ai/RELIABILITY.md`.
 *
 * The breaker is provider-scoped, NOT model-scoped, because a 5xx burst
 * on Anthropic almost always affects every model that provider serves.
 * model-fallback.ts uses this signal to decide whether the primary is
 * even worth trying.
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitConfig {
  /** Open the circuit after this many failures within `windowMs`. */
  failureThreshold: number;
  /** Rolling window for failure counting (ms). */
  windowMs: number;
  /** How long to stay open before allowing a half-open probe (ms). */
  cooldownMs: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

interface CircuitEntry {
  state: CircuitState;
  config: CircuitConfig;
  /** Timestamps (ms) of recent failures within `windowMs`. */
  failures: number[];
  /** When the breaker last opened. Used to compute cooldown expiry. */
  openedAt: number | null;
  /** Whether a half-open probe is currently in flight. Prevents two
   *  callers from racing the probe slot. */
  probeInFlight: boolean;
  /** Most recent error message recorded against this provider. Echoed
   *  back through `canCall().lastError` and the availability surface. */
  lastError?: string;
}

const circuits = new Map<string, CircuitEntry>();

function getEntry(provider: string, config?: Partial<CircuitConfig>): CircuitEntry {
  let entry = circuits.get(provider);
  if (!entry) {
    entry = {
      state: "closed",
      config: { ...DEFAULT_CIRCUIT_CONFIG, ...(config ?? {}) },
      failures: [],
      openedAt: null,
      probeInFlight: false,
    };
    circuits.set(provider, entry);
  } else if (config) {
    // Allow late config tweaks (e.g. admin-changed thresholds).
    entry.config = { ...entry.config, ...config };
  }
  return entry;
}

/** Strip failures older than the rolling window. */
function pruneFailures(entry: CircuitEntry, now: number): void {
  const cutoff = now - entry.config.windowMs;
  if (entry.failures.length && entry.failures[0] < cutoff) {
    entry.failures = entry.failures.filter((t) => t >= cutoff);
  }
}

/**
 * What the caller should do right now for this provider.
 *
 * - `allow: true, half_open: false`  — proceed normally.
 * - `allow: true, half_open: true`   — proceed; this is the probe call.
 *                                       Mandatory follow-up: call
 *                                       recordSuccess / recordFailure.
 * - `allow: false`                   — short-circuit, do not call.
 *                                       Use `lastError` if you want to
 *                                       echo why.
 */
export interface CircuitDecision {
  allow: boolean;
  half_open: boolean;
  state: CircuitState;
  /** Most recent error message recorded against this provider, if any.
   *  Surface this in the "AI temporarily unavailable" UX. */
  lastError?: string;
}

/**
 * Ask whether a call to `provider` should proceed. Mutates state for
 * the open→half_open transition (claims the single probe slot).
 */
export function canCall(
  provider: string,
  config?: Partial<CircuitConfig>
): CircuitDecision {
  const now = Date.now();
  const entry = getEntry(provider, config);
  pruneFailures(entry, now);

  if (entry.state === "closed") {
    return { allow: true, half_open: false, state: "closed" };
  }

  if (entry.state === "open") {
    const openedAt = entry.openedAt ?? now;
    if (now - openedAt < entry.config.cooldownMs) {
      return {
        allow: false,
        half_open: false,
        state: "open",
        lastError: entry.lastError,
      };
    }
    // Cooldown elapsed. Transition to half-open and claim the probe slot
    // for this caller. Any second caller arriving before this one
    // records the outcome is rejected.
    entry.state = "half_open";
    entry.probeInFlight = true;
    return { allow: true, half_open: true, state: "half_open" };
  }

  // half_open
  if (entry.probeInFlight) {
    return {
      allow: false,
      half_open: false,
      state: "half_open",
      lastError: entry.lastError,
    };
  }
  // No probe in flight (e.g. recordSuccess closed us briefly then we
  // re-tripped). Claim the slot.
  entry.probeInFlight = true;
  return { allow: true, half_open: true, state: "half_open" };
}

/**
 * Mark a successful call against `provider`. In closed state this is
 * also used to clear stale failure counts, since "success after a few
 * misses" should not leak into the next minute.
 */
export function recordSuccess(provider: string): void {
  const entry = circuits.get(provider);
  if (!entry) return;
  entry.failures = [];
  entry.probeInFlight = false;
  if (entry.state !== "closed") {
    entry.state = "closed";
    entry.openedAt = null;
    entry.lastError = undefined;
  }
}

/**
 * Mark a failed call against `provider`. Trips the breaker if the
 * rolling-window threshold is hit. Includes the original error message
 * so we can echo it back via `canCall().lastError`.
 */
export function recordFailure(provider: string, errorMessage?: string): void {
  const now = Date.now();
  const entry = getEntry(provider);
  pruneFailures(entry, now);

  entry.failures.push(now);
  if (errorMessage) entry.lastError = errorMessage;

  if (entry.state === "half_open") {
    // Probe failed → re-open, restart cooldown.
    entry.state = "open";
    entry.openedAt = now;
    entry.probeInFlight = false;
    return;
  }

  if (
    entry.state === "closed" &&
    entry.failures.length >= entry.config.failureThreshold
  ) {
    entry.state = "open";
    entry.openedAt = now;
    entry.probeInFlight = false;
  }
}

/** Read-only snapshot of the current state for a provider. Used by
 *  availability.ts + admin status. */
export interface CircuitSnapshot {
  provider: string;
  state: CircuitState;
  failuresInWindow: number;
  openedAt: number | null;
  cooldownRemainingMs: number;
  lastError?: string;
}

export function snapshot(provider: string): CircuitSnapshot {
  const entry = circuits.get(provider);
  const now = Date.now();
  if (!entry) {
    return {
      provider,
      state: "closed",
      failuresInWindow: 0,
      openedAt: null,
      cooldownRemainingMs: 0,
    };
  }
  pruneFailures(entry, now);
  const cooldownRemainingMs =
    entry.state === "open" && entry.openedAt !== null
      ? Math.max(0, entry.openedAt + entry.config.cooldownMs - now)
      : 0;
  return {
    provider,
    state: entry.state,
    failuresInWindow: entry.failures.length,
    openedAt: entry.openedAt,
    cooldownRemainingMs,
    lastError: entry.lastError,
  };
}

/** Snapshots of every provider this process has seen. */
export function allSnapshots(): CircuitSnapshot[] {
  return Array.from(circuits.keys()).map(snapshot);
}

/** Test/admin hook — force a state change. Do NOT use from runtime code. */
export function _resetCircuit(provider?: string): void {
  if (provider) {
    circuits.delete(provider);
  } else {
    circuits.clear();
  }
}

