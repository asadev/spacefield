import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaddleWebhookSecret } from "@/lib/paddle";
import { matchPaddleProduct } from "@/app/_data/paddle-products";

/* /api/paddle/webhook
 *
 *   Receives Paddle.com webhook events.
 *
 *   Signature scheme (Paddle docs: "Verify webhook signatures"):
 *     Header: `Paddle-Signature: ts=<unix_seconds>;h1=<hmac_sha256_hex>`
 *     Signed content: `${ts}:${rawBody}`
 *     Algorithm: HMAC-SHA256, key = PADDLE_WEBHOOK_SECRET (raw string).
 *     Reject if |now - ts| > 5 minutes (replay protection).
 *
 *   Idempotency: insert one row per `event_id` in paddle_webhook_events.
 *   Duplicate deliveries 200 immediately without re-processing.
 *
 *   Dispatch table (Paddle event → DB action):
 *     subscription.created  → upsert subscriptions / mark addon active
 *     subscription.activated → same as created (paid trial converted)
 *     subscription.updated  → mirror status, including past_due/paused
 *     subscription.canceled → revert tier to free once period ends /
 *                             mark addon canceled
 *     subscription.paused / resumed → mirror status only
 *     transaction.completed → log only (covered by event-row insert)
 *
 *   The custom_data field on subscriptions/transactions is the bridge
 *   from Paddle back to our user_id + workspace_id, set in checkout.
 *
 *   Service-role client used because:
 *     - paddle_webhook_events has no public-write RLS policy.
 *     - We need to write subscriptions rows for arbitrary users.
 */

export const runtime = "nodejs";

interface PaddlePriceRef {
  product_id?: string;
  id?: string;
}

interface PaddleSubscriptionItem {
  price?: PaddlePriceRef;
  status?: string;
}

interface PaddleSubscriptionData {
  id?: string;
  status?: string;
  customer_id?: string | null;
  next_billed_at?: string | null;
  current_billing_period?: { ends_at?: string | null } | null;
  items?: PaddleSubscriptionItem[];
  custom_data?: Record<string, unknown> | null;
}

interface PaddleEvent {
  event_id?: string;
  notification_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleSubscriptionData | null;
}

const SKEW_TOLERANCE_SECONDS = 5 * 60;

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function parsePaddleSignature(header: string): { ts: string; h1: string } | null {
  // Format: `ts=1700000000;h1=abc123...` — could carry multiple `h1`
  // values across rotations; we accept the first.
  const parts = header.split(";").map((p) => p.trim()).filter(Boolean);
  let ts = "";
  let h1 = "";
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (k === "ts" && !ts) ts = v;
    else if (k === "h1" && !h1) h1 = v;
  }
  if (!ts || !h1) return null;
  return { ts, h1 };
}

function verifyPaddleSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  const parsed = parsePaddleSignature(signatureHeader);
  if (!parsed) return false;
  const tsNum = Number(parsed.ts);
  if (!Number.isFinite(tsNum)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > SKEW_TOLERANCE_SECONDS) return false;
  const signed = `${parsed.ts}:${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return timingSafeEqualHex(parsed.h1, expected);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paddle-signature") ?? "";
  if (!signatureHeader) {
    return NextResponse.json({ error: "missing paddle-signature" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = getPaddleWebhookSecret();
  } catch {
    return NextResponse.json(
      { error: "PADDLE_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  if (!verifyPaddleSignature(secret, rawBody, signatureHeader)) {
    return NextResponse.json({ error: "signature mismatch" }, { status: 401 });
  }

  let payload: PaddleEvent;
  try {
    payload = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventId = payload.event_id ?? payload.notification_id ?? "";
  const eventType = payload.event_type ?? "unknown";
  if (!eventId) {
    return NextResponse.json({ error: "missing event_id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: insert first; duplicate = 200 ack immediately.
  const { error: insertErr } = await supabase
    .from("paddle_webhook_events")
    .insert({
      event_id: eventId,
      type: eventType,
      payload: payload as unknown as Record<string, unknown>,
    });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  try {
    await dispatch(eventType, payload);
    await supabase
      .from("paddle_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Don't 500 — Paddle will retry forever. Log + ack so the operator
    // can replay manually after fixing root cause.
    console.error("[paddle webhook] dispatch failed", err);
    return NextResponse.json({ ok: true, processed: false });
  }
}

/* ───────── dispatch ───────── */

async function dispatch(eventType: string, payload: PaddleEvent): Promise<void> {
  switch (eventType) {
    case "subscription.created":
    case "subscription.activated":
    case "subscription.updated":
    case "subscription.resumed":
      await handleSubscriptionUpsert(payload);
      return;
    case "subscription.paused":
      await handleSubscriptionStatusOnly(payload, "paused");
      return;
    case "subscription.canceled":
      await handleSubscriptionCanceled(payload);
      return;
    case "transaction.completed":
      // Logged via the event-row insert; nothing else to do.
      return;
    default:
      // Unknown event type — already logged.
      return;
  }
}

interface CustomDataShape {
  user_id?: string;
  workspace_id?: string;
  kind?: string;
  tier?: string;
  addon_gb?: string | number;
}

function readCustomData(payload: PaddleEvent): CustomDataShape {
  const m = payload.data?.custom_data ?? {};
  const out: CustomDataShape = {};
  if (typeof m.user_id === "string") out.user_id = m.user_id;
  if (typeof m.workspace_id === "string") out.workspace_id = m.workspace_id;
  if (typeof m.kind === "string") out.kind = m.kind;
  if (typeof m.tier === "string") out.tier = m.tier;
  if (m.addon_gb !== null && m.addon_gb !== undefined) {
    if (typeof m.addon_gb === "string" || typeof m.addon_gb === "number") {
      out.addon_gb = m.addon_gb;
    }
  }
  return out;
}

function periodEndOf(sub: PaddleSubscriptionData): string | null {
  return (
    sub.current_billing_period?.ends_at ??
    sub.next_billed_at ??
    null
  );
}

function firstProductId(sub: PaddleSubscriptionData): string | null {
  const items = sub.items ?? [];
  for (const it of items) {
    const pid = it?.price?.product_id;
    if (typeof pid === "string" && pid.length > 0) return pid;
  }
  return null;
}

async function handleSubscriptionUpsert(payload: PaddleEvent): Promise<void> {
  const sub = payload.data;
  if (!sub || !sub.id) return;
  const productId = firstProductId(sub);
  if (!productId) return;

  const match = matchPaddleProduct(productId);
  if (!match) return;

  const meta = readCustomData(payload);
  const supabase = createAdminClient();
  const paddleStatus = sub.status ?? "active";
  const isActive = paddleStatus === "active" || paddleStatus === "trialing";

  if (match.kind === "tier") {
    const userId = meta.user_id;
    if (!userId) {
      console.warn("[paddle webhook] tier subscription without user_id custom_data", sub.id);
      return;
    }
    const tierId = isActive ? match.tier_id : "free";
    await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          tier_id: tierId,
          status: paddleStatus,
          paddle_customer_id: sub.customer_id ?? null,
          paddle_subscription_id: sub.id,
          paddle_status: paddleStatus,
          current_period_end: periodEndOf(sub),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    return;
  }

  // Add-on subscription.
  const workspaceId = meta.workspace_id;
  if (!workspaceId) {
    console.warn("[paddle webhook] addon subscription without workspace_id custom_data", sub.id);
    return;
  }
  const paymentStatus = isActive
    ? "active"
    : paddleStatus === "past_due"
      ? "past_due"
      : "pending";
  await supabase
    .from("workspace_storage_addons")
    .upsert(
      {
        workspace_id: workspaceId,
        addon_gb: match.addon_gb,
        selected_by: meta.user_id ?? null,
        selected_at: new Date().toISOString(),
        paddle_subscription_id: sub.id,
        paddle_status: paddleStatus,
        payment_status: paymentStatus,
        current_period_end: periodEndOf(sub),
      },
      { onConflict: "workspace_id" }
    );
}

async function handleSubscriptionStatusOnly(
  payload: PaddleEvent,
  newStatus: string
): Promise<void> {
  const sub = payload.data;
  if (!sub || !sub.id) return;
  const supabase = createAdminClient();

  const { data: tierRow } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("paddle_subscription_id", sub.id)
    .maybeSingle();

  if (tierRow) {
    await supabase
      .from("subscriptions")
      .update({
        paddle_status: newStatus,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("paddle_subscription_id", sub.id);
    return;
  }

  await supabase
    .from("workspace_storage_addons")
    .update({
      paddle_status: newStatus,
      payment_status: newStatus === "paused" ? "past_due" : newStatus,
    })
    .eq("paddle_subscription_id", sub.id);
}

async function handleSubscriptionCanceled(payload: PaddleEvent): Promise<void> {
  const sub = payload.data;
  if (!sub || !sub.id) return;
  const supabase = createAdminClient();
  const periodEnd = periodEndOf(sub);

  const { data: tierRow } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("paddle_subscription_id", sub.id)
    .maybeSingle();

  if (tierRow) {
    const periodEndMs = periodEnd ? new Date(periodEnd).getTime() : 0;
    const now = Date.now();
    // If period is over, drop tier. Otherwise mark canceled but leave
    // tier_id intact so the user keeps benefits through the paid period.
    const updates: Record<string, unknown> = {
      paddle_status: sub.status ?? "canceled",
      status: "canceled",
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    };
    if (!periodEndMs || periodEndMs < now) {
      updates.tier_id = "free";
    }
    await supabase
      .from("subscriptions")
      .update(updates)
      .eq("paddle_subscription_id", sub.id);
    return;
  }

  await supabase
    .from("workspace_storage_addons")
    .update({
      paddle_status: sub.status ?? "canceled",
      payment_status: "canceled",
      current_period_end: periodEnd,
    })
    .eq("paddle_subscription_id", sub.id);
}
