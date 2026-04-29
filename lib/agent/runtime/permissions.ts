/* Per-workspace, per-skill permission gating.
 *
 * Modes:
 *   allow    — execute the tool without confirmation
 *   confirm  — ask the user (write a row in agent_pending_approvals,
 *              return a structured "approval required" tool result)
 *   deny     — refuse with a one-line message
 *
 * Defaults (no row exists for a skill):
 *   - read_only=true            → 'allow' (always)
 *   - personal workspace        → 'allow'
 *   - team/shared workspace     → 'confirm' for writes
 *
 * "Personal vs team" is detected by member count: a workspace with a
 * single member is personal. We do this read once per dispatch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDefinition } from "./types";

export type PermissionMode = "allow" | "confirm" | "deny";

export interface PermissionsSnapshot {
  /** Map of skill_id → mode for explicit overrides. */
  overrides: Record<string, PermissionMode>;
  /** Effective shape of the workspace — drives the default mode. */
  shape: "personal" | "team";
}

/** Load all permission rows for a workspace and detect personal vs team. */
export async function loadPermissions(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<PermissionsSnapshot> {
  const overrides: Record<string, PermissionMode> = {};
  const { data: rows, error } = await supabase
    .from("agent_permissions")
    .select("skill_id, mode")
    .eq("workspace_id", workspaceId);
  if (!error && rows) {
    for (const r of rows as Array<{ skill_id: string; mode: string }>) {
      if (r.mode === "allow" || r.mode === "confirm" || r.mode === "deny") {
        overrides[r.skill_id] = r.mode;
      }
    }
  }
  const { count } = await supabase
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  const shape: "personal" | "team" =
    typeof count === "number" && count > 1 ? "team" : "personal";
  return { overrides, shape };
}

/** Return the effective mode for a skill+tool against a snapshot. */
export function effectiveMode(
  snapshot: PermissionsSnapshot,
  skillId: string,
  tool: ToolDefinition
): PermissionMode {
  // Read-only tools are always allow — there's nothing to confirm.
  if (tool.read_only) return snapshot.overrides[skillId] ?? "allow";
  const explicit = snapshot.overrides[skillId];
  if (explicit) return explicit;
  return snapshot.shape === "team" ? "confirm" : "allow";
}

/** Default mode used by the Settings UI when there's no row yet. */
export function defaultModeFor(
  shape: "personal" | "team",
  isReadOnly: boolean
): PermissionMode {
  if (isReadOnly) return "allow";
  return shape === "team" ? "confirm" : "allow";
}

const APPROVAL_TTL_MS = 10 * 60_000;

/** Persist a pending approval. The dispatcher writes one when it would
 *  otherwise execute a 'confirm'-mode tool, and replies "say YES to
 *  confirm". The next inbound user turn re-runs against this row. */
export async function writePendingApproval(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    userId: string;
    channel: string;
    skillId: string;
    toolName: string;
    toolInput: unknown;
    summary: string;
  }
): Promise<void> {
  // Drop any prior pending row for this user+channel — only one can be
  // outstanding at a time. The user's last "yes" applies to it.
  await supabase
    .from("agent_pending_approvals")
    .delete()
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId)
    .eq("channel", args.channel);
  await supabase.from("agent_pending_approvals").insert({
    workspace_id: args.workspaceId,
    user_id: args.userId,
    channel: args.channel,
    skill_id: args.skillId,
    tool_name: args.toolName,
    tool_input: args.toolInput as object,
    summary: args.summary,
    expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  });
}

export interface PendingApproval {
  id: string;
  skill_id: string;
  tool_name: string;
  tool_input: unknown;
  summary: string;
}

/** Find the most recent unexpired pending approval for this user+channel. */
export async function readPendingApproval(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  channel: string
): Promise<PendingApproval | null> {
  const { data } = await supabase
    .from("agent_pending_approvals")
    .select("id, skill_id, tool_name, tool_input, summary, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await supabase.from("agent_pending_approvals").delete().eq("id", data.id);
    return null;
  }
  return {
    id: data.id as string,
    skill_id: data.skill_id as string,
    tool_name: data.tool_name as string,
    tool_input: data.tool_input,
    summary: data.summary as string,
  };
}

export async function clearPendingApproval(
  supabase: SupabaseClient,
  approvalId: string
): Promise<void> {
  await supabase
    .from("agent_pending_approvals")
    .delete()
    .eq("id", approvalId);
}

/** Lightweight "did the user say yes?" check. */
export function isAffirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  return /^(y|yes|yep|yeah|sure|ok|okay|do it|go ahead|confirm|approved?)\b/.test(
    t
  );
}

export function isNegation(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  return /^(n|no|nope|cancel|stop|abort|forget it|nevermind|never mind)\b/.test(
    t
  );
}
