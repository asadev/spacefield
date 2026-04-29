/* Boards skill — Notion/Monday-style database boards. */

import { clampList, toolError, toolOk } from "../_helpers";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const list_boards: ToolDefinition = {
  name: "list_boards",
  description: "List all boards in the workspace.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("crm_boards")
      .select("id, name, kind, position, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("position", { ascending: true });
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 50));
  },
};

const get_board_records: ToolDefinition = {
  name: "get_board_records",
  description: "List the records (rows) of a board by id.",
  input_schema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      limit: { type: "number" },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { board_id, limit } = input as { board_id: string; limit?: number };
    const { data, error } = await ctx.supabase
      .from("crm_board_records")
      .select("id, board_id, data, position, parent_id, assignee_ids, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("board_id", board_id)
      .order("position", { ascending: true })
      .limit(Math.min(limit ?? 50, 100));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 100));
  },
};

const create_board_record: ToolDefinition = {
  name: "create_board_record",
  description: "Create a new record (row) on a board.",
  input_schema: {
    type: "object",
    properties: {
      board_id: { type: "string" },
      data: {
        type: "object",
        description: "Cell values keyed by field_key",
        additionalProperties: true,
      },
    },
    required: ["board_id", "data"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { board_id, data: cells } = input as {
      board_id: string;
      data: Record<string, unknown>;
    };
    const { data, error } = await ctx.supabase
      .from("crm_board_records")
      .insert({
        workspace_id: ctx.workspaceId,
        board_id,
        data: cells,
        created_by: ctx.userId,
      })
      .select("*")
      .single();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

const update_board_record: ToolDefinition = {
  name: "update_board_record",
  description: "Update an existing board record's cell values.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      data: {
        type: "object",
        description: "Cell values to merge into the existing record",
        additionalProperties: true,
      },
    },
    required: ["id", "data"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { id, data: patch } = input as {
      id: string;
      data: Record<string, unknown>;
    };
    // We do a read-modify-write to merge into the JSONB rather than
    // overwrite; this matches what the UI does.
    const { data: existing, error: getErr } = await ctx.supabase
      .from("crm_board_records")
      .select("data")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (getErr || !existing) {
      return toolError(getErr?.message ?? "record_not_found");
    }
    const merged = {
      ...((existing.data as Record<string, unknown>) ?? {}),
      ...patch,
    };
    const { data, error } = await ctx.supabase
      .from("crm_board_records")
      .update({ data: merged })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data);
  },
};

export const boardsSkill: SkillDefinition = {
  id: "boards",
  label: "Boards",
  description: "Manage Notion/Monday-style database boards.",
  systemFragment:
    "Boards have flexible JSONB cells. The 'data' field is keyed by field_key from the board's column config — when in doubt about field names, list the board first.",
  tools: [list_boards, get_board_records, create_board_record, update_board_record],
};
