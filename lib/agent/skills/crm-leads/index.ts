/* CRM leads skill — pre-qualification + convert to deal. */

import { clampList, runQuery, toolError, toolOk } from "../_helpers";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const SELECT =
  "id, first_name, last_name, email, phone, source, status, notes, created_at";

const list_leads: ToolDefinition = {
  name: "list_leads",
  description: "List recent leads, optionally filtered by status.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { status, limit } = input as { status?: string; limit?: number };
    let q = ctx.supabase
      .from("crm_leads")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId);
    if (status) q = q.eq("status", status);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 50));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const get_lead: ToolDefinition = {
  name: "get_lead",
  description: "Get a single lead by id.",
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
        .from("crm_leads")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle()
    );
  },
};

const create_lead: ToolDefinition = {
  name: "create_lead",
  description: "Create a new lead.",
  input_schema: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      source: { type: "string" },
      notes: { type: "string" },
    },
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const fields = input as Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_leads")
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

const update_lead_status: ToolDefinition = {
  name: "update_lead_status",
  description: "Change a lead's status (e.g. new → contacted → qualified).",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      status: { type: "string" },
    },
    required: ["id", "status"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, status } = input as { id: string; status: string };
    const { data, error } = await ctx.supabase
      .from("crm_leads")
      .update({ status })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

const convert_lead_to_deal: ToolDefinition = {
  name: "convert_lead_to_deal",
  description:
    "Convert a qualified lead into a CRM contact + deal pair. Returns the new deal id.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Lead id" },
      deal_name: { type: "string" },
      deal_amount: { type: "number" },
      deal_currency: { type: "string" },
      close_date: { type: "string" },
    },
    required: ["id", "deal_name"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, deal_name, deal_amount, deal_currency, close_date } = input as {
      id: string;
      deal_name: string;
      deal_amount?: number;
      deal_currency?: string;
      close_date?: string;
    };
    const { data: lead, error: leadErr } = await ctx.supabase
      .from("crm_leads")
      .select("first_name, last_name, email, phone")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (leadErr || !lead) return toolError(leadErr?.message ?? "lead_not_found");

    const { data: contact, error: contactErr } = await ctx.supabase
      .from("crm_contacts")
      .insert({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: lead.phone,
      })
      .select("id")
      .single();
    if (contactErr) return toolError(contactErr.message);

    const { data: deal, error: dealErr } = await ctx.supabase
      .from("crm_deals")
      .insert({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        name: deal_name,
        amount: deal_amount ?? null,
        currency: deal_currency ?? "USD",
        close_date: close_date ?? null,
        primary_contact_id: contact.id,
      })
      .select("id, name, amount, currency")
      .single();
    if (dealErr) return toolError(dealErr.message);

    await ctx.supabase
      .from("crm_leads")
      .update({ status: "converted" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id);

    return toolOk({ deal, contact_id: contact.id });
  },
};

export const crmLeadsSkill: SkillDefinition = {
  id: "crm.leads",
  label: "CRM Leads",
  description: "Track and qualify incoming leads, convert to deals.",
  systemFragment:
    "Leads are unqualified prospects. Once qualified, convert_lead_to_deal creates a contact + deal in one step.",
  tools: [
    list_leads,
    get_lead,
    create_lead,
    update_lead_status,
    convert_lead_to_deal,
  ],
};
