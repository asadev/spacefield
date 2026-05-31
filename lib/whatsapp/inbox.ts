import "server-only";

/**
 * lib/whatsapp/inbox.ts — shared server helpers for WhatsApp inbox v2
 * Wave 2 (lifecycle / labels / notes / canned-responses / contact sidebar).
 *
 * Pure-ish helpers that several routes reuse so the contract stays
 * consistent: {{var}} interpolation for canned replies, the contact-field
 * bag used to resolve those vars, @mention parsing, and label/tagging
 * aggregation. Everything reads through the service-role admin client
 * (routes do the auth + workspace-ownership checks first).
 */

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// ───────────────────────── lifecycle constants ─────────────────────────

export const WA_STATUS = {
  open: 0,
  resolved: 1,
  pending: 2,
  snoozed: 3,
} as const;

export type WaStatusValue = 0 | 1 | 2 | 3;

export function isValidStatus(n: unknown): n is WaStatusValue {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

export function isValidPriority(n: unknown): n is 0 | 1 | 2 | 3 | 4 {
  return n === 0 || n === 1 || n === 2 || n === 3 || n === 4;
}

// ───────────────────────── {{var}} interpolation ─────────────────────────

/**
 * The flat field bag used to resolve {{contact.firstName}}, {{city}},
 * {{name}} etc. in canned responses. Keys are lower-cased on lookup so
 * {{City}}, {{city}} and {{ City }} all resolve. Both `contact.firstName`
 * and bare `firstName` are accepted.
 */
export type FieldBag = Record<string, string>;

/**
 * Build the field bag for a conversation's linked CRM contact. Resolves
 * standard CRM columns + anything in crm_contacts.custom (jsonb) +
 * the conversation's custom_attributes jsonb. Missing contact → just the
 * conversation-derived fields (phone/name). Never throws.
 */
export async function buildContactFieldBag(
  admin: Admin,
  params: {
    workspaceId: string;
    conversationId?: string | null;
    contactId?: string | null;
  },
): Promise<FieldBag> {
  const bag: FieldBag = {};

  let contactId = params.contactId ?? null;
  let convCustom: Record<string, unknown> = {};
  let convTitle: string | null = null;
  let convPhone: string | null = null;

  if (params.conversationId) {
    const { data: conv } = await admin
      .from("whatsapp_conversations")
      .select("contact_id, title, source_id, custom_attributes")
      .eq("id", params.conversationId)
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();
    if (conv) {
      const c = conv as {
        contact_id: string | null;
        title: string | null;
        source_id: string | null;
        custom_attributes: Record<string, unknown> | null;
      };
      contactId = contactId ?? c.contact_id;
      convTitle = c.title;
      convPhone = c.source_id;
      convCustom =
        c.custom_attributes && typeof c.custom_attributes === "object"
          ? c.custom_attributes
          : {};
    }
  }

  if (contactId) {
    const { data: contact } = await admin
      .from("crm_contacts")
      .select("first_name, last_name, email, phone, job_title, custom")
      .eq("id", contactId)
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();
    if (contact) {
      const ct = contact as {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        job_title: string | null;
        custom: Record<string, unknown> | null;
      };
      const first = ct.first_name ?? "";
      const last = ct.last_name ?? "";
      const full = [first, last].filter(Boolean).join(" ").trim();
      setBoth(bag, "firstName", first);
      setBoth(bag, "lastName", last);
      setBoth(bag, "name", full || convTitle || "");
      setBoth(bag, "fullName", full);
      setBoth(bag, "email", ct.email ?? "");
      setBoth(bag, "phone", ct.phone ?? convPhone ?? "");
      setBoth(bag, "jobTitle", ct.job_title ?? "");
      // crm custom jsonb (e.g. {city, fabric, size}) — flat keys.
      if (ct.custom && typeof ct.custom === "object") {
        for (const [k, v] of Object.entries(ct.custom)) {
          setBoth(bag, k, stringifyVal(v));
        }
      }
    }
  }

  // Conversation-only fallbacks (no contact linked yet).
  if (!bag["name"]) setBoth(bag, "name", convTitle ?? convPhone ?? "");
  if (!bag["firstName"] && convTitle) {
    setBoth(bag, "firstName", convTitle.split(" ")[0] ?? "");
  }
  if (!bag["phone"] && convPhone) setBoth(bag, "phone", convPhone);

  // Conversation custom_attributes (e.g. {city, lifecycle_stage}) — override
  // CRM custom on key collision, since they're set on the thread directly.
  for (const [k, v] of Object.entries(convCustom)) {
    setBoth(bag, k, stringifyVal(v));
  }

  return bag;
}

function setBoth(bag: FieldBag, key: string, value: string) {
  bag[key.toLowerCase()] = value;
  bag[`contact.${key}`.toLowerCase()] = value;
}

function stringifyVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

/**
 * Replace {{var}} / {{ contact.firstName }} placeholders with values from
 * the bag. Unknown vars resolve to "" (so we never ship a literal
 * "{{city}}" to a customer). Supports a `{{var|fallback}}` default form.
 */
export function interpolate(template: string, bag: FieldBag): string {
  return template.replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_m, rawKey, fallback) => {
    const key = String(rawKey).toLowerCase();
    const val = bag[key];
    if (val !== undefined && val !== "") return val;
    return fallback !== undefined ? String(fallback) : "";
  });
}

