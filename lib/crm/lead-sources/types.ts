/* ─────────────────────────────────────────────────────────────────────────
 * Lead-source ingestion — shared TypeScript types.
 *
 * Mirrors the SQL in 20260428_crm_lead_sources.sql exactly. v1 builds the
 * three universal connectors (webhook / form / csv); the rest of the
 * `kind` enum is reserved for Phase 5 provider connectors so the schema
 * + UI can ship "Coming soon" cards now without another migration.
 * ───────────────────────────────────────────────────────────────────── */

export const LEAD_SOURCE_KIND_VALUES = [
  "webhook",
  "form",
  "csv",
  "meta",
  "google",
  "mailchimp",
  "calendly",
  "typeform",
  "tally",
  "linkedin",
  "tiktok",
  "whatsapp",
  "intercom",
] as const;
export type LeadSourceKind = (typeof LEAD_SOURCE_KIND_VALUES)[number];

export const LEAD_SOURCE_AVAILABLE_KINDS: readonly LeadSourceKind[] = [
  "webhook",
  "form",
  "csv",
];

export const LEAD_SOURCE_EVENT_STATUS_VALUES = [
  "accepted",
  "rejected",
  "duplicate",
  "error",
] as const;
export type LeadSourceEventStatus =
  (typeof LEAD_SOURCE_EVENT_STATUS_VALUES)[number];

/** A single field declaration in a hosted form's `config.fields` array. */
export interface LeadSourceFormField {
  /** Stable key — also the form input name. snake_case. */
  key: string;
  /** Lead column this field maps to, or `custom.<key>` for jsonb. */
  mapping:
    | "first_name"
    | "last_name"
    | "name"
    | "email"
    | "phone"
    | "notes"
    | { custom: string };
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required: boolean;
  /** For type=select. */
  options?: string[];
  placeholder?: string;
}

/** CSV → lead-column mapping captured at import time. */
export interface LeadSourceCsvMapping {
  /** Map of lead column / `custom.<key>` → CSV header name. */
  columns: Record<string, string>;
}

/** Per-kind config envelope persisted in `crm_lead_sources.config`. */
export interface LeadSourceConfig {
  /** Hosted-form field schema. Only present when kind === 'form'. */
  fields?: LeadSourceFormField[];
  /** CSV column mapping. Only present when kind === 'csv'. */
  csvMapping?: LeadSourceCsvMapping;
  /** For form: the heading/intro shown above the form. Optional. */
  formHeading?: string;
  formSubheading?: string;
  /** For form: text shown after a successful submission. */
  formThankYou?: string;
  /** Default lead source label written into `crm_leads.source`. */
  sourceLabel?: string;
}

export interface CrmLeadSource {
  id: string;
  workspace_id: string;
  kind: LeadSourceKind;
  name: string;
  slug: string;
  secret: string;
  config: LeadSourceConfig;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
  event_count: number;
}

export interface CrmLeadSourceEvent {
  id: string;
  source_id: string;
  workspace_id: string;
  status: LeadSourceEventStatus;
  reason: string | null;
  payload: unknown;
  ip: string | null;
  user_agent: string | null;
  lead_id: string | null;
  created_at: string;
}

export interface IngestResult {
  status: LeadSourceEventStatus;
  leadId: string | null;
  reason?: string;
}

export interface NormalizedLeadFields {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  custom: Record<string, unknown>;
}
