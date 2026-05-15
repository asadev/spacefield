/* HMAC-signed webhook delivery for Share with delivery logging.
 *
 * Every outbound webhook (form.submitted, quote.accepted, booking.created)
 * carries:
 *
 *   X-Share-Signature: sha256=<hex>   // HMAC-SHA256(secret, raw-body)
 *   X-Share-Timestamp: <unix-seconds> // for replay-window enforcement
 *   X-Share-Event:     <event-name>   // e.g. form.submitted
 *
 * Receivers verify by:
 *   1. Take the raw request body
 *   2. Compute HMAC-SHA256 with the workspace's secret
 *   3. Compare hex(computed) with the hex from the header
 *   4. Reject if older than ~5 minutes (replay protection)
 *
 * Every attempt (success/failure) writes a row to share_webhook_deliveries
 * so workspace admins can debug silent failures from the UI.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import { log } from "@/lib/log";

const TIMEOUT_MS = 5_000;

interface SignedDeliveryInput {
  /** Required so the delivery log can attribute the attempt. */
  linkId: string;
  /** Required for HMAC signing AND log row workspace_id (looked up from link). */
  workspaceId: string | null;
  webhookUrl: string;
  event: string;
  body: Record<string, unknown>;
}

type DeliveryStatus =
  | "success"
  | "timeout"
  | "network_error"
  | "non_2xx"
  | "signing_skipped"
  | "unknown";

async function loadSecret(workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspaces")
      .select("share_webhook_secret")
      .eq("id", workspaceId)
      .maybeSingle();
    return (data?.share_webhook_secret as string | null) ?? null;
  } catch {
    return null;
  }
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function recordDelivery(input: {
  linkId: string;
  event: string;
  webhookUrl: string;
  status: DeliveryStatus;
  httpStatus: number | null;
  responseExcerpt: string | null;
  signed: boolean;
  durationMs: number;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("share_record_webhook_delivery", {
      p_link_id: input.linkId,
      p_event: input.event,
      p_webhook_url: input.webhookUrl,
      p_status: input.status,
      p_http_status: input.httpStatus,
      p_response_excerpt: input.responseExcerpt,
      p_signed: input.signed,
      p_duration_ms: input.durationMs,
    });
  } catch (err) {
    console.warn(`[share] failed to log webhook delivery:`, err);
  }
}

/* Fire a signed webhook + log the attempt. Best-effort (never throws on
 * network/timeout errors — the caller doesn't want to block the user
 * response). */
export async function deliverSignedWebhook(input: SignedDeliveryInput): Promise<void> {
  const secret = await loadSecret(input.workspaceId);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    event: input.event,
    timestamp: new Date().toISOString(),
    ...input.body,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "share-webhook/1.0",
    "X-Share-Event": input.event,
    "X-Share-Timestamp": timestamp,
  };

  const signed = Boolean(secret);
  if (secret) {
    const signature = await hmacSha256Hex(secret, body);
    headers["X-Share-Signature"] = `sha256=${signature}`;
  }

  let status: DeliveryStatus = "unknown";
  let httpStatus: number | null = null;
  let responseExcerpt: string | null = null;
  const startedAt = Date.now();

  try {
    const res = await safeFetch(input.webhookUrl, {
      method: "POST",
      headers,
      body,
      timeoutMs: TIMEOUT_MS,
    });
    httpStatus = res.status;
    if (res.ok) {
      status = "success";
    } else {
      status = "non_2xx";
    }
    try {
      const text = await res.text();
      responseExcerpt = text.slice(0, 500);
    } catch {
      // ignore — body might already be consumed or not readable
    }
  } catch (err) {
    if (err instanceof SafeFetchError) {
      // SSRF guard fired — record a failed delivery rather than throwing.
      status = "network_error";
      responseExcerpt = `safe-fetch blocked: ${err.reason}`;
      log.warn("share.webhook_blocked", {
        event: input.event,
        link_id: input.linkId,
        reason: err.reason,
      });
    } else if (err instanceof DOMException && err.name === "AbortError") {
      status = "timeout";
    } else if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      status = "timeout";
    } else {
      status = "network_error";
      responseExcerpt = err instanceof Error ? err.message.slice(0, 500) : null;
    }
    if (!(err instanceof SafeFetchError)) {
      log.warn("share.webhook_failed", {
        event: input.event,
        link_id: input.linkId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    const durationMs = Date.now() - startedAt;
    // Don't await — log async so the caller doesn't wait
    recordDelivery({
      linkId: input.linkId,
      event: input.event,
      webhookUrl: input.webhookUrl,
      status,
      httpStatus,
      responseExcerpt,
      signed,
      durationMs,
    }).catch(() => {});
  }
}
