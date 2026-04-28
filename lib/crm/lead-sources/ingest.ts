/* ─────────────────────────────────────────────────────────────────────────
 * Lead-source ingestion — server-only normalization + insert pipeline.
 *
 * Three entry points share one internal `createLeadFromMappedFields()`:
 *
 *   - ingestWebhookPayload — JSON from any external system.
 *   - ingestFormSubmission — typed Record from our hosted form.
 *   - ingestCsvRow        — Record<string,string> from a CSV row.
 *
 * Idempotency: if a lead already exists in this workspace with the same
 * lower-cased `email` and same `source` label within the last 30 days,
 * we return `{ status: 'duplicate', leadId: <existing> }` rather than
 * creating a copy. Without an email we skip the dedupe (no good key).
 *
 * Every call writes a row to `crm_lead_source_events` for the admin
 * debug pane — accepted/duplicate/rejected/error all logged.
 * ───────────────────────────────────────────────────────────────────── */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CrmLeadSource,
  IngestResult,
  LeadSourceEventStatus,
  LeadSourceFormField,
  NormalizedLeadFields,
} from "./types";

const DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_PAYLOAD_BYTES = 64 * 1024; // ~64KB cap for event log

type JsonRecord = Record<string, unknown>;
type IngestRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

// ── helpers ─────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return null;
}

/* The webhook normalizer accepts any of the common case variants for
 * each canonical field. Returning `null` means "not present" so the
 * caller can fall back to the Postgres default. */
const FIELD_ALIASES: Record<keyof NormalizedLeadFields, string[]> = {
  first_name: ["first_name", "firstName", "fname", "first"],
  last_name: ["last_name", "lastName", "lname", "last", "surname"],
  email: ["email", "Email", "EMAIL", "email_address", "emailAddress"],
  phone: ["phone", "mobile", "tel", "telephone", "phone_number", "phoneNumber"],
  notes: ["notes", "message", "comments", "comment", "description", "body"],
  custom: [],
};

/* Some senders give us a single "name" field rather than first/last —
 * split on first space, dump the rest into last_name. Phase 5 connectors
 * can override this if a provider has structured names. */
function splitName(full: string): { first_name: string | null; last_name: string | null } {
  const t = full.trim();
  if (!t) return { first_name: null, last_name: null };
  const idx = t.indexOf(" ");
  if (idx < 0) return { first_name: t, last_name: null };
  return {
    first_name: t.slice(0, idx).trim() || null,
    last_name: t.slice(idx + 1).trim() || null,
  };
}

function normalizeWebhookPayload(payload: JsonRecord): NormalizedLeadFields {
  const claimedKeys = new Set<string>();
  const out: NormalizedLeadFields = {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    notes: null,
    custom: {},
  };

  for (const field of ["first_name", "last_name", "email", "phone", "notes"] as const) {
    const aliases = FIELD_ALIASES[field];
    for (const a of aliases) {
      if (a in payload) {
        out[field] = asString(payload[a]);
        claimedKeys.add(a);
        break;
      }
    }
  }

  // Fallback: combined "name" field if first/last weren't present.
  if (!out.first_name && !out.last_name) {
    const nameKeys = ["name", "full_name", "fullName", "Name"];
    for (const k of nameKeys) {
      if (k in payload) {
        const v = asString(payload[k]);
        claimedKeys.add(k);
        if (v) {
          const { first_name, last_name } = splitName(v);
          out.first_name = first_name;
          out.last_name = last_name;
        }
        break;
      }
    }
  }

  // Everything else → custom jsonb. Keep the raw value (not stringified)
  // so numbers stay numbers, booleans stay booleans, etc.
  for (const [k, v] of Object.entries(payload)) {
    if (claimedKeys.has(k)) continue;
    if (k === "name" || k === "full_name" || k === "fullName" || k === "Name") continue;
    out.custom[k] = v;
  }

  return out;
}

function truncatePayload(raw: unknown): unknown {
  // Re-encode and clip — keeps event log queryable and bounds size.
  let json: string;
  try {
    json = JSON.stringify(raw);
  } catch {
    return { _truncated: true, _reason: "non-serializable" };
  }
  if (json.length <= MAX_PAYLOAD_BYTES) return raw;
  return {
    _truncated: true,
    _original_bytes: json.length,
    preview: json.slice(0, MAX_PAYLOAD_BYTES),
  };
}

// ── source loading ──────────────────────────────────────────────────────

export async function loadLeadSourceById(
  sourceId: string
): Promise<CrmLeadSource | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("crm_lead_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CrmLeadSource;
}

export async function loadLeadSourceBySlug(
  slug: string
): Promise<CrmLeadSource | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("crm_lead_sources")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as CrmLeadSource;
}

