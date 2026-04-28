/* ─────────────────────────────────────────────────────────────────────────
 * CRM template — types.
 *
 * A template is a *declarative* bundle of CRM seed data: pipelines + stages,
 * custom fields per record-type, tag sets, and optional sidebar/section
 * relabels (so a real-estate workspace shows "Properties" instead of
 * "Inventory" without changing routes or DB columns).
 *
 * Templates are pure data — no side effects, no I/O. The apply API route is
 * the only thing that turns a template into rows. Auto-applying when the
 * onboarding profession matches `matchProfessions` is fire-and-forget.
 *
 * The custom-field type vocabulary here is a *superset alias* over the DB's
 * accepted `crm_custom_fields.type` enum:
 *   - `currency` → stored as `currency`
 *   - `checkbox` → stored as `boolean`
 *   - `phone`, `email`, `textarea` → stored as `text` (the UI uses
 *     `key`/`label` heuristics to render appropriately)
 *
 * Mapping happens at the API boundary so template authors can describe
 * fields the way humans think about them. See `_templates/registry.ts`
 * for the actual templates.
 * ───────────────────────────────────────────────────────────────────── */

import type { CrmSection } from "../types";

export type TemplateFieldType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "checkbox"
  | "url"
  | "phone"
  | "email"
  | "select"
  | "multiselect"
  | "textarea";

export type TemplateRecordType =
  | "contact"
  | "company"
  | "deal"
  | "lead"
  | "inventory";

export interface TemplateStage {
  name: string;
  kind: "open" | "won" | "lost";
  /** 0..100 — used by forecast math when the deal sits in this stage. */
  probability: number;
  /** Days a deal can sit before being flagged stale. 0 = never. */
  rot_days: number;
  /** Tailwind-safe hex (e.g. `#0ea5e9`). */
  color: string;
}

export interface TemplatePipeline {
  name: string;
  is_default: boolean;
  stages: TemplateStage[];
}

export interface TemplateCustomField {
  record_type: TemplateRecordType;
  /** snake_case key used inside the row's `custom` jsonb. */
  field_key: string;
  label: string;
  field_type: TemplateFieldType;
  /** Only used by `select` / `multiselect` — option labels. */
  options?: string[];
  required?: boolean;
  sort_order?: number;
}

export interface TemplateTag {
  name: string;
  /** Tailwind hex or named color — passed straight into `crm_tags.color`. */
  color: string;
}

export interface CrmTemplate {
  id: string;
  name: string;
  description: string;
  /** Profession ids from onboarding that should auto-apply this template. */
  matchProfessions: string[];
  /** Per-section label overrides (sidebar + view header). Optional. */
  sectionLabels?: Partial<Record<CrmSection, string>>;
  pipelines: TemplatePipeline[];
  customFields: TemplateCustomField[];
  tags: TemplateTag[];
  /**
   * Optional override of the inventory status enum. v1 keeps the existing
   * enum so leaving this off is the right call for both shipped templates;
   * the field exists so future templates can opt-in once the DB-side enum
   * grows or moves to a free-form text column.
   */
  inventoryStatuses?: string[];
}

/* ─── shared CRM section keys (re-export) ────────────────────────────── */
export type { CrmSection };
