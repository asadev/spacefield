import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { signInstanceWebhook } from "@/lib/whatsapp/instance-manager";
import { parseEvolutionEvent } from "@/lib/whatsapp/webhook-parser";
import type {
  ParsedEvolutionEvent,
  WhatsAppInstanceRow,
} from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Evolution → Spacefield webhook.
 *
 * URL shape: /api/whatsapp/webhook?instance=<name>&secret=<hex>
 *
 * Auth is by HMAC: `secret = sha256(instanceName, WHATSAPP_WEBHOOK_SECRET)`.
 * That avoids burning a shared secret in plaintext on Evolution while
 * keeping every per-instance webhook URL unique.
 *
 * We always 200 to Evolution so it doesn't pile up retries. Any
 * processing error is logged and swallowed.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const instanceName = sp.get("instance");
  const secret = sp.get("secret");

  if (!instanceName || !secret) {
    return NextResponse.json(
      { error: "instance and secret required" },
      { status: 400 },
    );
  }

  let expected: string;
  try {
    expected = signInstanceWebhook(instanceName);
  } catch (e) {
    // Webhook secret env missing — log loud, deny.
    // eslint-disable-next-line no-console
    console.error("[whatsapp.webhook] signing failed:", e);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!constantTimeEquals(secret, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  const parsed = parseEvolutionEvent(payload);
  // Always ack 200; we don't want Evolution retrying.
  try {
    await dispatch(parsed, instanceName);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.webhook] dispatch error",
      parsed.type,
      e instanceof Error ? e.message : String(e),
    );
  }

  return NextResponse.json({ ok: true });
}

/** Process a parsed event against the instance row. */
async function dispatch(
  event: ParsedEvolutionEvent,
  fallbackInstanceName: string,
): Promise<void> {
  const admin = createAdminClient();
  const instanceName = event.instanceName || fallbackInstanceName;

  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("evolution_instance_name", instanceName)
    .maybeSingle();

  if (!instRow) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.webhook] no instance row for",
      instanceName,
      "event:",
      event.type,
    );
    return;
  }
  const inst = instRow as WhatsAppInstanceRow;

  switch (event.type) {
    case "MESSAGES_UPSERT": {
      // Idempotency — evolution_message_id is the unique key.
      const direction = event.direction;
      let contactId: string | null = null;

      if (direction === "inbound" && event.message.remoteNumber) {
        contactId = await findOrCreateContact(
          inst.workspace_id,
          event.message.remoteNumber,
        );
      } else if (event.message.remoteNumber) {
        const { data: existing } = await admin
          .from("crm_contacts")
          .select("id")
          .eq("workspace_id", inst.workspace_id)
          .eq("phone", event.message.remoteNumber)
          .maybeSingle();
        if (existing) contactId = (existing as { id: string }).id;
      }

      const row = {
        workspace_id: inst.workspace_id,
        instance_id: inst.id,
        contact_id: contactId,
        direction,
        from_number:
          direction === "inbound" ? event.message.remoteNumber : null,
        to_number:
          direction === "outbound" ? event.message.remoteNumber : null,
        body: event.message.body,
        media_url: event.message.mediaUrl,
        media_type: event.message.mediaType,
        status:
          direction === "outbound" ? ("sent" as const) : ("delivered" as const),
        evolution_message_id: event.message.evolutionMessageId,
        sent_at: direction === "outbound" ? event.message.timestamp : null,
        received_at: direction === "inbound" ? event.message.timestamp : null,
      };

      // Upsert by evolution_message_id so retries are idempotent.
      const { error: upsertErr } = await admin
        .from("whatsapp_messages")
        .upsert(row, { onConflict: "evolution_message_id" });
      if (upsertErr) {
        // eslint-disable-next-line no-console
        console.error("[whatsapp.webhook] upsert msg failed:", upsertErr.message);
      }

      await admin
        .from("whatsapp_instances")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", inst.id);
      return;
    }

    case "MESSAGES_UPDATE": {
      const { error: updErr } = await admin
        .from("whatsapp_messages")
        .update({ status: event.status })
        .eq("evolution_message_id", event.evolutionMessageId)
        .eq("workspace_id", inst.workspace_id);
      if (updErr) {
        // eslint-disable-next-line no-console
        console.error("[whatsapp.webhook] update status failed:", updErr.message);
      }
      return;
    }

    case "CONNECTION_UPDATE": {
      const patch: Record<string, unknown> = { status: event.status };
      if (event.phoneNumber) patch.phone_number = event.phoneNumber;
      if (event.status === "connected" && !inst.paired_at) {
        patch.paired_at = new Date().toISOString();
        patch.qr_code = null;
      }
      patch.last_seen_at = new Date().toISOString();
      const { error: connErr } = await admin
        .from("whatsapp_instances")
        .update(patch)
        .eq("id", inst.id);
      if (connErr) {
        // eslint-disable-next-line no-console
        console.error(
          "[whatsapp.webhook] connection_update failed:",
          connErr.message,
        );
      }
      return;
    }

    case "QRCODE_UPDATED": {
      const { error: qrErr } = await admin
        .from("whatsapp_instances")
        .update({
          qr_code: event.qrCode || null,
          status: event.qrCode ? "qr_pending" : inst.status,
        })
        .eq("id", inst.id);
      if (qrErr) {
        // eslint-disable-next-line no-console
        console.error("[whatsapp.webhook] qr_update failed:", qrErr.message);
      }
      return;
    }

    case "UNKNOWN":
    default:
      // No-op. The event was acked 200 and parsed but we don't model it.
      return;
  }
}

/**
 * Find a CRM contact by phone or auto-create a minimal one.
 * Service-role client is used because the webhook has no session.
 */
async function findOrCreateContact(
  workspaceId: string,
  phone: string,
): Promise<string | null> {
  if (!phone) return null;
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error } = await admin
    .from("crm_contacts")
    .insert({
      workspace_id: workspaceId,
      phone,
      first_name: null,
      last_name: null,
      // CRM defaults to public; WhatsApp imports stay public so the
      // shop owner's team can read the thread.
      visibility: "public",
      notes: "Auto-created from inbound WhatsApp message",
    })
    .select("id")
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.webhook] auto-create contact failed:",
      error.message,
    );
    return null;
  }

  return (inserted as { id: string }).id;
}
