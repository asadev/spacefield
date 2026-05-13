import "server-only";

import { createHash } from "node:crypto";

import { releaseInfo } from "@/lib/release-info";
import { createAdminClient } from "@/lib/supabase/admin";

import type { ErrorLevel } from "@/app/admin/_types";

/**
 * Sentry-lite error logger. Writes to `public.error_events` via the
 * service-role client so it always succeeds regardless of caller RLS.
 *
 * Designed to be best-effort and never throw — calling code must not
 * have its own error path broken by the logger itself.
 */

export interface LogErrorInput {
  message: string;
  source?: string | null;
  level?: ErrorLevel;
  fingerprint?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  request_id?: string | null;
  stack?: string | null;
  url?: string | null;
  user_agent?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Auto-derive a fingerprint when one isn't supplied. Uses message + the
 * first stack frame so retries of the same crash group together. Falls
 * back to a message-only hash when there's no stack.
 */
function autoFingerprint(message: string, stack: string | null | undefined): string {
  const firstFrame =
    typeof stack === "string"
      ? (stack
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.startsWith("at ")) ?? "")
      : "";
  const seed = `${message}\n${firstFrame}`;
  return createHash("sha1").update(seed).digest("hex").slice(0, 16);
}

/**
 * Insert an error_events row. Never throws — failures are swallowed and
 * surfaced to stderr so the original code path is unaffected.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const message = (input.message ?? "").toString().slice(0, 4000);
    if (!message) return;

    const fingerprint =
      input.fingerprint && input.fingerprint.trim()
        ? input.fingerprint.trim().slice(0, 64)
        : autoFingerprint(message, input.stack);

    // Stamp release info onto every error so /admin/errors can show
    // which deploy / region a crash came from without us having to add
    // a column per dimension. `release` becomes a top-level key inside
    // the existing JSONB `context` column.
    const release = releaseInfo();
    const mergedContext: Record<string, unknown> = {
      ...(input.context ?? {}),
      release: {
        commit: release.commit,
        region: release.region,
        deployment_id: release.deployment_id,
        env: release.env,
      },
    };

    const admin = createAdminClient();
    const { error } = await admin.from("error_events").insert({
      level: input.level ?? "error",
      source: input.source ?? null,
      message,
      fingerprint,
      user_id: input.user_id ?? null,
      workspace_id: input.workspace_id ?? null,
      request_id: input.request_id ?? null,
      url: input.url ?? null,
      user_agent: input.user_agent ?? null,
      stack: input.stack ?? null,
      context: mergedContext,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[error-log] insert failed:", error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[error-log] unexpected:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Wrap an async block. If `fn` throws, the error is logged with `source`
 * and re-thrown so the caller's error path still runs.
 */
export async function withErrorLogging<T>(
  source: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    await logError({
      message: e.message,
      source,
      level: "error",
      stack: e.stack ?? null,
    });
    throw err;
  }
}

/**
 * Best-effort `process` listener install (Node-only). Captures uncaught
 * exceptions and unhandled rejections into error_events.
 *
 * Idempotent — second invocation is a no-op. We tag the listeners with
 * a Symbol so we can detect prior installation.
 */
const INSTALLED = Symbol.for("space-field.error-log.installed");

interface InstallableProcess {
  [INSTALLED]?: boolean;
  on(event: "uncaughtException", listener: (err: Error) => void): unknown;
  on(
    event: "unhandledRejection",
    listener: (reason: unknown) => void
  ): unknown;
}

export function installGlobalErrorHandlers(): void {
  try {
    if (typeof process === "undefined") return;
    const p = process as unknown as InstallableProcess;
    if (p[INSTALLED]) return;
    p[INSTALLED] = true;

    p.on("uncaughtException", (err: Error) => {
      void logError({
        message: err?.message ?? String(err),
        source: "node:uncaughtException",
        level: "fatal",
        stack: err?.stack ?? null,
      });
    });

    p.on("unhandledRejection", (reason: unknown) => {
      const err =
        reason instanceof Error ? reason : new Error(String(reason));
      void logError({
        message: err.message,
        source: "node:unhandledRejection",
        level: "error",
        stack: err.stack ?? null,
      });
    });
  } catch {
    // best-effort; never break startup
  }
}
