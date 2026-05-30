/* CRM companies skill — same shape as contacts. */

import { clampList, runQuery, toolError, toolOk } from "../_helpers";
import { escapeForLike, escapeForOr } from "@/lib/escape-helpers";
import { indexCompany, unindexCompany } from "@/lib/crm/search-index";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const SELECT =
  "id, name, domain, industry, size, phone, website, city, country, created_at";

const list_companies: ToolDefinition = {
  name: "list_companies",
  description: "List the most recent companies in the CRM.",
  input_schema: {
    type: "object",
    properties: { limit: { type: "number" } },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { limit } = input as { limit?: number };
    const { data, error } = await ctx.supabase
      .from("crm_companies")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 50));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const search_companies: ToolDefinition = {
  name: "search_companies",
  description: "Search companies by name or domain.",
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
    // Same defang as crm-contacts: strip .or() structural chars then
    // escape LIKE wildcards on the value half of each clause.
    const safe = escapeForOr(escapeForLike(q));
    if (!safe) return toolOk([]);
    const { data, error } = await ctx.supabase
      .from("crm_companies")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .or(`name.ilike.%${safe}%,domain.ilike.%${safe}%`)
      .limit(25);
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const get_company: ToolDefinition = {
  name: "get_company",
  description: "Get a single company by id.",
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
        .from("crm_companies")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle()
    );
  },
};

const create_company: ToolDefinition = {
  name: "create_company",
  description: "Create a new company record.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      domain: { type: "string" },
      industry: { type: "string" },
      size: { type: "string" },
      phone: { type: "string" },
      website: { type: "string" },
      city: { type: "string" },
      country: { type: "string" },
      notes: { type: "string" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const fields = input as Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_companies")
      .insert({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        ...fields,
      })
      .select("*")
      .single();
    if (error) return toolError(error.message);
    // SYNC-01: index into global search (best-effort) so AI-created
    // companies are findable in Cmd-K, matching REST + import paths.
    await indexCompany(data);
    return toolOk(data);
  },
};

const update_company: ToolDefinition = {
  name: "update_company",
  description: "Update an existing company's fields.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      domain: { type: "string" },
      industry: { type: "string" },
      phone: { type: "string" },
      website: { type: "string" },
      city: { type: "string" },
      country: { type: "string" },
      notes: { type: "string" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, ...patch } = input as { id: string } & Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from("crm_companies")
      .update(patch)
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    if (data) await indexCompany(data);
    return toolOk(data);
  },
};

const delete_company: ToolDefinition = {
  name: "delete_company",
  description: "Permanently delete a company.",
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
      .from("crm_companies")
      .delete()
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id);
    if (error) return toolError(error.message);
    await unindexCompany(id);
    return toolOk({ deleted: id });
  },
};

export const crmCompaniesSkill: SkillDefinition = {
  id: "crm.companies",
  label: "CRM Companies",
  description: "Read and manage CRM companies.",
  systemFragment:
    "Companies are organizations. Contacts belong to companies via company_id.",
  tools: [
    list_companies,
    search_companies,
    get_company,
    create_company,
    update_company,
    delete_company,
  ],
};
