import { z } from "zod";

import { TASK_PRIORITIES, PROJECT_STATUSES } from "./types";

/**
 * Zod schemas for the Tasks/Projects routes. Kept tiny + explicit — we
 * don't want validation-layer leakage between the AI tool path and the
 * REST route path. Each shape parses an unknown JSON body into a
 * minimal, typed payload.
 */

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "invalid ISO datetime",
  });

export const TaskCreateSchema = z.object({
  workspace_id: uuid,
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).optional().nullable(),
  project_id: uuid.optional().nullable(),
  parent_task_id: uuid.optional().nullable(),
  status: z.string().min(1).max(40).optional(),
  priority: z.enum(TASK_PRIORITIES as unknown as [string, ...string[]]).optional(),
  assignee_ids: z.array(uuid).max(50).optional(),
  due_at: isoDate.optional().nullable(),
  start_at: isoDate.optional().nullable(),
  estimate_min: z.number().int().min(0).max(100_000).optional().nullable(),
});

export const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20_000).optional().nullable(),
  project_id: uuid.optional().nullable(),
  parent_task_id: uuid.optional().nullable(),
  status: z.string().min(1).max(40).optional(),
  priority: z.enum(TASK_PRIORITIES as unknown as [string, ...string[]]).optional(),
  assignee_ids: z.array(uuid).max(50).optional(),
  due_at: isoDate.optional().nullable(),
  start_at: isoDate.optional().nullable(),
  estimate_min: z.number().int().min(0).max(100_000).optional().nullable(),
  actual_min: z.number().int().min(0).max(100_000).optional().nullable(),
});

export const TaskBulkStatusSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  status: z.string().min(1).max(40),
});

export const ProjectCreateSchema = z.object({
  workspace_id: uuid,
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/, {
      message: "slug must be lowercase, kebab-case",
    }),
  description: z.string().max(20_000).optional().nullable(),
  status: z
    .enum(PROJECT_STATUSES as unknown as [string, ...string[]])
    .optional(),
  status_schema: z.array(z.string().min(1).max(40)).min(1).max(20).optional(),
  color: z.string().max(20).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/, {
      message: "slug must be lowercase, kebab-case",
    })
    .optional(),
  description: z.string().max(20_000).optional().nullable(),
  status: z
    .enum(PROJECT_STATUSES as unknown as [string, ...string[]])
    .optional(),
  status_schema: z.array(z.string().min(1).max(40)).min(1).max(20).optional(),
  color: z.string().max(20).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
});

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type TaskBulkStatusInput = z.infer<typeof TaskBulkStatusSchema>;
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
