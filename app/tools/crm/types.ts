/* ─────────────────────────────────────────────────────────────────────────
 * CRM — shared TypeScript types.
 * Mirrors the SQL schema in 20260428_crm_foundation.sql exactly. Phase 2
 * agents (Pipeline UI, Records UI, Activities/Custom Fields/Permissions)
 * import everything from here so column names + check-constraint enums stay
 * in lockstep across the surface.
 *
 * Conventions
 * ───────────
 * - DB rows use snake_case (`first_name`, `workspace_id`) — types match.
 * - Server-action input/output payloads also use snake_case to keep the
 *   server-data layer 1:1 with the table; it's the UI's job to label.
 * - Discriminated unions: activity (`kind`), custom field (`type`),
 *   saved view (`record_type` + `config.layout`), lead (`status`),
 *   deal (`status`).
 * ───────────────────────────────────────────────────────────────────── */

// ─── enums (mirroring DB check constraints) ─────────────────────────────

export const VISIBILITY_VALUES = [
  "public",
  "team",
  "assigned",
  "owner",
] as const;
export type CrmVisibility = (typeof VISIBILITY_VALUES)[number];

export const RECORD_TYPE_VALUES = [
  "contact",
  "company",
  "deal",
  "lead",
  "inventory",
] as const;
export type CrmRecordType = (typeof RECORD_TYPE_VALUES)[number];

export const RECORD_TYPE_VALUES_WITH_ACTIVITY = [
  ...RECORD_TYPE_VALUES,
  "activity",
] as const;
export type CrmSavedViewRecordType =
  (typeof RECORD_TYPE_VALUES_WITH_ACTIVITY)[number];

export const STAGE_KIND_VALUES = ["open", "won", "lost"] as const;
export type CrmStageKind = (typeof STAGE_KIND_VALUES)[number];

export const DEAL_STATUS_VALUES = ["open", "won", "lost"] as const;
export type CrmDealStatus = (typeof DEAL_STATUS_VALUES)[number];

export const LEAD_STATUS_VALUES = [
  "new",
  "working",
  "qualified",
  "disqualified",
  "converted",
] as const;
export type CrmLeadStatus = (typeof LEAD_STATUS_VALUES)[number];

export const ACTIVITY_KIND_VALUES = [
  "task",
  "call",
  "meeting",
  "email",
  "note",
  "sms",
] as const;
export type CrmActivityKind = (typeof ACTIVITY_KIND_VALUES)[number];

export const INVENTORY_STATUS_VALUES = [
  "active",
  "inactive",
  "archived",
] as const;
export type CrmInventoryStatus = (typeof INVENTORY_STATUS_VALUES)[number];

export const CUSTOM_FIELD_TYPE_VALUES = [
  "text",
  "number",
  "select",
  "multiselect",
  "date",
  "currency",
  "url",
  "user",
  "file",
  "boolean",
] as const;
export type CrmCustomFieldType = (typeof CUSTOM_FIELD_TYPE_VALUES)[number];

// ─── jsonb shapes ────────────────────────────────────────────────────────

/** `crm_*` table `custom` jsonb column — keys are `crm_custom_fields.key`. */
export type CrmCustomValues = Record<string, unknown>;

/** Each option in `crm_custom_fields.options` (only used for select/multiselect). */
export interface CrmCustomFieldOption {
  value: string;
  label: string;
  color?: string;
}

/** Saved-view filter primitive. Phase 2 builds the filter UI on this. */
export interface CrmSavedViewFilter {
  /** Either a column name (`amount`, `stage_id`) or `custom.<key>`. */
  field: string;
  op:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "nin"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "is_null"
    | "is_not_null";
  value?: unknown;
}

export interface CrmSavedViewSort {
  field: string;
  direction: "asc" | "desc";
}

export type CrmSavedViewLayout = "table" | "kanban" | "card" | "timeline";

export interface CrmSavedViewConfig {
  filters?: CrmSavedViewFilter[];
  sort?: CrmSavedViewSort[];
  /** Ordered visible column keys (table layout). */
  columns?: string[];
  layout?: CrmSavedViewLayout;
  /** For kanban: which field to bucket by (e.g. `stage_id`, `status`). */
  groupBy?: string;
  /** Free-form search text persisted with the view. */
  search?: string;
}

// ─── row types — one per table ───────────────────────────────────────────

export interface CrmPipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  position: number;
  created_at: string;
}

export interface CrmPipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  kind: CrmStageKind;
  position: number;
  /** Days a deal can sit in this stage before being flagged stale. Null = never. */
  rot_days: number | null;
  /** 0–100. */
  probability: number;
  color: string | null;
  created_at: string;
}

