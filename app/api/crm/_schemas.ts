/* ─────────────────────────────────────────────────────────────────────────
 * CRM API — zod request schemas.
 * One schema per entity, plus the shared "core" fields. Keeps validation
 * close to the contract defined in app/tools/crm/types.ts.
 * ───────────────────────────────────────────────────────────────────── */

import { z } from "zod";
import {
  ACTIVITY_KIND_VALUES,
  CUSTOM_FIELD_TYPE_VALUES,
  DEAL_STATUS_VALUES,
  INVENTORY_STATUS_VALUES,
  LEAD_STATUS_VALUES,
  RECORD_TYPE_VALUES,
  RECORD_TYPE_VALUES_WITH_ACTIVITY,
  VISIBILITY_VALUES,
} from "@/app/tools/crm/types";

const uuid = z.string().uuid();
const visibility = z.enum(VISIBILITY_VALUES);
const customJson = z.record(z.string(), z.unknown());

// ─── companies ──────────────────────────────────────────────────────────

export const companyCreate = z.object({
  workspace_id: uuid,
  name: z.string().min(1).max(200),
  domain: z.string().max(200).nullish(),
  industry: z.string().max(120).nullish(),
  size: z.string().max(40).nullish(),
  phone: z.string().max(60).nullish(),
  website: z.string().max(400).nullish(),
  address: z.string().max(400).nullish(),
  city: z.string().max(120).nullish(),
  country: z.string().max(120).nullish(),
  notes: z.string().nullish(),
  visibility: visibility.optional(),
  owner_id: uuid.nullish(),
  custom: customJson.optional(),
});

export const companyUpdate = companyCreate
  .partial()
  .omit({ workspace_id: true });

// ─── contacts ───────────────────────────────────────────────────────────

export const contactCreate = z.object({
  workspace_id: uuid,
  first_name: z.string().max(120).nullish(),
  last_name: z.string().max(120).nullish(),
  email: z.string().email().max(320).nullish(),
  phone: z.string().max(60).nullish(),
  job_title: z.string().max(200).nullish(),
  company_id: uuid.nullish(),
  notes: z.string().nullish(),
  visibility: visibility.optional(),
  owner_id: uuid.nullish(),
  custom: customJson.optional(),
});

export const contactUpdate = contactCreate
  .partial()
  .omit({ workspace_id: true });

// ─── deals ──────────────────────────────────────────────────────────────

export const dealCreate = z.object({
  workspace_id: uuid,
  name: z.string().min(1).max(200),
  pipeline_id: uuid.nullish(),
  stage_id: uuid.nullish(),
  amount: z.number().nullish(),
  currency: z.string().length(3).optional(),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-mm-dd")
    .nullish(),
  primary_contact_id: uuid.nullish(),
  company_id: uuid.nullish(),
  assignee_ids: z.array(uuid).optional(),
  position: z.number().int().optional(),
  visibility: visibility.optional(),
  owner_id: uuid.nullish(),
  status: z.enum(DEAL_STATUS_VALUES).optional(),
  custom: customJson.optional(),
});

export const dealUpdate = dealCreate.partial().omit({ workspace_id: true });

export const dealMove = z.object({
  id: uuid,
  stage_id: uuid,
  position: z.number().int().nonnegative(),
});

// ─── leads ──────────────────────────────────────────────────────────────

export const leadCreate = z.object({
  workspace_id: uuid,
  first_name: z.string().max(120).nullish(),
  last_name: z.string().max(120).nullish(),
  email: z.string().email().max(320).nullish(),
  phone: z.string().max(60).nullish(),
  source: z.string().max(120).nullish(),
  status: z.enum(LEAD_STATUS_VALUES).optional(),
  notes: z.string().nullish(),
  visibility: visibility.optional(),
  owner_id: uuid.nullish(),
  custom: customJson.optional(),
});

export const leadUpdate = leadCreate.partial().omit({ workspace_id: true });

