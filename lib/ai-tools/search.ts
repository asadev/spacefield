/* AI assistant tools for search + saved views.
 *
 * These follow the ToolDefinition shape from the agent runtime so they
 * can be slotted into a SkillDefinition by whoever wires up the
 * skill catalog at merge time. We export both the individual tools
 * and a convenience SkillDefinition (`searchSkill`) so consumers can:
 *
 *   // In lib/agent/skills/index.ts
 *   import { searchSkill } from "@/lib/ai-tools/search";
 *   export const ALL_SKILLS: SkillDefinition[] = [
 *     ...,
 *     searchSkill,
 *   ];
 *
 * Tools use the caller-scoped Supabase client so RLS still applies to
 * saved_views and search_documents. No service-role.
 */

import {
  clampList,
  toolError,
  toolOk,
} from "@/lib/agent/skills/_helpers";
import type {
  SkillDefinition,
  ToolDefinition,
} from "@/lib/agent/runtime/types";
import type { SearchHit } from "@/lib/search/types";
import type { SavedView } from "@/lib/saved-views/types";

// ───────────────────────────────────────────────────────────────────
// global_search — wraps the global_search RPC.
// ───────────────────────────────────────────────────────────────────

const global_search: ToolDefinition = {
  name: "global_search",
  description:
    "Search across the user's workspace for contacts, deals, tasks, people, files, shared links, and more. Returns ranked hits with title, subtitle, entity type, and href.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Free-text search query.",
      },
      limit: {
        type: "number",
        description: "Max results to return. Default 20, max 50.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { query, limit } = input as { query: string; limit?: number };
    const q = (query ?? "").trim();
    if (!q) return toolOk([]);

    const cap = Math.max(1, Math.min(limit ?? 20, 50));
    const { data, error } = await ctx.supabase.rpc("global_search", {
      p_query: q,
      p_limit: cap,
    });
    if (error) return toolError(error.message);

    const hits = ((data ?? []) as SearchHit[]).map((h) => ({
      entity_type: h.entity_type,
      entity_id: h.entity_id,
      title: h.title,
      subtitle: h.subtitle,
      href: h.href,
    }));
    return toolOk(clampList(hits, cap));
  },
};

// ───────────────────────────────────────────────────────────────────
// list_saved_views — surfaces the caller's saved views for an entity.
// ───────────────────────────────────────────────────────────────────

const list_saved_views: ToolDefinition = {
  name: "list_saved_views",
  description:
    "List the user's saved views for a given entity type ('task', 'crm_contact', 'crm_deal', 'file', etc). Includes personal views and any workspace-shared views the user can see.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: {
        type: "string",
        description: "Snake-case entity type, e.g. 'task' or 'crm_contact'.",
      },
    },
    required: ["entity_type"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { entity_type } = input as { entity_type: string };
    const type = (entity_type ?? "").trim();
    if (!type) return toolError("entity_type is required");

    const { data, error } = await ctx.supabase
      .from("saved_views")
      .select(
        "id, name, scope, target_entity_type, filter, sort, columns, group_by, is_default, created_at, updated_at"
      )
      .eq("target_entity_type", type)
      .or(
        `scope.eq.personal,and(scope.eq.workspace,workspace_id.eq.${ctx.workspaceId})`
      )
      .order("name", { ascending: true });

    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 50));
  },
};

// ───────────────────────────────────────────────────────────────────
// apply_saved_view — return the view definition so the agent can
// describe / re-run it.
// ───────────────────────────────────────────────────────────────────

const apply_saved_view: ToolDefinition = {
  name: "apply_saved_view",
  description:
    "Fetch a saved view by id. The view's filter, sort, columns, and group_by can then be used by the assistant to describe what the view shows or to run a follow-up query.",
  input_schema: {
    type: "object",
    properties: {
      view_id: {
        type: "string",
        description: "UUID of the saved_views row.",
      },
    },
    required: ["view_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { view_id } = input as { view_id: string };
    if (!view_id) return toolError("view_id is required");

    const { data, error } = await ctx.supabase
      .from("saved_views")
      .select(
        "id, name, scope, target_entity_type, filter, sort, columns, group_by, is_default, created_at, updated_at"
      )
      .eq("id", view_id)
      .maybeSingle();

    if (error) return toolError(error.message);
    if (!data) return toolError("view not found or not accessible");
    return toolOk(data as Partial<SavedView>);
  },
};

// ───────────────────────────────────────────────────────────────────
// Convenience skill bundle. Optional — consumers can also pick tools
// individually.
// ───────────────────────────────────────────────────────────────────

export const searchSkill: SkillDefinition = {
  id: "search",
  label: "Search & saved views",
  description:
    "Lets the assistant search across the workspace and inspect the user's saved list views.",
  systemFragment: [
    "You can search across the user's workspace with `global_search`.",
    "When the user asks 'find …' or 'where is …', call global_search first.",
    "You can also list and inspect saved list-page views via `list_saved_views` and `apply_saved_view`.",
  ].join(" "),
  tools: [global_search, list_saved_views, apply_saved_view],
};

export { global_search, list_saved_views, apply_saved_view };
