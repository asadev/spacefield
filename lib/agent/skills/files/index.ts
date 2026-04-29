/* Files skill — workspace file search and metadata.
 *
 * We don't expose upload/delete here — those are heavy ops that should
 * happen in the UI. The agent can find files and pull metadata; users
 * say "find my Q4 contract" and we return enough info to act on.
 */

import { clampList, toolError, toolOk } from "../_helpers";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const SELECT =
  "id, name, size_bytes, content_type, created_at, user_id, tags";

const search_files: ToolDefinition = {
  name: "search_files",
  description:
    "Search the workspace's files by name (substring match, case-insensitive).",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { query, limit } = input as { query: string; limit?: number };
    const q = query.trim();
    if (!q) return toolOk([]);
    const { data, error } = await ctx.supabase
      .from("workspace_files")
      .select(SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .is("deleted_at", null)
      .ilike("name", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 50));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? []));
  },
};

const get_file_meta: ToolDefinition = {
  name: "get_file_meta",
  description: "Get metadata for a single file by id.",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { id } = input as { id: string };
    const { data, error } = await ctx.supabase
      .from("workspace_files")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

const star_file: ToolDefinition = {
  name: "star_file",
  description:
    "Toggle the 'starred' tag on a file. Adds the tag if absent, removes it if present.",
  input_schema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id } = input as { id: string };
    const { data: row, error: getErr } = await ctx.supabase
      .from("workspace_files")
      .select("tags")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (getErr || !row) return toolError(getErr?.message ?? "file_not_found");
    const tags = (row.tags as string[] | null) ?? [];
    const next = tags.includes("starred")
      ? tags.filter((t) => t !== "starred")
      : [...tags, "starred"];
    const { data, error } = await ctx.supabase
      .from("workspace_files")
      .update({ tags: next })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("id, tags")
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

export const filesSkill: SkillDefinition = {
  id: "files",
  label: "Files",
  description: "Search workspace files and view metadata.",
  systemFragment:
    "Files are stored per-workspace. You can search and read metadata, but uploading/deleting must happen in the web UI.",
  tools: [search_files, get_file_meta, star_file],
};
