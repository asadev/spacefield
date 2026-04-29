/* CRM contacts skill. */

import { clampList, runQuery, toolError, toolOk } from "../_helpers";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const SELECT =
  "id, first_name, last_name, email, phone, job_title, company_id, created_at";

const list_contacts: ToolDefinition = {
  name: "list_contacts",
  description: "List the most recent contacts in the workspace's CRM.",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max items, default 25" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { limit } = input as { limit?: number };
    const { data, error } = await ctx.supabase
      .from("crm_contacts")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 50));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const search_contacts: ToolDefinition = {
  name: "search_contacts",
  description:
    "Search contacts by name or email. Substring match on first_name, last_name, email.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search string" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { query } = input as { query: string };
    const q = query.trim();
    if (!q) return toolOk([]);
    const { data, error } = await ctx.supabase
      .from("crm_contacts")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`
      )
      .limit(25);
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const get_contact: ToolDefinition = {
  name: "get_contact",
  description: "Get a single contact by id.",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { id } = input as { id: string };
    return runQuery(
      ctx.supabase
        .from("crm_contacts")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle()
    );
  },
};

const create_contact: ToolDefinition = {
  name: "create_contact",
  description: "Create a new contact.",
  input_schema: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      job_title: { type: "string" },
      company_id: { type: "string" },
      notes: { type: "string" },
    },
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const fields = input as Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_contacts")
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

const update_contact: ToolDefinition = {
  name: "update_contact",
  description: "Update an existing contact's fields.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      job_title: { type: "string" },
      company_id: { type: "string" },
      notes: { type: "string" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, ...patch } = input as { id: string } & Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_contacts")
      .update(patch)
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

const delete_contact: ToolDefinition = {
  name: "delete_contact",
  description: "Permanently delete a contact.",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id } = input as { id: string };
    const { error } = await ctx.supabase
      .from("crm_contacts")
      .delete()
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id);
    if (error) return toolError(error.message);
    return toolOk({ deleted: id });
  },
};

export const crmContactsSkill: SkillDefinition = {
  id: "crm.contacts",
  label: "CRM Contacts",
  description: "Read and manage CRM contacts (people).",
  systemFragment:
    "When the user asks about a person, prefer search_contacts over listing everything. Confirm before deleting.",
  tools: [
    list_contacts,
    search_contacts,
    get_contact,
    create_contact,
    update_contact,
    delete_contact,
  ],
};
