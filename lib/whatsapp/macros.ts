import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  executeActions,
  type ActionContext,
  type ActionResult,
  type WhatsAppAction,
} from "./actions";
import { personalizeForContact, type PersonalizeContact } from "./personalize";
import type { WhatsAppInstanceRow } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * lib/whatsapp/macros.ts — run a saved macro against an open conversation
 * (EPIC-14). A macro is an ordered list of actions in the SAME vocabulary as
 * automation rules, so we REUSE the shared action executor (lib/whatsapp/
 * actions.ts) verbatim — no parallel send path. Every outbound action inside
 * still routes through the throttle + isSuppressed() (consent) because that's
 * baked into the executor.
 *
 * The set of action types a macro may contain is the same allowlist the
 * automation route validates against.
 */

export const MACRO_ACTION_TYPES = new Set([
  "send_text",
  "send_canned",
  "send_media",
  "send_menu",
  "add_label",
  "set_status",
  "set_priority",
  "assign",
]);

export function validateMacroActions(
  actions: unknown,
): { ok: true; value: WhatsAppAction[] } | { ok: false; error: string } {
  if (!Array.isArray(actions)) {
    return { ok: false, error: "actions must be an array" };
  }
  if (actions.length === 0) {
    return { ok: false, error: "actions cannot be empty" };
  }
  const out: WhatsAppAction[] = [];
  for (const a of actions) {
    if (!a || typeof a !== "object") {
      return { ok: false, error: "each action must be an object" };
    }
    const type = (a as { type?: unknown }).type;
    if (typeof type !== "string" || !MACRO_ACTION_TYPES.has(type)) {
      return { ok: false, error: `unknown action type: ${String(type)}` };
    }
    out.push({
      type,
      params: ((a as { params?: Record<string, unknown> }).params) ?? {},
    });
  }
  return { ok: true, value: out };
}

interface RunMacroInput {
  admin: Admin;
  workspaceId: string;
  conversationId: string;
  macroId: string;
  actorUserId: string | null;
}

export interface RunMacroResult {
  ok: boolean;
  results: ActionResult[];
  error?: string;
}

/**
 * Load a macro + the conversation's send context, then run it through the
 * shared executor. Resolves the conversation's remote number/JID and CRM
 * contact (for personalization + suppression) exactly like the automation
 * pipeline does.
 */
export async function runMacro(input: RunMacroInput): Promise<RunMacroResult> {
  const { admin, workspaceId, conversationId, macroId, actorUserId } = input;

  // Macro (workspace-scoped). Visibility 'personal' is only runnable by its
  // creator; 'global' by any member.
  const { data: macroRow } = await admin
    .from("whatsapp_macros")
    .select("id, actions, visibility, created_by")
    .eq("id", macroId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!macroRow) return { ok: false, results: [], error: "macro_not_found" };
  const macro = macroRow as {
    id: string;
    actions: WhatsAppAction[];
    visibility: "global" | "personal";
    created_by: string | null;
  };
  if (
    macro.visibility === "personal" &&
    macro.created_by &&
    macro.created_by !== actorUserId
  ) {
    return { ok: false, results: [], error: "forbidden" };
  }
  const validated = validateMacroActions(macro.actions);
  if (!validated.ok) return { ok: false, results: [], error: validated.error };

  // Conversation send context (+ ownership already verified by the route).
  const { data: convRow } = await admin
    .from("whatsapp_conversations")
    .select("id, instance_id, contact_id, source_id, source_jid, chat_type")
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!convRow) return { ok: false, results: [], error: "conversation_not_found" };
  const conv = convRow as {
    id: string;
    instance_id: string;
    contact_id: string | null;
    source_id: string;
    source_jid: string | null;
    chat_type: "individual" | "group";
  };

  // Instance (must be connected for any send action to land).
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("id", conv.instance_id)
    .maybeSingle();
  if (!instRow) return { ok: false, results: [], error: "no_instance" };
  const instance = instRow as WhatsAppInstanceRow;

  // CRM contact for personalization + suppression.
  let contact: PersonalizeContact | null = null;
  if (conv.contact_id) {
    const { data: ct } = await admin
      .from("crm_contacts")
      .select("first_name, last_name, phone, email, custom")
      .eq("id", conv.contact_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (ct) contact = ct as PersonalizeContact;
  }

  // For a group thread the "number" is the group JID; for individual it's the
  // remote phone (digits). The executor's sendOutbound treats a JID as a group
  // and skips the per-number cooldown automatically.
  const toNumber =
    conv.chat_type === "group"
      ? conv.source_jid ?? conv.source_id
      : conv.source_id;

  const ctx: ActionContext = {
    workspaceId,
    instance,
    conversationId,
    toNumber,
    contactId: conv.contact_id,
    contact,
    actorUserId,
  };

  const results = await executeActions(admin, ctx, validated.value);
  // `void` to keep personalizeForContact referenced (it's the executor's path,
  // re-exported here so callers can preview a rendered action if needed).
  void personalizeForContact;
  return { ok: true, results };
}
