/* lib/webhooks/retry.ts — exponential-backoff delivery wrapper.
 *
 * Wraps `safeFetch` so an outgoing webhook will retry on 5xx + transient
 * network errors with a 1s, 4s, 16s, 64s backoff (max 4 retries on top
 * of the initial attempt → up to 5 attempts total, ~85s worst case).
 *
 * The wrapper does NOT spin in-process for the full backoff — for
 * Vercel functions that would chew up duration budget. Instead each
 * attempt is logged to `webhook_deliveries_v2` with `attempt = N`,
 * `delivery_group = <uuid>`, and either:
 *   - `status = 'retry_scheduled'` + `next_attempt_at = now() + delay`
 *     when there are retries left, OR
 *   - `status = 'exhausted'` when we've burned through max_retries.
 *
 * For the synchronous `testEndpoint` flow (admin "test send" button)
 * the wrapper does perform the in-process sleeps so the admin sees
 * the final result. The async path is exposed via `deliverWithRetry`
 * which the caller can choose to await.
 *
 * Retryable conditions:
 *   - HTTP 5xx (incl. 502/503/504)
 *   - HTTP 408 (request timeout)
 *   - HTTP 429 (rate limited)
 *   - `timeout` SignedSendResult.status
 *   - `network_error` SignedSendResult.status (covers DNS/abort/etc.)
 *
 * NON-retryable: 4xx other than 408/429, signing_skipped (no secret →
 * no point retrying), SafeFetch SSRF rejection (will fail identically).
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  sendSigned,
  type SignedSendInput,
  type SignedSendResult,
  type WebhookSignStatus,
} from "@/lib/webhooks/sign";

/** Exponential-backoff schedule in seconds: 1, 4, 16, 64. */
export const DEFAULT_BACKOFF_SECONDS = [1, 4, 16, 64] as const;

export interface DeliverWithRetryInput extends SignedSendInput {
  /** Required so attempt rows can be linked back to the endpoint. */
  endpointId: string;
  /** Hard cap on total retries (default 4 → max 5 attempts). */
  maxRetries?: number;
  /**
   * "sync"  — sleep in-process between attempts. Use for the admin
   *           test-send flow where the operator wants the final result.
   * "async" — log each attempt with `next_attempt_at` and return
   *           immediately after the first attempt. A background worker
   *           or the admin retry-runner picks up `retry_scheduled` rows
   *           later. Default.
   */
  mode?: "sync" | "async";
  /**
   * Optional metadata stamped on every attempt row. The `triggered_by`
   * value is set on the very first attempt's metadata under this key.
   */
  metadata?: Record<string, unknown>;
  /** Optional caller-supplied delivery group; auto-generated otherwise. */
  deliveryGroup?: string;
  /** Override backoff seconds for tests. */
  backoffSeconds?: readonly number[];
}

export interface DeliverWithRetryResult {
  status: WebhookSignStatus | "exhausted" | "retry_scheduled";
  httpStatus: number | null;
  attempts: number;
  finalAt: string;
  deliveryGroup: string;
  /** True once the final state is success/non-retryable failure. */
  done: boolean;
}

/* Decide whether the given attempt outcome warrants another try.
 * - success / signing_skipped → done (no retry)
 * - timeout / network_error → retry
 * - non_2xx → retry only if http status is 5xx, 408, or 429
 */
export function isRetryable(result: SignedSendResult): boolean {
  if (result.status === "success") return false;
  if (result.status === "signing_skipped") return false;
  if (result.status === "timeout" || result.status === "network_error") {
    return true;
  }
  if (result.status === "non_2xx") {
    const s = result.httpStatus ?? 0;
    if (s >= 500 && s < 600) return true;
    if (s === 408 || s === 429) return true;
    return false;
  }
  return false;
}

function newUuid(): string {
  // crypto.randomUUID is available in Node 19+ and Vercel runtimes.
  return crypto.randomUUID();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Persist one attempt row. Best-effort — failures are logged but never
 * thrown, otherwise a database hiccup would mask the delivery outcome. */
async function logAttempt(opts: {
  endpointId: string;
  event: string;
  bodyText: string;
  result: SignedSendResult;
  attempt: number;
  deliveryGroup: string;
  status: WebhookSignStatus | "exhausted" | "retry_scheduled";
  nextAttemptAt: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(opts.bodyText) as Record<string, unknown>;
    } catch {
      payload = { raw: opts.bodyText.slice(0, 1024) };
    }
    await admin.from("webhook_deliveries_v2").insert({
      endpoint_id: opts.endpointId,
      event: opts.event,
      payload,
      status: opts.status,
      http_status: opts.result.httpStatus,
      response_excerpt: opts.result.responseExcerpt,
      duration_ms: opts.result.durationMs,
      signed: opts.result.signed,
      attempt: opts.attempt,
      delivery_group: opts.deliveryGroup,
      next_attempt_at: opts.nextAttemptAt
        ? opts.nextAttemptAt.toISOString()
        : null,
      metadata: opts.metadata ?? {},
    });
  } catch (e) {
    log.warn("webhook.retry.log_attempt_failed", {
      endpoint_id: opts.endpointId,
      attempt: opts.attempt,
      reason: safeErrorMessage(e, {
        source: "webhook.retry.log_attempt",
        fallback: "log_failed",
      }),
    });
  }
}

