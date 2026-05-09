import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WebhookEndpointRow } from "../_types";

/* Server-only helpers for the webhooks admin pages. No constants — those
 * live in `_constants.ts`; no async exports beyond what's needed for the
 * pages. Kept out of `_actions.ts` because that file is `"use server"`
 * and cannot export non-async helpers. */

export async function fetchEndpoint(
  id: string
): Promise<WebhookEndpointRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("webhook_endpoints")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as WebhookEndpointRow | null) ?? null;
}

/** A safe-ish, deterministic sample payload for the "Test send" button.
 * Mirrors the shape real emitters will use: stable event name, server
 * timestamp injected by the signer, and an `endpoint_id` pointer so the
 * receiver can identify which endpoint sent it. */
export function buildSamplePayload(
  endpoint: WebhookEndpointRow,
  event: string
): Record<string, unknown> {
  return {
    test: true,
    endpoint_id: endpoint.id,
    workspace_id: endpoint.workspace_id,
    sample: sampleForEvent(event),
  };
}

function sampleForEvent(event: string): Record<string, unknown> {
  switch (event) {
    case "form.submitted":
      return {
        form_id: "00000000-0000-0000-0000-000000000000",
        submission_id: "00000000-0000-0000-0000-000000000001",
        fields: { email: "test@example.com", name: "Sample" },
      };
    case "form.spam":
      return { form_id: "00000000-0000-0000-0000-000000000000", reason: "test" };
    case "quote.accepted":
      return { quote_id: "Q-TEST", amount: 1234, currency: "USD" };
    case "booking.created":
    case "booking.cancelled":
      return {
        booking_id: "B-TEST",
        starts_at: new Date().toISOString(),
        attendee_email: "test@example.com",
      };
    case "file.shared":
      return { file_id: "F-TEST", url: "https://example.com/file" };
    case "agent.run":
    case "agent.error":
      return { agent_id: "test-agent", run_id: "R-TEST" };
    case "signin":
    case "signup":
      return { user_id: "U-TEST", email: "test@example.com" };
    case "subscription.changed":
      return { user_id: "U-TEST", tier: "pro", previous_tier: "free" };
    case "workspace.created":
    case "workspace.paused":
      return { workspace_id: "W-TEST", name: "Test workspace" };
    default:
      return { note: "test payload — no specific shape registered for this event" };
  }
}