export const leadConvert = z.object({
  id: uuid,
  dealName: z.string().min(1).max(200),
  dealAmount: z.number().nullish(),
  dealCurrency: z.string().length(3).optional(),
  closeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

// ─── activities ─────────────────────────────────────────────────────────

export const activityCreate = z.object({
  workspace_id: uuid,
  kind: z.enum(ACTIVITY_KIND_VALUES),
  subject: z.string().max(400).nullish(),
  body: z.string().nullish(),
  contact_id: uuid.nullish(),
  company_id: uuid.nullish(),
  deal_id: uuid.nullish(),
  lead_id: uuid.nullish(),
  due_at: z.string().datetime().nullish(),
  completed_at: z.string().datetime().nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  email_from: z.string().max(320).nullish(),
  email_to: z.array(z.string().max(320)).nullish(),
  assignee_ids: z.array(uuid).optional(),
  attachment_ids: z.array(uuid).optional(),
  custom: customJson.optional(),
});

export const activityUpdate = activityCreate
  .partial()
  .omit({ workspace_id: true });

// ─── inventory ──────────────────────────────────────────────────────────

export const inventoryCreate = z.object({
  workspace_id: uuid,
  name: z.string().min(1).max(200),
  sku: z.string().max(120).nullish(),
  category: z.string().max(120).nullish(),
  price: z.number().nullish(),
  currency: z.string().length(3).optional(),
  cost: z.number().nullish(),
  quantity: z.number().nullish(),
  unit: z.string().max(40).nullish(),
  status: z.enum(INVENTORY_STATUS_VALUES).optional(),
  description: z.string().nullish(),
  image_id: uuid.nullish(),
  visibility: visibility.optional(),
  owner_id: uuid.nullish(),
  custom: customJson.optional(),
});

export const inventoryUpdate = inventoryCreate
  .partial()
  .omit({ workspace_id: true });

// ─── tags ───────────────────────────────────────────────────────────────

export const tagCreate = z.object({
  workspace_id: uuid,
  name: z.string().min(1).max(80),
  color: z.string().max(40).optional(),
});

export const tagUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(40).optional(),
});

export const recordTagAttach = z.object({
  workspace_id: uuid,
  tag_id: uuid,
  record_type: z.enum(RECORD_TYPE_VALUES),
  record_id: uuid,
});

// ─── custom fields ──────────────────────────────────────────────────────

export const customFieldOption = z.object({
  value: z.string(),
  label: z.string(),
  color: z.string().optional(),
});

export const customFieldCreate = z.object({
  workspace_id: uuid,
  record_type: z.enum(RECORD_TYPE_VALUES),
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "snake_case lower"),
  label: z.string().min(1).max(120),
  type: z.enum(CUSTOM_FIELD_TYPE_VALUES),
  options: z.array(customFieldOption).optional(),
  required: z.boolean().optional(),
  position: z.number().int().optional(),
  default_value: z.unknown().optional(),
});

export const customFieldUpdate = customFieldCreate
  .partial()
  .omit({ workspace_id: true, record_type: true, key: true });

// ─── saved views ────────────────────────────────────────────────────────

export const savedViewCreate = z.object({
  workspace_id: uuid,
  record_type: z.enum(RECORD_TYPE_VALUES_WITH_ACTIVITY),
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).optional(),
  is_pinned: z.boolean().optional(),
});

export const savedViewUpdate = savedViewCreate
  .partial()
  .omit({ workspace_id: true, record_type: true });

// ─── pipelines + stages ─────────────────────────────────────────────────

export const pipelineCreate = z.object({
  workspace_id: uuid,
  name: z.string().min(1).max(120),
  is_default: z.boolean().optional(),
  position: z.number().int().optional(),
});

export const pipelineUpdate = pipelineCreate
  .partial()
  .omit({ workspace_id: true });

export const stageCreate = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["open", "won", "lost"]).optional(),
  position: z.number().int().optional(),
  rot_days: z.number().int().nullish(),
  probability: z.number().int().min(0).max(100).optional(),
  color: z.string().max(40).nullish(),
});

export const stageUpdate = stageCreate.partial();
