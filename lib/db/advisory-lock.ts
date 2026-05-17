import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

/**
 * lib/db/advisory-lock.ts — Postgres advisory-lock helper.
 *
 * Pattern:
 *   Postgres exposes a pair of process-wide lock spaces independent of
 *   any table:
 *     - pg_advisory_lock(key bigint)      → session-scoped, must be
 *                                            released explicitly
 *     - pg_advisory_xact_lock(key bigint) → transaction-scoped, auto-
 *                                            released at COMMIT/ROLLBACK
 *
 *   We use the *xact* variant because we can wrap it in a single RPC
 *   that runs inside an implicit transaction — the lock is held for the
 *   lifetime of that RPC call and released the moment the function
 *   returns. The Node side then runs `fn()` outside the lock window.
 *
 *   That's still useful when you want "only one runner at a time"
 *   semantics in a Vercel cron tick: the RPC contends for the lock, the
 *   second invocation gets `acquired=false` and bails out without
 *   running the body. The first invocation runs `fn()` to completion.
 *
 *   For a true "hold the lock for the entire duration of fn" pattern we
 *   would need a long-lived session lock with explicit release. Vercel
 *   serverless doesn't make that easy because each `admin.rpc()` call
 *   reaches Supabase through PostgREST's connection pool — there's no
 *   guarantee the unlock RPC hits the same backend connection that
 *   acquired it. Session locks are tied to the backend that took them.
 *
 *   So instead: the lock acts as a *gate*. If acquired, we run; if not,
 *   we skip. Concurrent runners coordinate by retrying on the next tick.
 *
 * String → bigint key mapping:
 *   pg_advisory_*lock takes a bigint, but call-site keys are strings
 *   like "workflow-runner" or "ai-batch-runner". We hash with the
 *   built-in `hashtextextended` (returns a 64-bit signed int) and feed
 *   that into the lock function. Collisions are astronomically unlikely
 *   across our small fixed set of keys.
 *
 * Usage:
 *
 *   const result = await withAdvisoryLock("workflow-runner", async () => {
 *     // exclusive section — only one process runs this concurrently.
 *     return runWorkflowDispatcher();
 *   });
 *
 *   if (!result.acquired) {
 *     // another runner is already in the section; this tick is a no-op.
 *     return { skipped: true };
 *   }
 *   return result.value;
 *
 *   The single SQL function `public.try_advisory_lock_str(key text)`
 *   returns boolean — true if we got the lock, false if another caller
 *   has it. We only call it inside a `do $$` block so the xact-lock
 *   lives just long enough to test contention, then we run fn() in JS.
 *   That is *not* a real mutex — see "Trade-offs" below.
 *
 * Trade-offs:
 *   - This is a TTL-less "tryLock" gate, not a fair queue. If you need
 *     "drain the queue, retry holds across crashes," reach for a job
 *     table with a status column (see ai_batch_jobs pattern) instead.
 *   - Because the lock is released the moment the RPC returns, a second
 *     concurrent caller arriving 50ms later WILL succeed. We accept
 *     that — for "only one runner per minute" semantics aligned to the
 *     cron tick, this is sufficient. Two cron ticks colliding within
 *     the same minute is rare; when it happens the worst case is that
 *     two runners both process distinct claim windows of the job table,
 *     which is already idempotent.
 *
 * Migration: `20260519a_outbox_and_locks.sql` adds
 *   public.try_advisory_lock_str(key text) returns boolean.
 *
 * Degrades gracefully: if the RPC is missing (migration not yet
 * applied), the helper logs a warning ONCE and runs fn() without the
 * gate. That lets us wire call sites now and have the gate take effect
 * the moment the migration lands.
 */

export interface WithAdvisoryLockResult<T> {
  /** Did we acquire the lock for this invocation? */
  acquired: boolean;
  /** Return value of `fn()` when `acquired === true`, else undefined. */
  value?: T;
  /** Hashed bigint key used for the pg_advisory call, as a string. */
  key_hash?: string;
}

let warnedMissingRpc = false;

/**
 * Try to acquire a transaction-scoped advisory lock identified by
 * `key` and, on success, run `fn()` and return its value.
 *
 * - On lock contention (another process holds the lock), returns
 *   `{ acquired: false }` without running `fn`.
 * - On RPC error (e.g. migration not yet applied), logs once and runs
 *   `fn` anyway — never silently drop work.
 */
export async function withAdvisoryLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<WithAdvisoryLockResult<T>> {
  if (!key || typeof key !== "string") {
    // No key — caller is using us defensively, just run.
    const value = await fn();
    return { acquired: true, value };
  }

  const admin = createAdminClient();

  let acquired = false;
  let keyHash: string | undefined;
  try {
    const { data, error } = await admin.rpc("try_advisory_lock_str", {
      p_key: key,
    });
    if (error) {
      // Most common case: migration not applied yet. PostgREST returns
      // PGRST202 (Could not find the function) — we just degrade.
      const isMissingFn =
        /not find the function|does not exist|PGRST202/i.test(
          error.message ?? "",
        );
      if (isMissingFn) {
        if (!warnedMissingRpc) {
          warnedMissingRpc = true;
          log.warn("advisory_lock.rpc_missing", {
            key,
            note: "try_advisory_lock_str RPC not found; running without lock until migration applies",
          });
        }
        const value = await fn();
        return { acquired: true, value };
      }
      // Real error: log and proceed without the lock so we don't block
      // legitimate work on transient Supabase errors.
      log.warn("advisory_lock.rpc_error", { key, error: error.message });
      const value = await fn();
      return { acquired: true, value };
    }
    // RPC returns either a bare bool or { acquired, key_hash } depending
    // on the migration variant. We accept both shapes.
    if (typeof data === "boolean") {
      acquired = data;
    } else if (data && typeof data === "object") {
      const row = data as { acquired?: boolean; key_hash?: string | number };
      acquired = Boolean(row.acquired);
      if (row.key_hash !== undefined) keyHash = String(row.key_hash);
    } else if (Array.isArray(data) && data.length > 0) {
      const row = data[0] as { acquired?: boolean; key_hash?: string | number };
      acquired = Boolean(row.acquired);
      if (row.key_hash !== undefined) keyHash = String(row.key_hash);
    }
  } catch (e) {
    log.warn("advisory_lock.exception", {
      key,
      error: e instanceof Error ? e.message : String(e),
    });
    const value = await fn();
    return { acquired: true, value };
  }

  if (!acquired) {
    return { acquired: false, key_hash: keyHash };
  }

  const value = await fn();
  return { acquired: true, value, key_hash: keyHash };
}

/**
 * Catalog of well-known advisory-lock keys used across the codebase.
 *
 * Keeping the strings in one place makes it obvious what's serialised
 * against what — a new caller using the same string accidentally
 * would otherwise be invisible until production weirdness shows up.
 *
 * Format: kebab-case, scoped by feature. Stable forever — changing a
 * key splits the lock into two and breaks the mutual-exclusion guarantee.
 */
export const AdvisoryLockKeys = {
  WorkflowRunner: "spacefield:workflow-runner",
  AiBatchRunner: "spacefield:ai-batch-runner",
  OutboxRelay: "spacefield:outbox-relay",
} as const;

export type AdvisoryLockKey =
  (typeof AdvisoryLockKeys)[keyof typeof AdvisoryLockKeys];
