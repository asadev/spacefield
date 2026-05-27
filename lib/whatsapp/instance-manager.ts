import "server-only";

import { createHmac } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "./client";
import type { WhatsAppInstanceRow } from "./types";

/**
 * High-level instance lifecycle helpers. The HTTP routes are thin
 * wrappers around these so the same code is reusable from cron / agent
 * tool / future Slack-style commands.
 */

const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
];

function origin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.SITE_URL ??
    "https://spacefield.co"
  ).replace(/\/$/, "");
}

function webhookSecret(): string {
  // Reuse CRON_SECRET when WHATSAPP_WEBHOOK_SECRET isn't set explicitly.
  // The webhook route validates against the same env name in either
  // priority order.
  const v =
    process.env.WHATSAPP_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    "";
  if (!v) {
    throw new Error(
      "[whatsapp.instance-manager] WHATSAPP_WEBHOOK_SECRET (or CRON_SECRET) must be set",
    );
  }
  return v;
}

/** HMAC-SHA256 over `instanceName` keyed with the webhook secret. */
export function signInstanceWebhook(instanceName: string): string {
  return createHmac("sha256", webhookSecret())
    .update(instanceName)
    .digest("hex");
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 8);
}

function buildInstanceName(workspaceId: string): string {
  return `ws_${workspaceId.replace(/-/g, "")}_${shortRandom()}`;
}

function buildWebhookUrl(instanceName: string): string {
  const u = new URL(`${origin()}/api/whatsapp/webhook`);
  u.searchParams.set("instance", instanceName);
  u.searchParams.set("secret", signInstanceWebhook(instanceName));
  return u.toString();
}

/**
 * Return the workspace's primary instance row, creating + provisioning
 * a new Evolution instance + webhook if none exists. Idempotent.
 */
export async function ensureWorkspaceInstance(
  workspaceId: string,
  opts?: { createdBy?: string | null },
): Promise<WhatsAppInstanceRow> {
  const admin = createAdminClient();

  // Reuse only actively-usable instances. Exclude disconnected too —
  // a "disconnected" row is one where Evolution no longer has the
  // instance (LOGOUT/REMOVED), so reusing it returns qr_code=null
  // forever and the UI spins on "waiting for QR..." indefinitely.
  // When user clicks Start Pairing on a disconnected state, they want
  // a fresh instance on Evolution — not the dead row. (2026-05-27:
  // caught this after upgrading Evolution v2.1.1→v2.3.7, the upgrade
  // fixed QR generation but pre-existing disconnected rows kept
  // shadowing fresh creates.)
  const { data: existing } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "qr_pending", "connected"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as WhatsAppInstanceRow;
  }

  // Mark any older non-reusable rows as superseded so we don't pile up
  // zombie rows across reconnect attempts. (Idempotent — best-effort.)
  await admin
    .from("whatsapp_instances")
    .update({ status: "error", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in("status", ["disconnected"]);

  const instanceName = buildInstanceName(workspaceId);
  const client = getEvolutionClient();
  const created = await client.createInstance(instanceName);

  // Wire the webhook BEFORE returning so QR / connection events flow.
  // Hard-fail on webhook bind error: without it, the instance is
  // useless from Spacefield's perspective (no QR-rotation events, no
  // pair confirmation, no inbound messages). Old code swallowed the
  // error silently which is how a busted setWebhook body shape went
  // unnoticed for weeks. (2026-05-27 fix.) On failure we delete the
  // Evolution instance to keep state consistent and surface the
  // error to the caller so the UI can retry.
  try {
    await client.setWebhook(
      instanceName,
      buildWebhookUrl(instanceName),
      WEBHOOK_EVENTS,
    );
  } catch (e) {
    try {
      await client.deleteInstance(instanceName);
    } catch {
      /* best-effort cleanup */
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `[whatsapp.instance-manager] setWebhook failed for ${instanceName}: ${msg}`,
    );
  }

  const initialStatus =
    created.status === "open" || created.status === "connected"
      ? "connected"
      : created.qr
        ? "qr_pending"
        : "pending";

  const { data: row, error } = await admin
    .from("whatsapp_instances")
    .insert({
      workspace_id: workspaceId,
      evolution_instance_name: instanceName,
      status: initialStatus,
      qr_code: created.qr,
      created_by: opts?.createdBy ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // Best-effort rollback so Evolution doesn't leak orphan instances.
    try {
      await client.deleteInstance(instanceName);
    } catch {
      /* ignore secondary failure */
    }
    throw new Error(
      `[whatsapp.instance-manager] insert failed: ${error.message}`,
    );
  }

  return row as WhatsAppInstanceRow;
}

/**
 * Re-fetch the QR for an instance from Evolution. Persists the new QR
 * back to the row. Returns null when the instance is already paired.
 */
export async function refreshQR(instanceId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("id", instanceId)
    .maybeSingle();
  if (error || !row) {
    throw new Error(
      `[whatsapp.instance-manager] refreshQR: instance ${instanceId} not found`,
    );
  }

  const client = getEvolutionClient();
  const instanceName = (row as WhatsAppInstanceRow).evolution_instance_name;
  const state = await client.getInstanceStatus(instanceName).catch(() => null);

  if (state === "open" || state === "connected") {
    await admin
      .from("whatsapp_instances")
      .update({ status: "connected", qr_code: null })
      .eq("id", instanceId);
    return null;
  }

  const qr = await client.getQR(instanceName);
  await admin
    .from("whatsapp_instances")
    .update({
      qr_code: qr,
      status: qr ? "qr_pending" : "pending",
    })
    .eq("id", instanceId);

  return qr;
}

/** Disconnect + mark row disconnected; leaves the row in place. */
export async function disconnectInstance(instanceId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("whatsapp_instances")
    .select("evolution_instance_name")
    .eq("id", instanceId)
    .maybeSingle();

  if (!row) return;

  const instanceName = (row as { evolution_instance_name: string })
    .evolution_instance_name;

  const client = getEvolutionClient();
  try {
    await client.deleteInstance(instanceName);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.instance-manager] evolution delete failed:",
      e,
    );
  }

  await admin
    .from("whatsapp_instances")
    .update({ status: "disconnected", qr_code: null })
    .eq("id", instanceId);
}
