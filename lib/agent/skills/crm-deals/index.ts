/* CRM deals skill — pipeline management. */

import { clampList, runQuery, toolError, toolOk } from "../_helpers";
import { indexDeal } from "@/lib/crm/search-index";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const SELECT =
  "id, name, amount, currency, status, pipeline_id, stage_id, primary_contact_id, company_id, close_date, created_at";

const list_deals: ToolDefinition = {
  name: "list_deals",
  description:
    "List recent deals. Optionally filter by status (open/won/lost) or pipeline_id.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["open", "won", "lost"] },
      pipeline_id: { type: "string" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { status, pipeline_id, limit } = input as {
      status?: string;
      pipeline_id?: string;
      limit?: number;
    };
    let q = ctx.supabase
      .from("crm_deals")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId);
    if (status) q = q.eq("status", status);
    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 50));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const search_deals: ToolDefinition = {
  name: "search_deals",
  description: "Search deals by name (substring match).",
  input_schema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { query } = input as { query: string };
    const q = query.trim();
    if (!q) return toolOk([]);
    const { data, error } = await ctx.supabase
      .from("crm_deals")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .ilike("name", `%${q}%`)
      .limit(25);
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const get_deal: ToolDefinition = {
  name: "get_deal",
  description: "Get a single deal by id.",
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
        .from("crm_deals")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle()
    );
  },
};

const create_deal: ToolDefinition = {
  name: "create_deal",
  description: "Create a new deal in the pipeline.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string", description: "ISO 4217 code, e.g. USD" },
      pipeline_id: { type: "string" },
      stage_id: { type: "string" },
      primary_contact_id: { type: "string" },
      company_id: { type: "string" },
      close_date: { type: "string", description: "YYYY-MM-DD" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const fields = input as Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_deals")
      .insert({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        ...fields,
      })
      .select("*")
      .single();
    if (error) return toolError(error.message);
    await indexDeal(data);
    return toolOk(data);
  },
};

const update_deal: ToolDefinition = {
  name: "update_deal",
  description: "Update an existing deal's fields.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      close_date: { type: "string" },
      primary_contact_id: { type: "string" },
      company_id: { type: "string" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, ...patch } = input as { id: string } & Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_deals")
      .update(patch)
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    if (data) await indexDeal(data);
    return toolOk(data);
  },
};

const move_deal_stage: ToolDefinition = {
  name: "move_deal_stage",
  description: "Move a deal to a different pipeline stage.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      stage_id: { type: "string" },
    },
    required: ["id", "stage_id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, stage_id } = input as { id: string; stage_id: string };
    const { data, error } = await ctx.supabase
      .from("crm_deals")
      .update({ stage_id })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    if (data) await indexDeal(data);
    return toolOk(data);
  },
};

const close_deal_won: ToolDefinition = {
  name: "close_deal_won",
  description: "Mark a deal as closed-won.",
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
      .from("crm_deals")
      .update({ status: "won" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    if (data) await indexDeal(data);
    return toolOk(data);
  },
};

const close_deal_lost: ToolDefinition = {
  name: "close_deal_lost",
  description: "Mark a deal as closed-lost.",
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
      .from("crm_deals")
      .update({ status: "lost" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    if (data) await indexDeal(data);
    return toolOk(data);
  },
};

export const crmDealsSkill: SkillDefinition = {
  id: "crm.deals",
  label: "CRM Deals",
  description: "Manage pipeline deals — create, move stages, win/lose.",
  systemFragment:
    "When showing a 'pipeline', list deals with status='open' grouped by stage. Confirm the win/lose action when amount is large or the deal status would change.",
  tools: [
    list_deals,
    search_deals,
    get_deal,
    create_deal,
    update_deal,
    move_deal_stage,
    close_deal_won,
    close_deal_lost,
  ],
};
