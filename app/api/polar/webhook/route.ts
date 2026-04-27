import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPolarWebhookSecret } from "@/lib/polar";
import { matchPolarProduct } from "@/app/_data/polar-products";

/* /api/polar/webhook
 *
 *   Receives Standard Webhooks-formatted events from Polar.sh.
 *
 *   Signature scheme (https://www.standardwebhooks.com/):
 *     - webhook-id        opaque event id (also our idempotency key)
 *     - webhook-timestamp unix seconds; reject if > 5 min skew
 *     - webhook-signature space-separated `v1,<base64(hmac_sha256)>`
 *                         (multiple keys can sign — comma-separated;
 *                         we accept if ANY key matches)
 *
 *     signed_content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *
 *   Polar's secret is base64 with a `whsec_` prefix; we strip the
 *   prefix, base64-decode, then HMAC the signed_content with the raw
 *   bytes.
 *
 *   Idempotency: we INSERT the event row keyed on event_id. ON CONFLICT
 *   we 200 immediately without re-processing.
 *
 *   Dispatch table:
 *     subscription.created  → upsert subscriptions / mark addon active
 *     subscription.updated  → mirror status; revert tier on canceled
 *     subscription.canceled → revert tier to free / mark addon canceled
 *     order.created         → log only
 *
 *   All other events are logged + acked (so Polar stops retrying).
 *
 *   We use the service-role Supabase client because:
 *     - polar_webhook_events has no public-write RLS policy.
 *     - We need to write subscriptions rows for arbitrary users.
 */

// Force the Node runtime (we use the `node:crypto` module + raw body
// hashing; Edge has WebCrypto but the API differs and the Standard
// Webhooks spec is easier with Node Buffer).
export const runtime = "nodejs";

interface PolarWebhookPayload {
  type?: string;
  data?: {
    id?: string;
    product_id?: string;
    customer_id?: string;
    customer?: { id?: string; email?: string | null } | null;
    status?: string;
    current_period_end?: string | null;
    metadata?: Record<string, string | number | null> | null;
  } | null;
}

const SKEW_TOLERANCE_SECONDS = 5 * 60;

function timingSafeEqualB64(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "base64");
    const bb = Buffer.from(b, "base64");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function decodeWebhookSecret(rawSecret: string): Buffer {
  const stripped = rawSecret.startsWith("whsec_") ? rawSecret.slice(6) : rawSecret;
  // Polar/Standard Webhooks secrets are base64-encoded random bytes.
  return Buffer.from(stripped, "base64");
}

function computeSignature(
  secretBytes: Buffer,
  webhookId: string,
  webhookTimestamp: string,
  rawBody: string
): string {
  const signed = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  return crypto.createHmac("sha256", secretBytes).update(signed).digest("base64");
}

