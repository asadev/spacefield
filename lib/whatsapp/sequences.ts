import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  executeActions,
  type ActionContext,
  type WhatsAppAction,
} from "./actions";
import type { PersonalizeContact } from "./personalize";
import type { WhatsAppInstanceRow } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Drip-sequence runtime (Wave 5, EPIC-19). A cron claims due enrollments
 * (claim_due_enrollments RPC) and this advances each one step-by-step through
 * the SHARED action executor (lib/whatsapp/actions.ts). Because every send goes
 * through that executor, each step automatically respects the throttle,
 * isSuppressed() (consent, fail-closed) AND the soft-ban pause — no parallel
 * send path. Exit-on-reply + consent are additionally checked here before each
 * step so we stop the moment the customer engages or opts out.
 *
 * steps jsonb shape: [{ delay_minutes:int, actions: WhatsAppAction[] }]
 *   step 0 fires at enrollment; each subsequent step is scheduled
 *   delay_minutes after the previous step ran.
 * exit_conditions jsonb: { on_reply?: boolean }  (default on_reply=true)
 */

export interface SequenceStep {
  delay_minutes?: number;
  actions?: WhatsAppAction[];
}

export interface SequenceEnrollment {
  id: string;
  workspace_id: string;
  sequence_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  instance_id: string | null;
  remote_jid: string | null;
  current_step: number;
  status: string;
  next_run_at: string | null;
  enrolled_at: string;
}

const ACTORLESS = null;

/** Claim up to `limit` due enrollments atomically (skip-locked). */
export async function claimDueEnrollments(
  admin: Admin,
  limit = 25,
): Promise<SequenceEnrollment[]> {
  const { data, error } = await admin.rpc("claim_due_enrollments", {
    max_rows: limit,
  });
  if (error) throw new Error(`claim_due_enrollments: ${error.message}`);
  return (data ?? []) as SequenceEnrollment[];
}

