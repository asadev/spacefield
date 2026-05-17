"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  deliverWithRetry,
  generateWebhookSecret,
} from "@/lib/webhooks/sign";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { WebhookEndpointRow } from "../_types";
import { WEBHOOK_EVENTS } from "./_constants";
import { buildSamplePayload, fetchEndpoint } from "./_helpers";

/* Server actions for /admin/webhooks.
 *
 * Every action calls assertAdmin() at the top and writes an audit row
 * (verb prefix `webhook.`). After mutations we revalidate the index +
 * the per-endpoint page so navigation reflects the new state.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** When testEndpoint succeeds, the http status of the receiver. */
  httpStatus?: number | null;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

function normalizeEvents(input: FormDataEntryValue[]): string[] {
  const allowed = new Set<string>(WEBHOOK_EVENTS);
  const out: string[] = [];
  for (const v of input) {
    const s = String(v ?? "").trim();
    if (s && allowed.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function normalizeWorkspaceId(raw: string): string | null {
  const s = raw.trim();
  if (!s || s === "__global__") return null;
  return s;
}

function revalidateAll(id?: string): void {
  revalidatePath("/admin/webhooks");
  if (id) revalidatePath(`/admin/webhooks/${id}`);
}

/* ──────────────────── create ──────────────────── */

export async function createEndpoint(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();
    const workspaceId = normalizeWorkspaceId(
      String(formData.get("workspace_id") ?? "")
    );
    const events = normalizeEvents(formData.getAll("events"));
    const enabled = String(formData.get("enabled") ?? "on") !== "off";
    const maxRetries = Math.max(
      0,
      Math.min(
        10,
        Number.parseInt(String(formData.get("max_retries") ?? "3"), 10) || 3
      )
    );

    if (!name) return { ok: false, error: "name is required" };
    if (!url || !URL_RE.test(url)) {
      return { ok: false, error: "invalid url (must start with http:// or https://)" };
    }
    if (events.length === 0) {
      return { ok: false, error: "select at least one event" };
    }

    const admin = createAdminClient();
    const { data: inserted, error } = await admin
      .from("webhook_endpoints")
      .insert({
        workspace_id: workspaceId,
        name,
        url,
        events,
        enabled,
        max_retries: maxRetries,
        secret: generateWebhookSecret(),
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };

    const row = inserted as WebhookEndpointRow;
    await recordAdminAction({
      action: "webhook.create",
      targetType: "webhook_endpoint",
      targetId: row.id,
      after: { ...row, secret: "***" },
      metadata: { workspace_id: workspaceId, events },
    });

    revalidateAll();
    return { ok: true, message: "Endpoint created" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ──────────────────── update ──────────────────── */

export async function updateEndpoint(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "missing id" };

    const before = await fetchEndpoint(id);
    if (!before) return { ok: false, error: "endpoint not found" };

    const name = String(formData.get("name") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();
    const events = normalizeEvents(formData.getAll("events"));
    const enabled = String(formData.get("enabled") ?? "off") === "on";
    const maxRetries = Math.max(
      0,
      Math.min(
        10,
        Number.parseInt(String(formData.get("max_retries") ?? "3"), 10) || 3
      )
    );

    if (!name) return { ok: false, error: "name is required" };
    if (!url || !URL_RE.test(url)) {
      return { ok: false, error: "invalid url" };
    }
    if (events.length === 0) {
      return { ok: false, error: "select at least one event" };
    }

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("webhook_endpoints")
      .update({
        name,
        url,
        events,
        enabled,
        max_retries: maxRetries,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      action: "webhook.update",
      targetType: "webhook_endpoint",
      targetId: id,
      before: { ...before, secret: "***" },
      after: { ...(updated as WebhookEndpointRow), secret: "***" },
    });

    revalidateAll(id);
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ──────────────────── enabled toggle (per-row on the index) ──────────────────── */

export async function setEndpointEnabled(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "missing id" };
    const enabled = String(formData.get("enabled") ?? "on") === "on";

    const before = await fetchEndpoint(id);
    if (!before) return { ok: false, error: "endpoint not found" };

    const admin = createAdminClient();
    const { error } = await admin
      .from("webhook_endpoints")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      action: enabled ? "webhook.enable" : "webhook.disable",
      targetType: "webhook_endpoint",
      targetId: id,
      before: { enabled: before.enabled },
      after: { enabled },
    });

    revalidateAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ──────────────────── delete ──────────────────── */

export async function deleteEndpoint(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "missing id" };

    const before = await fetchEndpoint(id);
    if (!before) return { ok: false, error: "endpoint not found" };

    const admin = createAdminClient();
    const { error } = await admin
      .from("webhook_endpoints")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      action: "webhook.delete",
      targetType: "webhook_endpoint",
      targetId: id,
      before: { ...before, secret: "***" },
    });

    revalidateAll();
    return { ok: true, message: "Endpoint deleted" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ──────────────────── rotate secret ──────────────────── */

export async function rotateSecret(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "missing id" };

    const before = await fetchEndpoint(id);
    if (!before) return { ok: false, error: "endpoint not found" };

    const newSecret = generateWebhookSecret();
    const admin = createAdminClient();
    const { error } = await admin
      .from("webhook_endpoints")
      .update({ secret: newSecret, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      action: "webhook.rotate_secret",
      targetType: "webhook_endpoint",
      targetId: id,
      // Don't log the secret in either before or after.
      metadata: { rotated_at: new Date().toISOString() },
    });

    revalidateAll(id);
    return { ok: true, message: "Secret rotated" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ──────────────────── test send ──────────────────── */

export async function testEndpoint(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "missing id" };

    const ep = await fetchEndpoint(id);
    if (!ep) return { ok: false, error: "endpoint not found" };

    // Use the explicitly-selected event if provided, else first subscribed
    // event, else a generic placeholder.
    const requested = String(formData.get("event") ?? "").trim();
    const event =
      requested && (WEBHOOK_EVENTS as readonly string[]).includes(requested)
        ? requested
        : ep.events[0] ?? "agent.run";

    const payload = buildSamplePayload(ep, event);

    // Use the retry wrapper in async mode so the admin "test send"
    // attempt persists a `retry_scheduled` row on transient failure
    // and the retry worker takes over. For a clean success or a
    // non-retryable 4xx the wrapper logs a `final` row directly and
    // we return immediately.
    const result = await deliverWithRetry({
      endpointId: ep.id,
      url: ep.url,
      event,
      body: payload,
      secret: ep.secret,
      maxRetries: ep.max_retries,
      mode: "async",
      metadata: { triggered_by: "test" },
    });

    const admin = createAdminClient();

    // Touch last_delivery_* on the endpoint so the index reflects the
    // most recent attempt status (success / retry_scheduled / exhausted /
    // non-retryable failure).
    await admin
      .from("webhook_endpoints")
      .update({
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: result.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await recordAdminAction({
      action: "webhook.test_send",
      targetType: "webhook_endpoint",
      targetId: id,
      metadata: {
        event,
        status: result.status,
        http_status: result.httpStatus,
        attempts: result.attempts,
        delivery_group: result.deliveryGroup,
      },
    });

    revalidateAll(id);

    if (result.status === "success") {
      return {
        ok: true,
        message: `Sent · ${result.httpStatus} in ${result.attempts} attempt(s)`,
        httpStatus: result.httpStatus,
      };
    }
    if (result.status === "retry_scheduled") {
      return {
        ok: true,
        message: `Receiver returned ${result.httpStatus ?? result.status} on attempt ${result.attempts} — retry scheduled.`,
        httpStatus: result.httpStatus,
      };
    }
    if (result.status === "exhausted") {
      return {
        ok: false,
        error: `Exhausted retries (${result.attempts}) — last status ${result.httpStatus ?? "n/a"}.`,
        httpStatus: result.httpStatus,
      };
    }
    return {
      ok: false,
      error:
        result.status === "timeout"
          ? `Timed out`
          : result.status === "non_2xx"
            ? `Receiver returned ${result.httpStatus ?? "non-2xx"}`
            : `Network error (${result.status})`,
      httpStatus: result.httpStatus,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
