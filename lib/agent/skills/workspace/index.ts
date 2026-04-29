/* Workspace skill — list, switch, and manage workspace membership.
 *
 * The "switch" tool is a no-op on the server (workspace selection lives
 * in localStorage on the client) — we surface it so the agent can tell
 * the user "I switched you to X", but the caller must update their own
 * client state. That's fine for v1: WhatsApp users have one active
 * workspace at a time and we set it by which workspace_id is on their
 * agent_whatsapp_links row.
 */

import { clampList, runQuery, toolError, toolOk } from "../_helpers";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const list_workspaces: ToolDefinition = {
  name: "list_workspaces",
  description:
    "List the workspaces the caller is a member of. Returns id, name, slug, role.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("workspace_members")
      .select(
        "role, workspace:workspaces(id, name, slug, created_at)"
      )
      .eq("user_id", ctx.userId);
    if (error) return toolError(error.message);
    type Row = {
      role: string;
      workspace:
        | { id: string; name: string; slug: string; created_at: string }
        | { id: string; name: string; slug: string; created_at: string }[]
        | null;
    };
    const rows = (data ?? []) as Row[];
    const out = rows
      .map((r) => {
        const w = Array.isArray(r.workspace) ? r.workspace[0] : r.workspace;
        if (!w) return null;
        return { id: w.id, name: w.name, slug: w.slug, role: r.role };
      })
      .filter((w): w is { id: string; name: string; slug: string; role: string } =>
        Boolean(w)
      );
    return toolOk(clampList(out, 50));
  },
};

const current_workspace_info: ToolDefinition = {
  name: "current_workspace_info",
  description:
    "Get info about the workspace the assistant is currently acting on (the one linked to this WhatsApp number).",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("workspaces")
      .select("id, name, slug, created_at")
      .eq("id", ctx.workspaceId)
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk({ ...(data ?? {}), role: ctx.role, tier: ctx.tier });
  },
};

const list_members: ToolDefinition = {
  name: "list_members",
  description: "List members of the current workspace with their roles.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("workspace_members")
      .select("user_id, role, joined_at")
      .eq("workspace_id", ctx.workspaceId);
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 100));
  },
};

const invite_member: ToolDefinition = {
  name: "invite_member",
  description:
    "Invite someone to the current workspace by email. Admin or owner only.",
  input_schema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Email address to invite" },
      role: {
        type: "string",
        enum: ["admin", "member", "viewer"],
        description: "Role to assign on accept",
      },
    },
    required: ["email", "role"],
    additionalProperties: false,
  },
  required_role: "admin",
  read_only: false,
  execute: async (input, ctx) => {
    const { email, role } = input as { email: string; role: string };
    const cleaned = email.trim().toLowerCase();
    if (!cleaned.includes("@")) return toolError("invalid_email");
    return runQuery(
      ctx.supabase
        .from("workspace_invites")
        .insert({
          workspace_id: ctx.workspaceId,
          email: cleaned,
          role,
          invited_by: ctx.userId,
        })
        .select("id, email, role, token")
        .single()
    );
  },
};

export const workspaceSkill: SkillDefinition = {
  id: "workspace",
  label: "Workspace",
  description:
    "Manage workspaces — list, view current, see members, invite teammates.",
  systemFragment:
    "Workspace tools operate on the user's currently linked workspace. Use current_workspace_info to confirm context.",
  tools: [list_workspaces, current_workspace_info, list_members, invite_member],
};
