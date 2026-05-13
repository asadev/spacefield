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
 * Do NOT pass secrets in the meta argument — keys + tokens + raw PII
 * should be redacted before they reach the logger.
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [k: string]: unknown;
}

function emit(level: Level, evt: string, meta?: LogMeta, err?: unknown) {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    evt,
    ...(meta ?? {}),
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
