/* HMAC-signed webhook delivery for toShare.
 *
 * Every outbound webhook (form submission, quote accept, booking
 * created) carries:
 *
 *   X-toShare-Signature: sha256=<hex>   // HMAC-SHA256(secret, raw-body)
 *   X-toShare-Timestamp: <unix-seconds> // for replay-window enforcement
 *   X-toShare-Event:     <event-name>   // e.g. form.submitted
 *
 * Receivers verify by:
 *   1. Take the raw request body
 *   2. Compute HMAC-SHA256 with the workspace's secret
 *   3. Compare hex(computed) with the hex from the header
 *   4. Reject if older than ~5 minutes (replay protection)
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

const TIMEOUT_MS = 5_000;

interface SignedDeliveryInput {
  workspaceId: string | null;
  webhookUrl: string;
  event: string;
  body: Record<string, unknown>;
}

/* Look up the workspace's webhook secret. Returns null if missing or
 * if the workspaceId is null (personal links can't sign). */
async function loadSecret(workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspaces")
      .select("toshare_webhook_secret")
      .eq("id", workspaceId)
      .maybeSingle();
    return (data?.toshare_webhook_secret as string | null) ?? null;
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

/* Fire a signed webhook. Best-effort (does NOT throw on network/timeout
 * errors — the caller doesn't want to block the user response). */
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
    "User-Agent": "toshare-webhook/1.0",
    "X-toShare-Event": input.event,
    "X-toShare-Timestamp": timestamp,
  };

  if (secret) {
    const signature = await hmacSha256Hex(secret, body);
    headers["X-toShare-Signature"] = `sha256=${signature}`;
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    await fetch(input.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: ac.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    console.warn(`[toshare] webhook ${input.event} failed:`, err instanceof Error ? err.message : err);
  }
}
