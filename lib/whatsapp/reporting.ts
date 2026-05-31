import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { isInsideBusinessHours } from "./automation";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * lib/whatsapp/reporting.ts — append-only analytics events (EPIC-15).
 *
 * The reporting model is "emit, don't compute": every meaningful lifecycle
 * moment writes one row to whatsapp_reporting_events; dashboards aggregate
 * over that single table (via the whatsapp_analytics_* RPCs). All emitters are
 * best-effort and NEVER throw — they're called from the webhook / send /
 * lifecycle hot paths and must not break ingestion or a reply.
 *
 * Events:
 *   conversation_created    — a brand-new conversation row appeared
 *   first_response          — first OUTBOUND after the conversation's first
 *                             inbound; value = seconds to first response
 *   reply_time              — an outbound reply; value = seconds since the last
 *                             inbound (rolling responsiveness)
 *   conversation_resolved   — status set to resolved; value = seconds open
 *   conversation_reopened   — a resolved/snoozed convo got a new inbound
 */

export type ReportingEventName =
  | "conversation_created"
  | "first_response"
  | "reply_time"
  | "conversation_resolved"
  | "conversation_reopened";

interface EmitInput {
  workspaceId: string;
  eventName: ReportingEventName;
  value?: number | null;
  valueInBusinessHours?: number | null;
  conversationId?: string | null;
  contactId?: string | null;
  userId?: string | null;
  instanceId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

/** Low-level emit. Best-effort; swallows + logs errors. */
export async function emitReportingEvent(
  admin: Admin,
  input: EmitInput,
): Promise<void> {
  try {
    await admin.from("whatsapp_reporting_events").insert({
      workspace_id: input.workspaceId,
      event_name: input.eventName,
      value: input.value ?? null,
      value_in_business_hours: input.valueInBusinessHours ?? null,
      conversation_id: input.conversationId ?? null,
      contact_id: input.contactId ?? null,
      user_id: input.userId ?? null,
      instance_id: input.instanceId ?? null,
      started_at: input.startedAt ?? null,
      ended_at: input.endedAt ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.reporting] emit failed:",
      input.eventName,
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** conversation_created — call once when a conversation row is first inserted. */
export async function emitConversationCreated(
  admin: Admin,
  params: {
    workspaceId: string;
    conversationId: string;
    contactId?: string | null;
    instanceId?: string | null;
  },
): Promise<void> {
  await emitReportingEvent(admin, {
    workspaceId: params.workspaceId,
    eventName: "conversation_created",
    conversationId: params.conversationId,
    contactId: params.contactId ?? null,
    instanceId: params.instanceId ?? null,
    startedAt: new Date().toISOString(),
  });
}

/**
 * Emit response-time events on an OUTBOUND message. Computes:
 *   - reply_time: seconds since the most recent INBOUND that has no later
 *     outbound (i.e. the customer was waiting).
 *   - first_response: additionally, when the conversation has no prior
 *     outbound at all and value = seconds since its first inbound.
 *
 * Reads the conversation's first_reply_at / created_at and the last inbound
 * timestamp from whatsapp_messages. All best-effort.
 */
export async function emitOutboundResponseEvents(
  admin: Admin,
  params: {
    workspaceId: string;
    conversationId: string;
    contactId?: string | null;
    instanceId?: string | null;
    userId?: string | null;
    sentAt: string;
  },
): Promise<void> {
  try {
    const sentMs = new Date(params.sentAt).getTime();

    // Most recent inbound before this outbound (the message we're answering).
    const { data: lastIn } = await admin
      .from("whatsapp_messages")
      .select("received_at, created_at")
      .eq("conversation_id", params.conversationId)
      .eq("direction", "inbound")
      .lt("created_at", params.sentAt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastInRow = lastIn as
      | { received_at: string | null; created_at: string }
      | null;
    const lastInIso = lastInRow?.received_at ?? lastInRow?.created_at ?? null;

    // Was there any prior outbound? (determines first_response)
    const { count: priorOutCount } = await admin
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", params.conversationId)
      .eq("direction", "outbound")
      .eq("is_private", false)
      .lt("created_at", params.sentAt);

    const businessHours = await loadBusinessHours(admin, params.workspaceId);
    const inside = isInsideBusinessHours(businessHours);

    if (lastInIso) {
      const seconds = Math.max(
        0,
        Math.round((sentMs - new Date(lastInIso).getTime()) / 1000),
      );
      await emitReportingEvent(admin, {
        workspaceId: params.workspaceId,
        eventName: "reply_time",
        value: seconds,
        valueInBusinessHours: inside ? seconds : null,
        conversationId: params.conversationId,
        contactId: params.contactId ?? null,
        instanceId: params.instanceId ?? null,
        userId: params.userId ?? null,
        startedAt: lastInIso,
        endedAt: params.sentAt,
      });

      // first_response: no prior outbound AND we have an inbound to measure from.
      if ((priorOutCount ?? 0) === 0) {
        // Measure from the conversation's FIRST inbound for first-response time.
        const { data: firstIn } = await admin
          .from("whatsapp_messages")
          .select("received_at, created_at")
          .eq("conversation_id", params.conversationId)
          .eq("direction", "inbound")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const firstInRow = firstIn as
          | { received_at: string | null; created_at: string }
          | null;
        const firstInIso =
          firstInRow?.received_at ?? firstInRow?.created_at ?? lastInIso;
        const frtSeconds = Math.max(
          0,
          Math.round((sentMs - new Date(firstInIso).getTime()) / 1000),
        );
        await emitReportingEvent(admin, {
          workspaceId: params.workspaceId,
          eventName: "first_response",
          value: frtSeconds,
          valueInBusinessHours: inside ? frtSeconds : null,
          conversationId: params.conversationId,
          contactId: params.contactId ?? null,
          instanceId: params.instanceId ?? null,
          userId: params.userId ?? null,
          startedAt: firstInIso,
          endedAt: params.sentAt,
        });
        // Stamp first_reply_at on the conversation if not already set.
        await admin
          .from("whatsapp_conversations")
          .update({ first_reply_at: params.sentAt })
          .eq("id", params.conversationId)
          .is("first_reply_at", null);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.reporting] outbound response emit failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** conversation_resolved — value = seconds the conversation was open. */
export async function emitConversationResolved(
  admin: Admin,
  params: {
    workspaceId: string;
    conversationId: string;
    contactId?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("whatsapp_conversations")
      .select("created_at, instance_id")
      .eq("id", params.conversationId)
      .maybeSingle();
    const createdAt = (conv as { created_at: string } | null)?.created_at;
    const instanceId = (conv as { instance_id: string } | null)?.instance_id;
    const now = Date.now();
    const seconds = createdAt
      ? Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 1000))
      : null;
    await emitReportingEvent(admin, {
      workspaceId: params.workspaceId,
      eventName: "conversation_resolved",
      value: seconds,
      conversationId: params.conversationId,
      contactId: params.contactId ?? null,
      instanceId: instanceId ?? null,
      userId: params.userId ?? null,
      startedAt: createdAt ?? null,
      endedAt: new Date().toISOString(),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.reporting] resolved emit failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** conversation_reopened — a resolved/snoozed convo received a new inbound. */
export async function emitConversationReopened(
  admin: Admin,
  params: {
    workspaceId: string;
    conversationId: string;
    contactId?: string | null;
    instanceId?: string | null;
  },
): Promise<void> {
  await emitReportingEvent(admin, {
    workspaceId: params.workspaceId,
    eventName: "conversation_reopened",
    conversationId: params.conversationId,
    contactId: params.contactId ?? null,
    instanceId: params.instanceId ?? null,
    startedAt: new Date().toISOString(),
  });
}

interface BusinessHours {
  timezone: string;
  weekly: Record<string, Array<{ open: string; close: string }>>;
  holidays: string[];
  away_message: string | null;
  welcome_message: string | null;
}

async function loadBusinessHours(
  admin: Admin,
  workspaceId: string,
): Promise<BusinessHours | null> {
  try {
    const { data } = await admin
      .from("whatsapp_business_hours")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    return (data as BusinessHours | null) ?? null;
  } catch {
    return null;
  }
}
