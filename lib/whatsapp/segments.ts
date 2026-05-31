import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { suppressedSet } from "./consent";
import type { PersonalizeContact } from "./personalize";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Dynamic segment resolution (EPIC-08).
 *
 * A whatsapp_segments.query jsonb is resolved to a concrete recipient list
 * AT SEND TIME (so a "Wholesale" segment always reflects current labels),
 * unlike the frozen whatsapp_lists.contact_ids[].
 *
 * IMPORTANT — schema reality: crm_contacts has NO top-level lifecycle_stage /
 * status / tags / last_contacted_at columns (verified live: it only has id,
 * workspace_id, first_name, last_name, email, phone, job_title, company_id,
 * notes, visibility, owner_id, custom jsonb, created_by, created_at,
 * updated_at, deleted_at). So lifecycle / status / tags filters resolve
 * against the `custom` jsonb, and last_contacted is derived from the most
 * recent outbound whatsapp_message to the contact.
 *
 * Opt-out suppression is ALWAYS applied on top so a segment can never resolve
 * a suppressed contact.
 */

export interface SegmentQuery {
  labels?: string[];
  lifecycle?: string[];
  status?: string[];
  tags?: string[];
  custom?: Record<string, unknown>;
  last_contacted?: { op: "before" | "after" | "never"; days?: number };
  consent_only?: boolean;
}

export interface SegmentRecipient {
  contactId: string;
  phone: string;
  contact: PersonalizeContact;
}

function normalisePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

const CONTACT_COLS = "id, phone, first_name, last_name, email, custom";

async function contactIdsForLabels(
  admin: Admin,
  workspaceId: string,
  labelIds: string[],
): Promise<Set<string> | null> {
  if (labelIds.length === 0) return null;

  const { data: contactTags } = await admin
    .from("whatsapp_taggings")
    .select("label_id, taggable_id")
    .eq("workspace_id", workspaceId)
    .eq("taggable_type", "contact")
    .in("label_id", labelIds);

  const { data: convTags } = await admin
    .from("whatsapp_taggings")
    .select("label_id, taggable_id")
    .eq("workspace_id", workspaceId)
    .eq("taggable_type", "conversation")
    .in("label_id", labelIds);

  const convIds = (convTags ?? []).map(
    (r) => (r as { taggable_id: string }).taggable_id,
  );
  const convToContact = new Map<string, string>();
  if (convIds.length > 0) {
    const { data: convs } = await admin
      .from("whatsapp_conversations")
      .select("id, contact_id")
      .eq("workspace_id", workspaceId)
      .in("id", convIds);
    for (const c of convs ?? []) {
      const row = c as { id: string; contact_id: string | null };
      if (row.contact_id) convToContact.set(row.id, row.contact_id);
    }
  }

  const perLabel = new Map<string, Set<string>>();
  const add = (labelId: string, contactId: string) => {
    let s = perLabel.get(labelId);
    if (!s) {
      s = new Set();
      perLabel.set(labelId, s);
    }
    s.add(contactId);
  };
  for (const r of contactTags ?? []) {
    const row = r as { label_id: string; taggable_id: string };
    add(row.label_id, row.taggable_id);
  }
  for (const r of convTags ?? []) {
    const row = r as { label_id: string; taggable_id: string };
    const cid = convToContact.get(row.taggable_id);
    if (cid) add(row.label_id, cid);
  }

  let acc: Set<string> | null = null;
  for (const labelId of labelIds) {
    const s = perLabel.get(labelId) ?? new Set<string>();
    if (acc === null) {
      acc = new Set(s);
    } else {
      const prev: Set<string> = acc;
      acc = new Set([...prev].filter((id) => s.has(id)));
    }
    if (acc.size === 0) break;
  }
  return acc ?? new Set<string>();
}

async function contactIdsForLastContacted(
  admin: Admin,
  workspaceId: string,
  candidateIds: string[],
  filter: { op: "before" | "after" | "never"; days?: number },
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const { data: rows } = await admin
    .from("whatsapp_messages")
    .select("contact_id, sent_at")
    .eq("workspace_id", workspaceId)
    .eq("direction", "outbound")
    .in("contact_id", candidateIds)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false });

  const lastByContact = new Map<string, number>();
  for (const r of rows ?? []) {
    const row = r as { contact_id: string | null; sent_at: string | null };
    if (!row.contact_id || !row.sent_at) continue;
    if (!lastByContact.has(row.contact_id)) {
      lastByContact.set(row.contact_id, new Date(row.sent_at).getTime());
    }
  }

  const out = new Set<string>();
  if (filter.op === "never") {
    for (const id of candidateIds) if (!lastByContact.has(id)) out.add(id);
    return out;
  }
  const days = typeof filter.days === "number" ? filter.days : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const id of candidateIds) {
    const t = lastByContact.get(id);
    if (t === undefined) {
      if (filter.op === "before") out.add(id);
      continue;
    }
    if (filter.op === "before" && t < cutoff) out.add(id);
    if (filter.op === "after" && t >= cutoff) out.add(id);
  }
  return out;
}