// ── HMAC verification (webhook) ─────────────────────────────────────────

function hexEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeBodySignature(
  body: string,
  secret: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return hexEncode(sig);
}

export async function verifyWebhookSignature(
  rawBody: string,
  providedSignature: string,
  secret: string
): Promise<boolean> {
  if (!providedSignature) return false;
  const expected = await computeBodySignature(rawBody, secret);
  return timingSafeEqualHex(expected.toLowerCase(), providedSignature.toLowerCase());
}

// ── core insert ─────────────────────────────────────────────────────────

async function findRecentDuplicate(
  workspaceId: string,
  email: string,
  source: string
): Promise<string | null> {
  const sb = createAdminClient();
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data, error } = await sb
    .from("crm_leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("email", email)
    .eq("source", source)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as { id: string }).id;
}

async function logEvent(args: {
  source: CrmLeadSource;
  status: LeadSourceEventStatus;
  reason?: string;
  payload: unknown;
  leadId: string | null;
  meta?: IngestRequestMeta;
}): Promise<void> {
  const sb = createAdminClient();
  const { source, status, reason, payload, leadId, meta } = args;
  await sb.from("crm_lead_source_events").insert({
    source_id: source.id,
    workspace_id: source.workspace_id,
    status,
    reason: reason ?? null,
    payload: truncatePayload(payload),
    ip: meta?.ip ?? null,
    user_agent: meta?.userAgent ?? null,
    lead_id: leadId,
  });
  // Update lifecycle counters on the source row. Best-effort; if it
  // fails the event is already recorded so we don't block ingestion.
  if (status === "accepted" || status === "duplicate") {
    await sb
      .from("crm_lead_sources")
      .update({
        last_event_at: new Date().toISOString(),
        event_count: (source.event_count ?? 0) + 1,
      })
      .eq("id", source.id);
  }
}

async function createLeadFromMappedFields(args: {
  source: CrmLeadSource;
  fields: NormalizedLeadFields;
  rawPayload: unknown;
  meta?: IngestRequestMeta;
}): Promise<IngestResult> {
  const { source, fields, rawPayload, meta } = args;

  if (!source.active) {
    await logEvent({
      source,
      status: "rejected",
      reason: "source inactive",
      payload: rawPayload,
      leadId: null,
      meta,
    });
    return { status: "rejected", leadId: null, reason: "source inactive" };
  }

  // Soft validation — accept rows even with no email/phone (some
  // sources legitimately have neither, e.g. anonymous form submissions).
  // But a totally-empty row is rejected to keep the leads table clean.
  const hasAnyIdentity =
    fields.email || fields.phone || fields.first_name || fields.last_name;
  if (!hasAnyIdentity) {
    await logEvent({
      source,
      status: "rejected",
      reason: "empty payload",
      payload: rawPayload,
      leadId: null,
      meta,
    });
    return { status: "rejected", leadId: null, reason: "empty payload" };
  }

  const sourceLabel = source.config.sourceLabel || source.name;

  // Dedupe by email + source within 30d window.
  if (fields.email) {
    const dupId = await findRecentDuplicate(
      source.workspace_id,
      fields.email,
      sourceLabel
    );
    if (dupId) {
      await logEvent({
        source,
        status: "duplicate",
        reason: "matched existing lead",
        payload: rawPayload,
        leadId: dupId,
        meta,
      });
      return { status: "duplicate", leadId: dupId };
    }
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("crm_leads")
    .insert({
      workspace_id: source.workspace_id,
      first_name: fields.first_name,
      last_name: fields.last_name,
      email: fields.email,
      phone: fields.phone,
      source: sourceLabel,
      status: "new",
      notes: fields.notes,
      custom: fields.custom,
    })
    .select("id")
    .single();

  if (error || !data) {
    await logEvent({
      source,
      status: "error",
      reason: error?.message ?? "insert failed",
      payload: rawPayload,
      leadId: null,
      meta,
    });
    return {
      status: "error",
      leadId: null,
      reason: error?.message ?? "insert failed",
    };
  }

  const leadId = (data as { id: string }).id;
  await logEvent({
    source,
    status: "accepted",
    payload: rawPayload,
    leadId,
    meta,
  });
  return { status: "accepted", leadId };
}

// ── public API: webhook ────────────────────────────────────────────────

export async function ingestWebhookPayload(
  sourceId: string,
  payload: unknown,
  meta?: IngestRequestMeta
): Promise<IngestResult> {
  const source = await loadLeadSourceById(sourceId);
  if (!source) return { status: "rejected", leadId: null, reason: "source not found" };

  const obj: JsonRecord =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as JsonRecord)
      : { value: payload };

  const fields = normalizeWebhookPayload(obj);
  return createLeadFromMappedFields({
    source,
    fields,
    rawPayload: payload,
    meta,
  });
}

