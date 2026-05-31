import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-broadcast analytics + actions (EPIC-08).
 *
 * GET  /api/whatsapp/broadcasts/[id]?workspace_id=
 *   → { broadcast, analytics: { sent, delivered, read, replied, failed, pending },
 *       recipients: [{ to_number, contact_name, status, replied, sent_at }] }
 *   Per-recipient status comes from whatsapp_send_log; delivered/read derive
 *   from the matching whatsapp_messages ACK status (read path fixed in Wave 1);
 *   'replied' = an inbound message from that number AFTER the broadcast send.
 *
 * PATCH /api/whatsapp/broadcasts/[id]   { workspace_id, action }
 *   action: 'pause' | 'resume' | 'cancel' | 'resend_failed'
 *   - resend_failed re-queues the job after clearing failed send_log rows so
 *     the idempotent runner retries only the failures.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id } = await ctx.params;
  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from("whatsapp_send_jobs")
    .select(
      "id, title, kind, status, segment_id, list_id, message_template, personalization_template, media_storage_path, scheduled_for, recurrence, total_contacts, sent_count, failed_count, error_message, started_at, completed_at, created_at",
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!job) return jsonError("not_found", 404);

  // Per-recipient log rows (the source of truth for who we sent to).
  const { data: logs } = await admin
    .from("whatsapp_send_log")
    .select("id, to_number, contact_id, body, status, evolution_message_id, sent_at")
    .eq("job_id", id)
    .order("sent_at", { ascending: false })
    .limit(2000);
  const logRows = (logs ?? []) as Array<{
    id: string;
    to_number: string | null;
    contact_id: string | null;
    status: string;
    evolution_message_id: string | null;
    sent_at: string | null;
  }>;

  // Delivered/read: look up the matching whatsapp_messages ACK status by
  // evolution_message_id (batched).
  const evoIds = logRows
    .map((l) => l.evolution_message_id)
    .filter((x): x is string => !!x);
  const ackById = new Map<string, string>();
  if (evoIds.length > 0) {
    const { data: msgs } = await admin
      .from("whatsapp_messages")
      .select("evolution_message_id, status")
      .eq("workspace_id", workspaceId)
      .in("evolution_message_id", evoIds);
    for (const m of msgs ?? []) {
      const row = m as { evolution_message_id: string | null; status: string };
      if (row.evolution_message_id) ackById.set(row.evolution_message_id, row.status);
    }
  }

  // 'replied': an inbound message from the recipient AFTER the send timestamp.
  // Resolved per distinct number with a single batched query bounded to the
  // broadcast's send window.
  const jobStart =
    (job as { started_at: string | null }).started_at ??
    (job as { created_at: string }).created_at;
  const numbers = Array.from(
    new Set(logRows.map((l) => l.to_number).filter((x): x is string => !!x)),
  );
  const repliedSet = new Set<string>();
  if (numbers.length > 0 && jobStart) {
    const { data: inbound } = await admin
      .from("whatsapp_messages")
      .select("from_number")
      .eq("workspace_id", workspaceId)
      .eq("direction", "inbound")
      .gte("created_at", jobStart)
      .in("from_number", numbers);
    for (const m of inbound ?? []) {
      const fn = (m as { from_number: string | null }).from_number;
      if (fn) repliedSet.add(fn);
    }
  }

  // Contact names (batched).
  const contactIds = Array.from(
    new Set(logRows.map((l) => l.contact_id).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name, phone")
      .eq("workspace_id", workspaceId)
      .in("id", contactIds);
    for (const c of contacts ?? []) {
      const row = c as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
      };
      nameById.set(
        row.id,
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
          row.phone ||
          row.id.slice(0, 8),
      );
    }
  }

  let delivered = 0;
  let read = 0;
  let failed = 0;
  let sent = 0;
  let replied = 0;
  const recipients = logRows.map((l) => {
    const ack = l.evolution_message_id ? ackById.get(l.evolution_message_id) : null;
    const isReplied = l.to_number ? repliedSet.has(l.to_number) : false;
    // Effective status: failed > read > delivered > sent.
    let status = l.status;
    if (l.status === "failed") {
      failed++;
      status = "failed";
    } else {
      sent++;
      if (ack === "read") {
        read++;
        delivered++;
        status = "read";
      } else if (ack === "delivered") {
        delivered++;
        status = "delivered";
      } else {
        status = "sent";
      }
    }
    if (isReplied) replied++;
    return {
      id: l.id,
      to_number: l.to_number,
      contact_name: l.contact_id ? nameById.get(l.contact_id) ?? null : null,
      status,
      replied: isReplied,
      sent_at: l.sent_at,
    };
  });

  const total = (job as { total_contacts: number }).total_contacts ?? logRows.length;
  const pending = Math.max(0, total - sent - failed);

  return NextResponse.json({
    broadcast: job,
    analytics: { sent, delivered, read, replied, failed, pending, total },
    recipients,
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id } = await ctx.params;
  const parsed = await readJson<{ workspace_id?: string; action?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, action } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);
  if (!action) return jsonError("action required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("whatsapp_send_jobs")
    .select("id, status")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!job) return jsonError("not_found", 404);

  const patch: Record<string, unknown> = {};
  switch (action) {
    case "pause":
      patch.status = "paused";
      break;
    case "resume":
      patch.status = "queued";
      break;
    case "cancel":
      patch.status = "cancelled";
      patch.completed_at = new Date().toISOString();
      break;
    case "resend_failed": {
      // Delete the failed log rows so the idempotent runner re-attempts only
      // those numbers, then re-queue the job.
      await admin
        .from("whatsapp_send_log")
        .delete()
        .eq("job_id", id)
        .eq("status", "failed");
      patch.status = "queued";
      patch.failed_count = 0;
      patch.completed_at = null;
      break;
    }
    default:
      return jsonError("invalid action", 400);
  }

  const { data: updated, error } = await admin
    .from("whatsapp_send_jobs")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, status, sent_count, failed_count, total_contacts")
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: updated });
}
