import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Opt-out / consent (EPIC-12) — the guardrail that gates EVERY broadcast
 * and automation send.
 *
 * Source of truth: whatsapp_contact_state (mirror table keyed by
 * workspace_id+contact_id; we do NOT alter crm_contacts). A contact is
 * SUPPRESSED when opted_out_at is non-null. Audit lives in
 * whatsapp_opt_out_log (append-only).
 *
 * STOP handling: the inbound webhook calls detectStopKeyword() on every
 * inbound text; a match records an opt-out so the next blast skips them.
 */

/**
 * Case-insensitive STOP keywords. Includes English + Roman-Urdu variants a
 * Pakistani shop's customers actually type. Matched against the normalized
 * (trimmed, lowercased, punctuation-stripped) inbound body, both as the
 * whole message and as a leading token, so "STOP", "stop please", and
 * "band karo" all trigger while "stop by the shop tomorrow" does not.
 */
const STOP_KEYWORDS = [
  "stop",
  "unsubscribe",
  "stop messages",
  "stop messaging",
  "band karo",
  "bnd karo",
  "bndkro",
  "band kro",
  "bandkaro",
  "rok do",
  "rokdo",
  "opt out",
  "optout",
  "remove me",
];

/** Resubscribe keywords — a contact can opt back in by texting these. */
const START_KEYWORDS = ["start", "subscribe", "unstop", "resume", "chalu karo"];

function normalize(body: string | null | undefined): string {
  return (body ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(norm: string, keywords: string[]): string | null {
  if (!norm) return null;
  for (const kw of keywords) {
    if (norm === kw) return kw;
    // leading-token match: "stop ..." but not "... stop"
    if (norm.startsWith(kw + " ")) return kw;
  }
  return null;
}

export type ConsentSignal = "opt_out" | "opt_in" | null;

/**
 * Classify an inbound message body as an opt-out, opt-in, or neither.
 * Pure — no DB. Returns the matched keyword too (for the audit reason).
 */
export function detectConsentKeyword(body: string | null | undefined): {
  signal: ConsentSignal;
  keyword: string | null;
} {
  const norm = normalize(body);
  const stop = matchesKeyword(norm, STOP_KEYWORDS);
  if (stop) return { signal: "opt_out", keyword: stop };
  const start = matchesKeyword(norm, START_KEYWORDS);
  if (start) return { signal: "opt_in", keyword: start };
  return { signal: null, keyword: null };
}

/** Back-compat alias used by the webhook. */
export function detectStopKeyword(body: string | null | undefined): string | null {
  const { signal, keyword } = detectConsentKeyword(body);
  return signal === "opt_out" ? keyword : null;
}

/**
 * Is this contact suppressed (opted out) for marketing/automation sends?
 * Returns true when there is a contact_state row with opted_out_at set.
 * Defensive: on a query error we FAIL CLOSED (treat as suppressed) so a
 * transient DB blip can never blast an opted-out contact.
 *
 * contactId null/empty → not suppressed (a raw-number send with no CRM link
 * cannot be matched to an opt-out; interactive 1:1 sends bypass this anyway).
 */
export async function isSuppressed(
  admin: Admin,
  workspaceId: string,
  contactId: string | null | undefined,
): Promise<boolean> {
  if (!contactId) return false;
  const { data, error } = await admin
    .from("whatsapp_contact_state")
    .select("opted_out_at")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp.consent] isSuppressed check failed:", error.message);
    return true; // fail closed
  }
  return Boolean((data as { opted_out_at: string | null } | null)?.opted_out_at);
}

/**
 * Batch suppression check — returns the SET of suppressed contactIds among
 * the input. Used by the runner/segment resolver to filter recipients in one
 * query instead of N. On error, returns ALL ids as suppressed (fail closed).
 */
export async function suppressedSet(
  admin: Admin,
  workspaceId: string,
  contactIds: string[],
): Promise<Set<string>> {
  const ids = contactIds.filter(Boolean);
  if (ids.length === 0) return new Set();
  const { data, error } = await admin
    .from("whatsapp_contact_state")
    .select("contact_id")
    .eq("workspace_id", workspaceId)
    .not("opted_out_at", "is", null)
    .in("contact_id", ids);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp.consent] suppressedSet failed:", error.message);
    return new Set(ids); // fail closed
  }
  return new Set(
    (data ?? []).map((r) => (r as { contact_id: string }).contact_id),
  );
}

/**
 * Record an opt-out for a contact (idempotent upsert on contact_state) +
 * append an audit row. Used by the STOP webhook handler and the manual
 * opt-out route.
 */
export async function recordOptOut(
  admin: Admin,
  params: {
    workspaceId: string;
    contactId: string;
    source: string; // 'stop_keyword' | 'manual' | 'api' | 'import'
    reason?: string | null;
  },
): Promise<void> {
  const { workspaceId, contactId, source, reason } = params;
  const now = new Date().toISOString();
  await admin
    .from("whatsapp_contact_state")
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contactId,
        opted_out_at: now,
        opt_out_source: source,
        marketing_consent: false,
      },
      { onConflict: "workspace_id,contact_id" },
    );
  await admin.from("whatsapp_opt_out_log").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    action: "opt_out",
    reason: reason ?? source,
  });
}

/** Clear an opt-out (re-subscribe) + audit. */
export async function recordOptIn(
  admin: Admin,
  params: {
    workspaceId: string;
    contactId: string;
    source: string;
    reason?: string | null;
    grantConsent?: boolean;
  },
): Promise<void> {
  const { workspaceId, contactId, source, reason, grantConsent } = params;
  const now = new Date().toISOString();
  await admin.from("whatsapp_contact_state").upsert(
    {
      workspace_id: workspaceId,
      contact_id: contactId,
      opted_out_at: null,
      opt_out_source: null,
      opted_in_at: now,
      ...(grantConsent ? { marketing_consent: true } : {}),
    },
    { onConflict: "workspace_id,contact_id" },
  );
  await admin.from("whatsapp_opt_out_log").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    action: "opt_in",
    reason: reason ?? source,
  });
}
