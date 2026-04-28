/* ─────────────────────────────────────────────────────────────────────────
 * CRM Boards API — zod request schemas.
 * Kept local to /api/crm/boards because the shared _schemas.ts file
 * belongs to the templates / lead-sources agents and we shouldn't touch it.
 * ───────────────────────────────────────────────────────────────────── */

import { z } from "zod";
import {
  BOARD_FIELD_TYPE_VALUES,
  BOARD_KIND_VALUES,
  BOARD_VIEW_TYPE_VALUES,
} from "@/app/tools/crm/_boards/types";

const uuid = z.string().uuid();
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3,8}$/, "expected hex color")
  .max(9);
const fieldKey = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, "snake_case lower");

const configJson = z.record(z.string(), z.unknown());
const dataJson = z.record(z.string(), z.unknown());

// ─── boards ─────────────────────────────────────────────────────────────

export const boardCreate = z.object({
  workspace_id: uuid,
  template_id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(BOARD_KIND_VALUES).optional(),
  icon: z.string().max(60).nullish(),
  color: hexColor.nullish(),
  description: z.string().max(2000).nullish(),
});

export const boardUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case")
    .optional(),
  description: z.string().max(2000).nullish(),
  icon: z.string().max(60).nullish(),
  color: hexColor.nullish(),
  position: z.number().int().optional(),
  archived_at: z.string().datetime().nullish(),
});

// ─── columns ────────────────────────────────────────────────────────────

export const columnCreate = z.object({
  field_key: fieldKey,
  label: z.string().min(1).max(120),
  field_type: z.enum(BOARD_FIELD_TYPE_VALUES),
  config: configJson.optional(),
  required: z.boolean().optional(),
  width: z.number().int().min(40).max(800).optional(),
  position: z.number().int().optional(),
});

export const columnUpdate = z.object({
  label: z.string().min(1).max(120).optional(),
  field_type: z.enum(BOARD_FIELD_TYPE_VALUES).optional(),
  config: configJson.optional(),
  required: z.boolean().optional(),
  width: z.number().int().min(40).max(800).optional(),
  position: z.number().int().optional(),
  archived_at: z.string().datetime().nullish(),
});

// ─── records ────────────────────────────────────────────────────────────

export const recordCreate = z.object({
  data: dataJson.optional(),
  position: z.number().int().optional(),
  parent_id: uuid.nullish(),
  assignee_ids: z.array(uuid).optional(),
});

export const recordUpdate = z.object({
  data: dataJson.optional(),
  position: z.number().int().optional(),
  parent_id: uuid.nullish(),
  assignee_ids: z.array(uuid).optional(),
});

export const recordReorder = z.object({
  ids: z.array(uuid).min(1).max(2000),
});

// ─── views ──────────────────────────────────────────────────────────────

export const viewCreate = z.object({
  name: z.string().min(1).max(120),
  view_type: z.enum(BOARD_VIEW_TYPE_VALUES),
  config: configJson.optional(),
  is_default: z.boolean().optional(),
  position: z.number().int().optional(),
});

export const viewUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  view_type: z.enum(BOARD_VIEW_TYPE_VALUES).optional(),
  config: configJson.optional(),
  is_default: z.boolean().optional(),
  position: z.number().int().optional(),
});
