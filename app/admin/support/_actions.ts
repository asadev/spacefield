"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  endImpersonation as endImpersonationLib,
  startImpersonation as startImpersonationLib,
} from "@/lib/impersonate";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { SupportTicketRow } from "../_types";
import { parsePriority, parseStatus } from "./_helpers";

/**
 * Server actions for /admin/support and /admin/support/[id].
 *
 *   updateTicketStatus    → patch status (audit support.status_update)
 *   setTicketPriority     → patch priority (audit support.priority_set)
 *   assignTicket          → patch assigned_to (audit support.assign)
 *   postReply             → public reply, bumps last_response_at
 *   postInternalNote      → admin-only note
 *   startImpersonation    → spin up impersonation_sessions row
 *   endImpersonation      → close an impersonation_sessions row
 *
 * Every action: assertAdmin() + recordAdminAction(...).
 */

async function fetchTicket(id: string): Promise<SupportTicketRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as SupportTicketRow | null) ?? null;
}

function revalidateTicket(id: string): void {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${id}`);
}

/* ─────────────────── status / priority / assign ─────────────────── */

export async function updateTicketStatus(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const next = parseStatus(formData.get("status"));

  const before = await fetchTicket(id);
  if (!before) throw new Error("ticket not found");

  // resolved_at flips on/off when entering/leaving the resolved state.
  const patch: {
    status: typeof next;
    resolved_at: string | null;
    updated_at: string;
  } = {
    status: next,
    resolved_at:
      next === "resolved"
        ? before.resolved_at ?? new Date().toISOString()
        : next === "closed"
          ? before.resolved_at ?? new Date().toISOString()
          : null,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_tickets")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "support.status_update",
    targetType: "support_tickets",
    targetId: id,
    before: { status: before.status, resolved_at: before.resolved_at },
    after: { status: patch.status, resolved_at: patch.resolved_at },
  });

  revalidateTicket(id);
}

export async function setTicketPriority(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const next = parsePriority(formData.get("priority"));

  const before = await fetchTicket(id);
  if (!before) throw new Error("ticket not found");

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_tickets")
    .update({ priority: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "support.priority_set",
    targetType: "support_tickets",
    targetId: id,
    before: { priority: before.priority },
    after: { priority: next },
  });

  revalidateTicket(id);
}

export async function assignTicket(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  // assigned_to is a uuid (auth.users.id). Empty string means unassign.
  const raw = String(formData.get("assigned_to") ?? "").trim();
  const next: string | null = raw === "" ? null : raw;

  const before = await fetchTicket(id);
  if (!before) throw new Error("ticket not found");

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_tickets")
    .update({ assigned_to: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "support.assign",
    targetType: "support_tickets",
    targetId: id,
    before: { assigned_to: before.assigned_to },
    after: { assigned_to: next },
  });

  revalidateTicket(id);
}

/* ─────────────────── conversation: reply / note ─────────────────── */

async function insertSupportMessage(
  ticketId: string,
  authorId: string,
  body: string,
  internal: boolean
): Promise<{ id: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_messages")
    .insert({
      ticket_id: ticketId,
      author_id: authorId,
      is_admin: true,
      body,
      internal_note: internal,
      attachments: [],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return data as { id: string };
}

export async function postReply(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id) throw new Error("missing ticket id");
  if (!body) throw new Error("reply body required");

  const before = await fetchTicket(id);
  if (!before) throw new Error("ticket not found");

  const inserted = await insertSupportMessage(id, auth.userId, body, false);

  // Public reply bumps last_response_at and (if waiting on us) flips to
  // waiting_user. If it was already resolved/closed, leave the status
  // alone — the admin's intent was just to add a follow-up note.
  const now = new Date().toISOString();
  const nextStatus =
    before.status === "open" || before.status === "in_progress"
      ? "waiting_user"
      : before.status;

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_tickets")
    .update({
      last_response_at: now,
      status: nextStatus,
      updated_at: now,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "support.reply",
    targetType: "support_tickets",
    targetId: id,
    before: {
      status: before.status,
      last_response_at: before.last_response_at,
    },
    after: {
      message_id: inserted.id,
      status: nextStatus,
      last_response_at: now,
      excerpt: body.slice(0, 240),
    },
  });

  revalidateTicket(id);
}

export async function postInternalNote(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id) throw new Error("missing ticket id");
  if (!body) throw new Error("note body required");

  const before = await fetchTicket(id);
  if (!before) throw new Error("ticket not found");

  const inserted = await insertSupportMessage(id, auth.userId, body, true);

  // Internal notes don't bump last_response_at — that's a customer-facing
  // signal. Just touch updated_at.
  const admin = createAdminClient();
  await admin
    .from("support_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  await recordAdminAction({
    action: "support.internal_note",
    targetType: "support_tickets",
    targetId: id,
    after: {
      message_id: inserted.id,
      excerpt: body.slice(0, 240),
    },
  });

  revalidateTicket(id);
}

/* ─────────────────── impersonation ─────────────────── */

export async function startImpersonation(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const targetUserId = String(formData.get("target_user_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const ticketId = String(formData.get("ticket_id") ?? "").trim();
  if (!targetUserId) throw new Error("missing target_user_id");
  if (!reason) throw new Error("impersonation reason required");

  await startImpersonationLib(auth.userId, targetUserId, reason);

  if (ticketId) {
    revalidatePath(`/admin/support/${ticketId}`);
  }
  revalidatePath("/admin/support/impersonations");
}

export async function endImpersonation(formData: FormData): Promise<void> {
  await assertAdmin();
  const sessionId = String(formData.get("id") ?? "").trim();
  if (!sessionId) throw new Error("missing impersonation id");

  await endImpersonationLib(sessionId);

  revalidatePath("/admin/support/impersonations");
}