/* Deliver a webhook with retries.
 *
 * In sync mode the call resolves only after the final attempt (either
 * success or exhaustion). In async mode the call resolves after the
 * first attempt — if that attempt was a retryable failure, a
 * `retry_scheduled` row is written with `next_attempt_at` set; a
 * worker will pick it up.
 */
export async function deliverWithRetry(
  input: DeliverWithRetryInput
): Promise<DeliverWithRetryResult> {
  const backoff = input.backoffSeconds ?? DEFAULT_BACKOFF_SECONDS;
  const maxRetries = Math.max(
    0,
    Math.min(input.maxRetries ?? backoff.length, backoff.length)
  );
  const mode = input.mode ?? "async";
  const deliveryGroup = input.deliveryGroup ?? newUuid();

  let attemptNum = 0;
  let lastResult: SignedSendResult | null = null;
  const baseMetadata = { ...(input.metadata ?? {}), mode };

  while (attemptNum <= maxRetries) {
    attemptNum += 1;
    const result = await sendSigned({
      url: input.url,
      event: input.event,
      body: input.body,
      secret: input.secret,
    });
    lastResult = result;
    const retryable = isRetryable(result);
    const isFinalAttempt = attemptNum > maxRetries || !retryable;

    if (isFinalAttempt) {
      // Final attempt — either success, non-retryable failure, or we
      // burned through all retries.
      const finalStatus: WebhookSignStatus | "exhausted" =
        retryable && attemptNum > maxRetries ? "exhausted" : result.status;
      await logAttempt({
        endpointId: input.endpointId,
        event: input.event,
        bodyText: result.bodyText,
        result,
        attempt: attemptNum,
        deliveryGroup,
        status: finalStatus,
        nextAttemptAt: null,
        metadata: {
          ...baseMetadata,
          final: true,
          retryable_at_end: retryable,
        },
      });
      return {
        status: finalStatus,
        httpStatus: result.httpStatus,
        attempts: attemptNum,
        finalAt: new Date().toISOString(),
        deliveryGroup,
        done: true,
      };
    }

    // Retryable. Compute the delay for the NEXT attempt.
    // attemptNum is the count of attempts JUST completed; backoff
    // index is (attemptNum - 1) because backoff[0] sits between
    // attempt 1 and attempt 2.
    const delaySec = backoff[attemptNum - 1] ?? backoff[backoff.length - 1] ?? 1;
    const nextAt = new Date(Date.now() + delaySec * 1000);

    if (mode === "async") {
      // Persist a retry_scheduled row and bail. Worker handles the rest.
      await logAttempt({
        endpointId: input.endpointId,
        event: input.event,
        bodyText: result.bodyText,
        result,
        attempt: attemptNum,
        deliveryGroup,
        status: "retry_scheduled",
        nextAttemptAt: nextAt,
        metadata: {
          ...baseMetadata,
          delay_sec: delaySec,
          retry_no: attemptNum,
        },
      });
      return {
        status: "retry_scheduled",
        httpStatus: result.httpStatus,
        attempts: attemptNum,
        finalAt: new Date().toISOString(),
        deliveryGroup,
        done: false,
      };
    }

    // sync mode — log the attempt, sleep, then loop.
    await logAttempt({
      endpointId: input.endpointId,
      event: input.event,
      bodyText: result.bodyText,
      result,
      attempt: attemptNum,
      deliveryGroup,
      status: "retry_scheduled",
      nextAttemptAt: nextAt,
      metadata: {
        ...baseMetadata,
        delay_sec: delaySec,
        retry_no: attemptNum,
      },
    });
    await sleep(delaySec * 1000);
  }

  // Should not be reachable — the loop always returns once attemptNum
  // exceeds maxRetries. Keep a defensive return for the type checker.
  const fallbackStatus: WebhookSignStatus | "exhausted" =
    lastResult?.status ?? "network_error";
  return {
    status: fallbackStatus,
    httpStatus: lastResult?.httpStatus ?? null,
    attempts: attemptNum,
    finalAt: new Date().toISOString(),
    deliveryGroup,
    done: true,
  };
}