function verifySignature(
  rawSecret: string,
  webhookId: string,
  webhookTimestamp: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  // Reject stale events (replay protection).
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SKEW_TOLERANCE_SECONDS) return false;

  const secretBytes = decodeWebhookSecret(rawSecret);
  const expected = computeSignature(secretBytes, webhookId, webhookTimestamp, rawBody);

  // The signature header is space-separated `v1,<sig> v1,<sig2>`; we
  // accept if any v1 entry matches. Some implementations use commas.
  const tokens = signatureHeader.split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    if (!t.startsWith("v1,")) continue;
    const sig = t.slice(3);
    if (timingSafeEqualB64(sig, expected)) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = req.headers.get("webhook-signature") ?? "";

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: "missing webhook headers" },
      { status: 400 }
    );
  }

  let secret: string;
  try {
    secret = getPolarWebhookSecret();
  } catch {
    return NextResponse.json(
      { error: "POLAR_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  if (!verifySignature(secret, webhookId, webhookTimestamp, rawBody, webhookSignature)) {
    return NextResponse.json({ error: "signature mismatch" }, { status: 401 });
  }

  let payload: PolarWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PolarWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = payload.type ?? "unknown";
  const supabase = createAdminClient();

  // Idempotency: insert the event row first. If the event_id already
  // exists we 200 immediately without re-processing.
  const { error: insertErr } = await supabase
    .from("polar_webhook_events")
    .insert({
      event_id: webhookId,
      type: eventType,
      payload: payload as unknown as Record<string, unknown>,
    });
  if (insertErr) {
    // Unique-violation = duplicate delivery. Treat as success.
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  try {
    await dispatch(eventType, payload);
    await supabase
      .from("polar_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", webhookId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Don't 500 — Polar will retry forever. Log + ack so the operator
    // can replay manually after fixing root cause.
    console.error("[polar webhook] dispatch failed", err);
    return NextResponse.json({ ok: true, processed: false });
  }
}

/* ───────── dispatch ───────── */

async function dispatch(eventType: string, payload: PolarWebhookPayload): Promise<void> {
  switch (eventType) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.active":
      await handleSubscriptionUpsert(payload);
      return;
    case "subscription.canceled":
    case "subscription.revoked":
      await handleSubscriptionCanceled(payload);
      return;
    case "order.created":
      // Logged via the event row insert; nothing else to do.
      return;
    default:
      // Unknown event type — already logged.
      return;
  }
}

interface MetadataShape {
  user_id?: string;
  workspace_id?: string;
  kind?: string;
  tier?: string;
  addon_gb?: string | number;
}

function readMetadata(payload: PolarWebhookPayload): MetadataShape {
  const m = payload.data?.metadata ?? {};
  const out: MetadataShape = {};
  if (typeof m.user_id === "string") out.user_id = m.user_id;
  if (typeof m.workspace_id === "string") out.workspace_id = m.workspace_id;
  if (typeof m.kind === "string") out.kind = m.kind;
  if (typeof m.tier === "string") out.tier = m.tier;
  if (m.addon_gb !== null && m.addon_gb !== undefined) out.addon_gb = m.addon_gb;
  return out;
}

async function handleSubscriptionUpsert(payload: PolarWebhookPayload): Promise<void> {
  const sub = payload.data;
  if (!sub || !sub.id || !sub.product_id) return;

  const match = matchPolarProduct(sub.product_id);
  if (!match) return; // Unknown product — ignore.

  const meta = readMetadata(payload);
  const supabase = createAdminClient();
  const polarStatus = sub.status ?? "active";
  // Treat any "really paying" state as active for our purposes.
  const isActive = polarStatus === "active" || polarStatus === "trialing";

  if (match.kind === "tier") {
    // We need a user_id either from metadata or from the customer.
    const userId = meta.user_id;
    if (!userId) {
      console.warn("[polar webhook] tier subscription without user_id metadata", sub.id);
      return;
    }
    const tierId = isActive ? match.tier_id : "free";
    await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          tier_id: tierId,
          status: polarStatus,
          polar_customer_id: sub.customer_id ?? sub.customer?.id ?? null,
          polar_subscription_id: sub.id,
          polar_status: polarStatus,
          current_period_end: sub.current_period_end ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    return;
  }

  // Add-on subscription.
  const workspaceId = meta.workspace_id;
  if (!workspaceId) {
    console.warn("[polar webhook] addon subscription without workspace_id metadata", sub.id);
    return;
  }
  const paymentStatus = isActive ? "active" : polarStatus === "past_due" ? "past_due" : "pending";
  await supabase
    .from("workspace_storage_addons")
    .upsert(
      {
        workspace_id: workspaceId,
        addon_gb: match.addon_gb,
        selected_by: meta.user_id ?? null,
        selected_at: new Date().toISOString(),
        polar_subscription_id: sub.id,
        polar_status: polarStatus,
        payment_status: paymentStatus,
        current_period_end: sub.current_period_end ?? null,
      },
      { onConflict: "workspace_id" }
    );
}

async function handleSubscriptionCanceled(payload: PolarWebhookPayload): Promise<void> {
  const sub = payload.data;
  if (!sub || !sub.id) return;
  const supabase = createAdminClient();

  // Try the tier path first (subscriptions row).
  const { data: tierRow } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("polar_subscription_id", sub.id)
    .maybeSingle();

  if (tierRow) {
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
    const now = Date.now();
    // If the period is already over, drop tier. Otherwise mark
    // canceled but leave tier_id intact so the user keeps benefits
    // through the paid period.
    const updates: Record<string, unknown> = {
      polar_status: sub.status ?? "canceled",
      status: "canceled",
      current_period_end: sub.current_period_end ?? null,
      updated_at: new Date().toISOString(),
    };
    if (!periodEnd || periodEnd < now) {
      updates.tier_id = "free";
    }
    await supabase
      .from("subscriptions")
      .update(updates)
      .eq("polar_subscription_id", sub.id);
    return;
  }

  // Otherwise it's an add-on.
  await supabase
    .from("workspace_storage_addons")
    .update({
      polar_status: sub.status ?? "canceled",
      payment_status: "canceled",
      current_period_end: sub.current_period_end ?? null,
    })
    .eq("polar_subscription_id", sub.id);
}