function customStr(custom: Record<string, unknown> | null, key: string): string {
  const v = custom?.[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function resolveSegmentRecipients(
  admin: Admin,
  workspaceId: string,
  query: SegmentQuery,
  cap = 5000,
): Promise<SegmentRecipient[]> {
  const labelSet = await contactIdsForLabels(
    admin,
    workspaceId,
    query.labels ?? [],
  );
  if (labelSet !== null && labelSet.size === 0) return [];

  let qb = admin
    .from("crm_contacts")
    .select(CONTACT_COLS)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .not("phone", "is", null);

  if (query.custom && Object.keys(query.custom).length > 0) {
    qb = qb.contains("custom", query.custom);
  }
  if (labelSet !== null) {
    qb = qb.in("id", [...labelSet]);
  }
  qb = qb.limit(cap);

  const { data: rows, error } = await qb;
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp.segments] resolve failed:", error.message);
    return [];
  }

  const lifecycleSet = new Set((query.lifecycle ?? []).map((s) => s.toLowerCase()));
  const statusSet = new Set((query.status ?? []).map((s) => s.toLowerCase()));
  const tagSet = new Set((query.tags ?? []).map((s) => s.toLowerCase()));

  let filtered = (rows ?? []).filter((r) => {
    const row = r as { custom: Record<string, unknown> | null };
    const custom = row.custom ?? {};
    if (lifecycleSet.size > 0) {
      if (!lifecycleSet.has(customStr(custom, "lifecycle_stage").toLowerCase()))
        return false;
    }
    if (statusSet.size > 0) {
      if (!statusSet.has(customStr(custom, "status").toLowerCase())) return false;
    }
    if (tagSet.size > 0) {
      const tags = Array.isArray(custom.tags)
        ? (custom.tags as unknown[]).map((t) => String(t).toLowerCase())
        : [];
      if (!tags.some((t) => tagSet.has(t))) return false;
    }
    return true;
  });

  if (query.consent_only) {
    const ids = filtered.map((r) => (r as { id: string }).id);
    if (ids.length === 0) return [];
    const { data: states } = await admin
      .from("whatsapp_contact_state")
      .select("contact_id")
      .eq("workspace_id", workspaceId)
      .eq("marketing_consent", true)
      .in("contact_id", ids);
    const allow = new Set(
      (states ?? []).map((s) => (s as { contact_id: string }).contact_id),
    );
    filtered = filtered.filter((r) => allow.has((r as { id: string }).id));
  }

  if (query.last_contacted) {
    const ids = filtered.map((r) => (r as { id: string }).id);
    const lc = await contactIdsForLastContacted(
      admin,
      workspaceId,
      ids,
      query.last_contacted,
    );
    filtered = filtered.filter((r) => lc.has((r as { id: string }).id));
  }

  const seenPhone = new Set<string>();
  const allIds: string[] = [];
  const draft: SegmentRecipient[] = [];
  for (const r of filtered) {
    const row = r as {
      id: string;
      phone: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      custom: Record<string, unknown> | null;
    };
    const phone = normalisePhone(row.phone);
    if (!phone || seenPhone.has(phone)) continue;
    seenPhone.add(phone);
    allIds.push(row.id);
    draft.push({
      contactId: row.id,
      phone,
      contact: {
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        email: row.email,
        lifecycle_stage: customStr(row.custom, "lifecycle_stage") || null,
        custom: row.custom,
      },
    });
  }

  const suppressed = await suppressedSet(admin, workspaceId, allIds);
  return draft.filter((d) => !suppressed.has(d.contactId));
}

/** Cheap count for the composer preview ("≈ N recipients"). */
export async function countSegmentRecipients(
  admin: Admin,
  workspaceId: string,
  query: SegmentQuery,
): Promise<number> {
  const r = await resolveSegmentRecipients(admin, workspaceId, query);
  return r.length;
}