// ── public API: form ───────────────────────────────────────────────────

function fieldValueToString(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) {
    const joined = v.filter((x) => x.length > 0).join(", ");
    return joined.length > 0 ? joined : null;
  }
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export async function ingestFormSubmission(
  sourceId: string,
  fieldValues: Record<string, string | string[]>,
  meta?: IngestRequestMeta
): Promise<IngestResult> {
  const source = await loadLeadSourceById(sourceId);
  if (!source) return { status: "rejected", leadId: null, reason: "source not found" };
  if (source.kind !== "form") {
    return { status: "rejected", leadId: null, reason: "not a form source" };
  }

  const schema = source.config.fields ?? [];
  if (schema.length === 0) {
    return { status: "rejected", leadId: null, reason: "no form schema" };
  }

  const fields: NormalizedLeadFields = {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    notes: null,
    custom: {},
  };

  // Required-field check first — surface rejection cleanly.
  for (const f of schema) {
    if (f.required) {
      const v = fieldValueToString(fieldValues[f.key]);
      if (!v) {
        await logEvent({
          source,
          status: "rejected",
          reason: `missing required field: ${f.key}`,
          payload: fieldValues,
          leadId: null,
          meta,
        });
        return {
          status: "rejected",
          leadId: null,
          reason: `missing required field: ${f.key}`,
        };
      }
    }
  }

  for (const f of schema) {
    const value = fieldValueToString(fieldValues[f.key]);
    if (value === null) continue;
    applyFormField(fields, f, value);
  }

  return createLeadFromMappedFields({
    source,
    fields,
    rawPayload: fieldValues,
    meta,
  });
}

function applyFormField(
  fields: NormalizedLeadFields,
  field: LeadSourceFormField,
  value: string
): void {
  const m = field.mapping;
  if (typeof m === "object") {
    fields.custom[m.custom] = value;
    return;
  }
  switch (m) {
    case "first_name":
      fields.first_name = value;
      break;
    case "last_name":
      fields.last_name = value;
      break;
    case "name": {
      const { first_name, last_name } = splitName(value);
      fields.first_name = first_name;
      fields.last_name = last_name;
      break;
    }
    case "email":
      fields.email = value;
      break;
    case "phone":
      fields.phone = value;
      break;
    case "notes":
      fields.notes = value;
      break;
  }
}

// ── public API: csv ────────────────────────────────────────────────────

export async function ingestCsvRow(
  sourceId: string,
  row: Record<string, string>,
  meta?: IngestRequestMeta
): Promise<IngestResult> {
  const source = await loadLeadSourceById(sourceId);
  if (!source) return { status: "rejected", leadId: null, reason: "source not found" };
  if (source.kind !== "csv") {
    return { status: "rejected", leadId: null, reason: "not a csv source" };
  }
  const mapping = source.config.csvMapping?.columns;
  if (!mapping) {
    return {
      status: "rejected",
      leadId: null,
      reason: "csv mapping missing",
    };
  }

  const fields: NormalizedLeadFields = {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    notes: null,
    custom: {},
  };

  // Map known lead columns first.
  const leadCols = ["first_name", "last_name", "email", "phone", "notes"] as const;
  for (const col of leadCols) {
    const csvHeader = mapping[col];
    if (!csvHeader) continue;
    const v = (row[csvHeader] ?? "").trim();
    if (v) fields[col] = v;
  }

  // Combined "name" mapping, if used.
  if (!fields.first_name && !fields.last_name && mapping["name"]) {
    const v = (row[mapping["name"]] ?? "").trim();
    if (v) {
      const { first_name, last_name } = splitName(v);
      fields.first_name = first_name;
      fields.last_name = last_name;
    }
  }

  // Custom field mappings — keys of the form `custom.<key>` in the
  // mapping object. Anything else unknown is ignored.
  for (const [leadKey, csvHeader] of Object.entries(mapping)) {
    if (!leadKey.startsWith("custom.")) continue;
    const key = leadKey.slice("custom.".length);
    const v = (row[csvHeader] ?? "").trim();
    if (v) fields.custom[key] = v;
  }

  return createLeadFromMappedFields({
    source,
    fields,
    rawPayload: row,
    meta,
  });
}

// ── secret/slug generation (server-side helpers used by routes) ────────

/* base32 alphabet (Crockford-ish, no I/L/O/U for readability). 12 chars
 * gives ~57 bits of entropy — fine for a public path slug. */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function generateSlug(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i++) {
    s += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  }
  return s;
}

export function generateSecret(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i++) {
    s += buf[i].toString(16).padStart(2, "0");
  }
  return s;
}
