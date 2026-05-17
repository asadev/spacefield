import "server-only";

/**
 * fetchWithStaleGuard — wraps `fetch` (and any abortable Promise) with
 * an AbortController-driven deadline. Used by SSR pages that fan out
 * multiple Supabase reads in parallel: when one table is slow (locks,
 * missing index, recovery I/O), the whole request can hang for tens
 * of seconds and pin a serverless slot.
 *
 * Without this guard, our pattern of `Promise.all([read1, read2, read3])`
 * inside an admin page means the page's wall-clock time is the SLOWEST
 * read, not the average. With it, the slowest read aborts at the
 * configured deadline and we render a partial page.
 *
 * The fetch wrapper is the canonical use case, but the same pattern
 * works for arbitrary promises that respect AbortSignal — that's what
 * `withStaleGuard()` is for.
 *
 * Failure mode is INTENTIONALLY soft: when the deadline trips we
 * return null (or rethrow the AbortError, depending on the variant
 * the caller picks) instead of bubbling a useless "request aborted"
 * up to the user. The page renders missing data with a hint rather
 * than a 500.
 */

/** Default per-call deadline. Override on a per-call basis when a
 *  read is known to legitimately take longer. */
const DEFAULT_STALE_AFTER_MS = 4_000;

export interface StaleGuardOpts {
  /** Wall-clock budget after which we abort. */
  staleAfterMs?: number;
  /**
   * When false (default), abortion resolves to `null` instead of
   * throwing — caller can branch on the return value. When true,
   * we rethrow the underlying AbortError so the caller can handle
   * it with a try/catch.
   */
  throwOnStale?: boolean;
}

/**
 * Run an arbitrary promise-producing function with a wall-clock
 * deadline. The callback receives an `AbortSignal` it should forward
 * to anything that supports cancellation (fetch, Supabase v3 reads,
 * etc.).
 *
 * Returns the resolved value, or `null` when the deadline trips and
 * `throwOnStale=false`.
 */
export async function withStaleGuard<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: StaleGuardOpts = {}
): Promise<T | null> {
  const deadline = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deadline);
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    if (isAbortError(e)) {
      if (opts.throwOnStale) throw e;
      return null;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drop-in `fetch` wrapper. Same signature as `fetch`, plus a third
 * `StaleGuardOpts` argument.
 *
 * On deadline: aborts the underlying request and resolves to `null`
 * (default) so the caller can branch:
 *
 *   const res = await fetchWithStaleGuard(url, init, { staleAfterMs: 2000 });
 *   if (!res) return renderFallback();
 *
 * Note: `fetch` honours `signal` natively, so the abort propagates
 * cleanly across the wire (Node's undici will tear the socket down).
 */
export async function fetchWithStaleGuard(
  url: string | URL,
  init: RequestInit = {},
  opts: StaleGuardOpts = {}
): Promise<Response | null> {
  return withStaleGuard(
    (signal) => fetch(url, { ...init, signal }),
    opts
  );
}

/**
 * Race a list of promises against a single deadline. Returns the
 * settled results in order; entries that didn't settle in time are
 * returned as `null`. Like `Promise.allSettled` but with a budget.
 *
 * The common admin-SSR shape is:
 *
 *   const [a, b, c] = await staleAllSettled([
 *     () => admin.from('big').select(...),
 *     () => admin.from('small').select(...),
 *     () => admin.from('medium').select(...),
 *   ], { staleAfterMs: 3500 });
 *
 *   const aRows = a?.data ?? [];   // explicit fallback on slow read
 */
export async function staleAllSettled<T>(
  factories: Array<() => Promise<T>>,
  opts: StaleGuardOpts = {}
): Promise<Array<T | null>> {
  const deadline = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  // We share a single deadline across the whole fan-out — the goal
  // is to cap the SSR response time, not per-promise time.
  return Promise.all(
    factories.map(async (factory) => {
      const startedAt = Date.now();
      const remaining = Math.max(0, deadline - (Date.now() - startedAt));
      return withStaleGuard(() => factory(), {
        staleAfterMs: remaining,
        throwOnStale: false,
      });
    })
  );
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const obj = e as { name?: unknown; code?: unknown };
  if (typeof obj.name === "string" && obj.name === "AbortError") return true;
  if (typeof obj.code === "string" && obj.code === "ABORT_ERR") return true;
  return false;
}