// ───────────────────────── @mention parsing ─────────────────────────

/**
 * Extract @mention tokens from a private-note body. We match
 * `@word` (letters/digits/._-) and also `@[uuid]` for explicit ids the
 * composer can emit. Returns lower-cased handle tokens (the route maps
 * them to workspace members by name/email prefix) plus any raw uuids.
 */
export function parseMentions(body: string): { handles: string[]; userIds: string[] } {
  const handles = new Set<string>();
  const userIds = new Set<string>();
  // Explicit @[uuid] form first.
  const idRe = /@\[([0-9a-fA-F-]{36})\]/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(body)) !== null) {
    userIds.add(m[1]);
  }
  // Bare @handle form.
  const hRe = /(^|\s)@([a-zA-Z0-9._-]{2,40})/g;
  while ((m = hRe.exec(body)) !== null) {
    handles.add(m[2].toLowerCase());
  }
  return { handles: Array.from(handles), userIds: Array.from(userIds) };
}

// ───────────────────────── labels aggregation ─────────────────────────

/**
 * Map conversation_id → label_ids[] for a set of conversations, in one
 * batched query. Used by the list route to attach label_ids to each item.
 */
export async function labelIdsByConversation(
  admin: Admin,
  workspaceId: string,
  conversationIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (conversationIds.length === 0) return out;
  const { data } = await admin
    .from("whatsapp_taggings")
    .select("label_id, taggable_id")
    .eq("workspace_id", workspaceId)
    .eq("taggable_type", "conversation")
    .in("taggable_id", conversationIds);
  for (const row of (data ?? []) as Array<{ label_id: string; taggable_id: string }>) {
    const arr = out.get(row.taggable_id) ?? [];
    arr.push(row.label_id);
    out.set(row.taggable_id, arr);
  }
  return out;
}

/**
 * Resolve a workspace member's display name for assignee chips, in one
 * batched query against auth.users via the admin auth API is overkill;
 * we use the profiles table when present, else fall back to the id prefix.
 * Returns id → label.
 */
export async function memberLabels(
  admin: Admin,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  // profiles is the canonical display-name table across Spacefield. It keys on
  // user_id (not id) and has no email column — full_name → username → short id.
  const { data } = await admin
    .from("profiles")
    .select("user_id, full_name, username")
    .in("user_id", ids);
  for (const row of (data ?? []) as Array<{
    user_id: string;
    full_name: string | null;
    username: string | null;
  }>) {
    const label = row.full_name?.trim() || row.username?.trim() || row.user_id.slice(0, 8);
    out.set(row.user_id, label);
  }
  // any id without a profile row → short id
  for (const id of ids) if (!out.has(id)) out.set(id, id.slice(0, 8));
  return out;
}