async function finish(
  admin: Admin,
  id: string,
  status: "completed" | "exited" | "failed",
  extra?: Record<string, unknown>,
) {
  await admin
    .from("whatsapp_sequence_enrollments")
    .update({ status, next_run_at: null, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);
}

export type EnrollmentOutcome =
  | "sent"
  | "completed"
  | "exited"
  | "suppressed"
  | "failed";

/**
 * Process one claimed enrollment: re-check exit conditions, run the current
 * step's actions through the executor, then schedule the next step (or
 * complete). Best-effort — returns an outcome, never throws.
 */
export async function processEnrollment(
  admin: Admin,
  e: SequenceEnrollment,
): Promise<EnrollmentOutcome> {
  try {
    // Sequence definition.
    const { data: seqRow } = await admin
      .from("whatsapp_sequences")
      .select("steps, exit_conditions, active")
      .eq("id", e.sequence_id)
      .eq("workspace_id", e.workspace_id)
      .maybeSingle();
    if (!seqRow || !(seqRow as { active: boolean }).active) {
      await finish(admin, e.id, "exited", { last_error: "sequence_inactive" });
      return "exited";
    }
    const seq = seqRow as {
      steps: SequenceStep[];
      exit_conditions: { on_reply?: boolean } | null;
    };
    const steps = Array.isArray(seq.steps) ? seq.steps : [];
    const exit = seq.exit_conditions ?? {};

    // Consent suppression — fail closed, never message an opted-out contact.
    const { isSuppressed } = await import("./consent");
    if (await isSuppressed(admin, e.workspace_id, e.contact_id)) {
      await finish(admin, e.id, "exited", { last_error: "suppressed" });
      return "suppressed";
    }

    // No more steps → complete.
    if (e.current_step >= steps.length) {
      await finish(admin, e.id, "completed");
      return "completed";
    }

    // Conversation send-context (mirrors runMacro): instance + remote + contact.
    if (!e.conversation_id) {
      await finish(admin, e.id, "failed", { last_error: "missing_conversation" });
      return "failed";
    }
    const { data: convRow } = await admin
      .from("whatsapp_conversations")
      .select(
        "id, instance_id, contact_id, source_id, source_jid, chat_type, waiting_since",
      )
      .eq("id", e.conversation_id)
      .eq("workspace_id", e.workspace_id)
      .maybeSingle();
    if (!convRow) {
      await finish(admin, e.id, "failed", { last_error: "conversation_not_found" });
      return "failed";
    }
    const conv = convRow as {
      id: string;
      instance_id: string;
      contact_id: string | null;
      source_id: string;
      source_jid: string | null;
      chat_type: "individual" | "group";
      waiting_since: string | null;
    };

    // Exit-on-reply: waiting_since is stamped on every inbound and cleared on
    // every outbound. If it is set and AFTER enrollment, the customer replied
    // since we enrolled them → stop the sequence.
    if (exit.on_reply !== false && conv.waiting_since) {
      if (new Date(conv.waiting_since).getTime() > new Date(e.enrolled_at).getTime()) {
        await finish(admin, e.id, "exited", { last_error: "exit_on_reply" });
        return "exited";
      }
    }

    // Instance (must be connected for a send to land).
    const { data: instRow } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("id", conv.instance_id)
      .maybeSingle();
    if (!instRow) {
      await finish(admin, e.id, "failed", { last_error: "no_instance" });
      return "failed";
    }
    const instance = instRow as WhatsAppInstanceRow;

    // CRM contact for personalization + suppression.
    let contact: PersonalizeContact | null = null;
    if (conv.contact_id) {
      const { data: ct } = await admin
        .from("crm_contacts")
        .select("first_name, last_name, phone, email, custom")
        .eq("id", conv.contact_id)
        .eq("workspace_id", e.workspace_id)
        .maybeSingle();
      if (ct) contact = ct as PersonalizeContact;
    }

    const toNumber =
      conv.chat_type === "group"
        ? conv.source_jid ?? conv.source_id
        : conv.source_id;

    const ctx: ActionContext = {
      workspaceId: e.workspace_id,
      instance,
      conversationId: conv.id,
      toNumber,
      contactId: conv.contact_id,
      contact,
      actorUserId: ACTORLESS,
    };

    const step = steps[e.current_step] ?? {};
    const actions = Array.isArray(step.actions) ? step.actions : [];
    const results = await executeActions(admin, ctx, actions);

    // If a soft-ban paused the instance mid-step, re-queue this enrollment to
    // retry after the cooldown rather than burning the step.
    if (results.some((r) => r.skipped === "soft_ban_paused")) {
      await admin
        .from("whatsapp_sequence_enrollments")
        .update({
          status: "active",
          next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          last_error: "soft_ban_requeued",
        })
        .eq("id", e.id);
      return "failed";
    }

    // Advance to the next step, or complete.
    const nextIdx = e.current_step + 1;
    if (nextIdx >= steps.length) {
      await admin
        .from("whatsapp_sequence_enrollments")
        .update({
          status: "completed",
          current_step: nextIdx,
          next_run_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", e.id);
      return "completed";
    }
    const nextStep = steps[nextIdx] ?? {};
    const delayMin = Math.max(0, Number(nextStep.delay_minutes ?? 0));
    const nextRun = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
    await admin
      .from("whatsapp_sequence_enrollments")
      .update({
        status: "active",
        current_step: nextIdx,
        next_run_at: nextRun,
        updated_at: new Date().toISOString(),
      })
      .eq("id", e.id);
    return "sent";
  } catch (err) {
    await finish(admin, e.id, "failed", {
      last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    });
    return "failed";
  }
}

/**
 * Enroll a contact/conversation into a sequence (idempotent on
 * (sequence_id, contact_id)). Schedules step 0 immediately (or after the first
 * step's delay). Used by the executor's enroll action + the route's manual
 * enroll. Returns the enrollment id, or null if the sequence is inactive / the
 * contact is already enrolled.
 */
export async function enrollInSequence(
  admin: Admin,
  params: {
    workspaceId: string;
    sequenceId: string;
    conversationId: string;
    contactId: string | null;
    instanceId: string | null;
    remoteJid: string | null;
  },
): Promise<string | null> {
  const { data: seq } = await admin
    .from("whatsapp_sequences")
    .select("id, active, steps")
    .eq("id", params.sequenceId)
    .eq("workspace_id", params.workspaceId)
    .maybeSingle();
  if (!seq || !(seq as { active: boolean }).active) return null;

  const steps = ((seq as { steps?: SequenceStep[] }).steps ?? []) as SequenceStep[];
  const firstDelay = Math.max(0, Number(steps[0]?.delay_minutes ?? 0));
  const nextRun = new Date(Date.now() + firstDelay * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("whatsapp_sequence_enrollments")
    .upsert(
      {
        workspace_id: params.workspaceId,
        sequence_id: params.sequenceId,
        conversation_id: params.conversationId,
        contact_id: params.contactId,
        instance_id: params.instanceId,
        remote_jid: params.remoteJid,
        current_step: 0,
        status: "active",
        next_run_at: nextRun,
        enrolled_at: new Date().toISOString(),
      },
      { onConflict: "sequence_id,contact_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}
