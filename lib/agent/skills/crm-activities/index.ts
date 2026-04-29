/* CRM activities skill — tasks, calls, meetings, emails. */

import { clampList, toolError, toolOk } from "../_helpers";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const SELECT =
  "id, kind, subject, body, contact_id, company_id, deal_id, lead_id, due_at, completed_at, created_at";

const list_activities: ToolDefinition = {
  name: "list_activities",
  description:
    "List recent activities. Filters: kind (task/call/meeting/email/note), completed (boolean), due_within_days.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string" },
      completed: { type: "boolean" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { kind, completed, limit } = input as {
      kind?: string;
      completed?: boolean;
      limit?: number;
    };
    let q = ctx.supabase
      .from("crm_activities")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId);
    if (kind) q = q.eq("kind", kind);
    if (typeof completed === "boolean") {
      q = completed
        ? q.not("completed_at", "is", null)
        : q.is("completed_at", null);
    }
    const { data, error } = await q
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(Math.min(limit ?? 25, 50));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const create_activity: ToolDefinition = {
  name: "create_activity",
  description:
    "Create a new activity (task, call, meeting, email, or note). Attach to a contact, company, deal, or lead.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["task", "call", "meeting", "email", "note"],
      },
      subject: { type: "string" },
      body: { type: "string" },
      contact_id: { type: "string" },
      company_id: { type: "string" },
      deal_id: { type: "string" },
      lead_id: { type: "string" },
      due_at: { type: "string", description: "ISO timestamp" },
    },
    required: ["kind"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const fields = input as Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_activities")
      .insert({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        ...fields,
      })
      .select("*")
      .single();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

const complete_activity: ToolDefinition = {
  name: "complete_activity",
  description: "Mark an activity as completed.",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id } = input as { id: string };
    const { data, error } = await ctx.supabase
      .from("crm_activities")
      .update({ completed_at: new Date().toISOString() })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

const reschedule_activity: ToolDefinition = {
  name: "reschedule_activity",
  description: "Change the due_at timestamp on an activity.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      due_at: { type: "string", description: "ISO timestamp" },
    },
    required: ["id", "due_at"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, due_at } = input as { id: string; due_at: string };
    const { data, error } = await ctx.supabase
      .from("crm_activities")
      .update({ due_at })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

export const crmActivitiesSkill: SkillDefinition = {
  id: "crm.activities",
  label: "CRM Activities",
  description: "Track tasks, calls, meetings, emails, and notes.",
  systemFragment:
    "Activities can be standalone or linked to a contact/company/deal/lead. When the user says 'schedule a call with X', look up X first, then create_activity with kind='call' and the contact_id.",
  tools: [list_activities, create_activity, complete_activity, reschedule_activity],
};
