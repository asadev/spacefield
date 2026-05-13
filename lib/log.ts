/**
 * Tiny structured-logging helper.
 *
 * Goal: every log line we emit is a single JSON object with a stable
 * shape, so Vercel Logs / Datadog / Better Stack can index by `evt`,
 * `request_id`, `user_id`, etc. without parsing prose.
 *
 * Why: when production is on fire at 3am, grepping JSON beats grepping
 * free-form strings every time. Plus once we wire an external log shipper
 * the existing call sites already speak the same shape — no rewrite.
 *
 * Usage:
 *   import { log } from "@/lib/log";
 *   log.info("waitlist.signup", { email });
 *   log.warn("rate_limit.exceeded", { ip, rule: "signup" });
 *   log.error("paddle.webhook_failed", { id, status }, err);
 *
 * Request-ID correlation:
 *   The middleware mints an `x-request-id` for every request. Route
 *   handlers can wrap their body in `withRequestId(id, fn)` and every
 *   `log.*` call inside that scope gets `request_id` automatically
 *   stamped on the JSON line — no plumbing through call sites.
 *
 *   For runtimes where AsyncLocalStorage isn't available (some edge
 *   variants), callers can still pass `request_id` directly in the meta
 *   object — it gets hoisted to a top-level `request_id` key.
 *
 * Do NOT pass secrets in the meta argument — keys + tokens + raw PII
 * should be redacted before they reach the logger.
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [k: string]: unknown;
}

/**
 * AsyncLocalStorage gives us request-scoped context without threading
 * the request id through every function. Loaded lazily + tolerantly so
 * runtimes that don't expose `node:async_hooks` silently fall back to
 * the explicit-meta path.
 */
interface RequestContext {
  request_id: string;
}

type ALS<T> = {
  getStore: () => T | undefined;
  run: <R>(store: T, fn: () => R) => R;
};

let als: ALS<RequestContext> | null = null;
let alsAttempted = false;

function getAls(): ALS<RequestContext> | null {
  if (alsAttempted) return als;
  alsAttempted = true;
  try {
    // require keeps the failure local to this try/catch — a missing
    // module in an edge runtime won't crash module init.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("node:async_hooks") as {
      AsyncLocalStorage: new <T>() => ALS<T>;
    };
    als = new mod.AsyncLocalStorage<RequestContext>();
  } catch {
    als = null;
  }
  return als;
}

function currentRequestId(): string | undefined {
  return getAls()?.getStore()?.request_id;
}

function emit(level: Level, evt: string, meta?: LogMeta, err?: unknown) {
  // Hoist request_id from either the AsyncLocalStorage scope or an
  // explicit field on meta. Explicit wins so callers can override.
  const explicit =
    meta && typeof meta.request_id === "string"
      ? (meta.request_id as string)
      : undefined;
  const requestId = explicit ?? currentRequestId();

  // Strip request_id out of meta so it doesn't appear twice — once at
  // top level (the canonical place) and once nested inside meta.
  let cleanMeta: LogMeta | undefined = meta;
  if (meta && "request_id" in meta) {
    const { request_id: _drop, ...rest } = meta;
    void _drop;
    cleanMeta = rest;
  }

  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    evt,
    ...(requestId ? { request_id: requestId } : {}),
    ...(cleanMeta ?? {}),
  };
  if (err) {
    if (err instanceof Error) {
      line.error_message = err.message;
      line.error_stack = err.stack;
    } else {
      line.error_message = String(err);
    }
  }
  // Choose the console method that matches the level so log shippers
  // can colour-code and Sentry can capture warn/error automatically.
  const method =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  method(JSON.stringify(line));
}

export const log = {
  debug: (evt: string, meta?: LogMeta) => emit("debug", evt, meta),
  info: (evt: string, meta?: LogMeta) => emit("info", evt, meta),
  warn: (evt: string, meta?: LogMeta) => emit("warn", evt, meta),
  error: (evt: string, meta?: LogMeta, err?: unknown) =>
    emit("error", evt, meta, err),
};

/**
 * Run `fn` with `request_id` bound to the current async context. Every
 * `log.*` call inside (including in awaited descendants) auto-attaches
 * `request_id`.
 *
 * If AsyncLocalStorage isn't available in this runtime, `fn` runs
 * directly — callers that care should pass `request_id` in the meta
 * object as a fallback.
 */
export function withRequestId<T>(id: string, fn: () => T): T {
  const store = getAls();
  if (!store) return fn();
  return store.run({ request_id: id }, fn);
}

/**
 * Read the active request id (if any). Useful for non-log call sites —
 * e.g. tagging an outbound HTTP request or a DB insert.
 */
export function getRequestId(): string | undefined {
  return currentRequestId();
}