export interface CrmCompany {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  visibility: CrmVisibility;
  owner_id: string | null;
  custom: CrmCustomValues;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmContact {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_id: string | null;
  notes: string | null;
  visibility: CrmVisibility;
  owner_id: string | null;
  custom: CrmCustomValues;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmDeal {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  amount: number | null;
  currency: string;
  close_date: string | null; // ISO date (yyyy-mm-dd)
  primary_contact_id: string | null;
  company_id: string | null;
  assignee_ids: string[];
  position: number;
  visibility: CrmVisibility;
  owner_id: string | null;
  status: CrmDealStatus;
  custom: CrmCustomValues;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface CrmLead {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: CrmLeadStatus;
  notes: string | null;
  converted_contact_id: string | null;
  converted_deal_id: string | null;
  visibility: CrmVisibility;
  owner_id: string | null;
  custom: CrmCustomValues;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── activities — discriminated union by `kind` ──────────────────────────

interface CrmActivityBase {
  id: string;
  workspace_id: string;
  subject: string | null;
  body: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  lead_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  email_from: string | null;
  email_to: string[] | null;
  assignee_ids: string[];
  attachment_ids: string[];
  custom: CrmCustomValues;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmActivityTask extends CrmActivityBase {
  kind: "task";
}
export interface CrmActivityCall extends CrmActivityBase {
  kind: "call";
}
export interface CrmActivityMeeting extends CrmActivityBase {
  kind: "meeting";
}
export interface CrmActivityEmail extends CrmActivityBase {
  kind: "email";
}
export interface CrmActivityNote extends CrmActivityBase {
  kind: "note";
}
export interface CrmActivitySms extends CrmActivityBase {
  kind: "sms";
}

export type CrmActivity =
  | CrmActivityTask
  | CrmActivityCall
  | CrmActivityMeeting
  | CrmActivityEmail
  | CrmActivityNote
  | CrmActivitySms;

export interface CrmInventoryItem {
  id: string;
  workspace_id: string;
  sku: string | null;
  name: string;
  category: string | null;
  price: number | null;
  currency: string;
  cost: number | null;
  quantity: number | null;
  unit: string | null;
  status: CrmInventoryStatus;
  description: string | null;
  image_id: string | null;
  visibility: CrmVisibility;
  owner_id: string | null;
  custom: CrmCustomValues;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmTag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CrmRecordTag {
  workspace_id: string;
  tag_id: string;
  record_type: CrmRecordType;
  record_id: string;
}

// ── custom fields — discriminated by `type` for option/default shape ────

interface CrmCustomFieldBase {
  id: string;
  workspace_id: string;
  record_type: CrmRecordType;
  key: string;
  label: string;
  required: boolean;
  position: number;
  created_at: string;
}

export interface CrmCustomFieldText extends CrmCustomFieldBase {
  type: "text" | "url";
  options: never[];
  default_value: string | null;
}
export interface CrmCustomFieldNumber extends CrmCustomFieldBase {
  type: "number" | "currency";
  options: never[];
  default_value: number | null;
}
export interface CrmCustomFieldSelect extends CrmCustomFieldBase {
  type: "select";
  options: CrmCustomFieldOption[];
  default_value: string | null;
}
export interface CrmCustomFieldMultiselect extends CrmCustomFieldBase {
  type: "multiselect";
  options: CrmCustomFieldOption[];
  default_value: string[] | null;
}
export interface CrmCustomFieldDate extends CrmCustomFieldBase {
  type: "date";
  options: never[];
  default_value: string | null;
}
export interface CrmCustomFieldUser extends CrmCustomFieldBase {
  type: "user";
  options: never[];
  default_value: string | null;
}
export interface CrmCustomFieldFile extends CrmCustomFieldBase {
  type: "file";
  options: never[];
  default_value: string | null;
}
export interface CrmCustomFieldBoolean extends CrmCustomFieldBase {
  type: "boolean";
  options: never[];
  default_value: boolean | null;
}

export type CrmCustomField =
  | CrmCustomFieldText
  | CrmCustomFieldNumber
  | CrmCustomFieldSelect
  | CrmCustomFieldMultiselect
  | CrmCustomFieldDate
  | CrmCustomFieldUser
  | CrmCustomFieldFile
  | CrmCustomFieldBoolean;

export interface CrmSavedView {
  id: string;
  workspace_id: string;
  user_id: string;
  record_type: CrmSavedViewRecordType;
  name: string;
  config: CrmSavedViewConfig;
  is_pinned: boolean;
  created_at: string;
}

// ─── joined / hydrated shapes used by data helpers ──────────────────────

export interface CrmDealWithRelations extends CrmDeal {
  company?: CrmCompany | null;
  primary_contact?: CrmContact | null;
  stage?: CrmPipelineStage | null;
  tags?: CrmTag[];
}

export interface CrmContactWithRelations extends CrmContact {
  company?: CrmCompany | null;
  tags?: CrmTag[];
}

export interface CrmCompanyWithRelations extends CrmCompany {
  tags?: CrmTag[];
}

export interface CrmLeadWithRelations extends CrmLead {
  tags?: CrmTag[];
}

export interface CrmInventoryItemWithRelations extends CrmInventoryItem {
  tags?: CrmTag[];
}

export interface CrmPipelineWithStages extends CrmPipeline {
  stages: CrmPipelineStage[];
}

// ─── input payloads (server-action body shapes) ─────────────────────────

/** Fields an admin can pass when creating a contact. */
export interface CrmContactInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  company_id?: string | null;
  notes?: string | null;
  visibility?: CrmVisibility;
  owner_id?: string | null;
  custom?: CrmCustomValues;
}

export interface CrmCompanyInput {
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  visibility?: CrmVisibility;
  owner_id?: string | null;
  custom?: CrmCustomValues;
}

export interface CrmDealInput {
  name: string;
  pipeline_id?: string | null;
  stage_id?: string | null;
  amount?: number | null;
  currency?: string;
  close_date?: string | null;
  primary_contact_id?: string | null;
  company_id?: string | null;
  assignee_ids?: string[];
  position?: number;
  visibility?: CrmVisibility;
  owner_id?: string | null;
  status?: CrmDealStatus;
  custom?: CrmCustomValues;
}

export interface CrmLeadInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: CrmLeadStatus;
  notes?: string | null;
  visibility?: CrmVisibility;
  owner_id?: string | null;
  custom?: CrmCustomValues;
}

export interface CrmActivityInput {
  kind: CrmActivityKind;
  subject?: string | null;
  body?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
  lead_id?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  email_from?: string | null;
  email_to?: string[] | null;
  assignee_ids?: string[];
  attachment_ids?: string[];
  custom?: CrmCustomValues;
}

export interface CrmInventoryInput {
  name: string;
  sku?: string | null;
  category?: string | null;
  price?: number | null;
  currency?: string;
  cost?: number | null;
  quantity?: number | null;
  unit?: string | null;
  status?: CrmInventoryStatus;
  description?: string | null;
  image_id?: string | null;
  visibility?: CrmVisibility;
  owner_id?: string | null;
  custom?: CrmCustomValues;
}

export interface CrmCustomFieldInput {
  record_type: CrmRecordType;
  key: string;
  label: string;
  type: CrmCustomFieldType;
  options?: CrmCustomFieldOption[];
  required?: boolean;
  position?: number;
  default_value?: unknown;
}

export interface CrmSavedViewInput {
  record_type: CrmSavedViewRecordType;
  name: string;
  config?: CrmSavedViewConfig;
  is_pinned?: boolean;
}

export interface CrmTagInput {
  name: string;
  color?: string;
}

// ─── list-query option shapes ───────────────────────────────────────────

export interface CrmListOpts {
  limit?: number;
  cursor?: string;
  search?: string;
  ownerId?: string;
}

export interface CrmDealListOpts extends CrmListOpts {
  pipelineId?: string;
  stageId?: string;
  status?: CrmDealStatus;
}

export interface CrmLeadListOpts extends CrmListOpts {
  status?: CrmLeadStatus;
}

export interface CrmInventoryListOpts extends CrmListOpts {
  status?: CrmInventoryStatus;
  category?: string;
}

export interface CrmActivityListOpts {
  contactId?: string;
  companyId?: string;
  dealId?: string;
  leadId?: string;
  kind?: CrmActivityKind;
  /** true = show only completed; false = only open; undefined = both. */
  completed?: boolean;
  limit?: number;
  cursor?: string;
}

// ─── shell / nav state (Phase 2 reads + writes this) ────────────────────

export const CRM_SECTIONS = [
  "pipeline",
  "deals",
  "leads",
  "contacts",
  "companies",
  "inventory",
  "boards",
  "activities",
  "templates",
  "reminders",
  "territories",
  "forms",
  "reports",
  "settings",
] as const;

export type CrmSection = (typeof CRM_SECTIONS)[number];

export interface CrmSectionMeta {
  key: CrmSection;
  label: string;
  /** TOOL_ICONS key — kept loose so Phase 2 may swap. */
  icon: string;
}
