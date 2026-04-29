/* Shared types + tiny helpers for the workspace-settings sections.
 *
 * These mirror the row shapes returned by /api/workspaces/* endpoints
 * and the RPCs they wrap. Keeping them in one place stops every section
 * file from re-declaring them.
 */

export type WorkspaceRole = "owner" | "admin" | "member";
export type WhoCan = "admins" | "members";
export type DefaultMemberRole = "member" | "admin";

export interface WorkspaceSummary {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  role: WorkspaceRole;
  member_count: number;
}

export interface WorkspaceFullRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_at: string;
  archived_at: string | null;
  default_member_role: DefaultMemberRole;
  who_can_invite: WhoCan;
  who_can_install: WhoCan;
  who_can_uninstall: WhoCan;
}

export interface MemberRow {
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface StorageStatsBody {
  cap: number;
  used: number;
  /**
   * GB delta of the saved add-on row (0 = no row). This is the GB column
   * on workspace_storage_addons regardless of whether payment cleared.
   * Pair with `addon_payment_status` to know whether it's actually
   * counting toward the cap.
   */
  addon: number;
  /**
   * Lifecycle of the saved add-on row, mirroring Paddle:
   *   - null            no row at all (no add-on selected)
   *   - 'pending'       checkout opened, webhook hasn't fired
   *   - 'active'        Paddle confirmed payment — counts toward cap
   *   - 'mock'          legacy v1 row pre-Paddle — counts toward cap
   *   - 'past_due'      payment failed; Paddle retrying
   *   - 'canceled'      user canceled; period may still be running
   */
  addon_payment_status: string | null;
  by_kind: Array<{ kind: string; file_count: number; total_bytes: number }>;
  by_user: Array<{
    user_id: string;
    file_count: number;
    total_bytes: number;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  }>;
  top_files: Array<{
    id: string;
    name: string;
    size_bytes: number;
    content_type: string | null;
    user_id: string;
    created_at: string;
    uploader_name: string | null;
  }>;
  trash: {
    file_count: number;
    total_bytes: number;
    oldest_at: string | null;
  };
  trend: Array<{ day: string; file_count: number; total_bytes: number }>;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
}

export type SectionId =
  | "general"
  | "storage"
  | "members"
  | "permissions"
  | "activity"
  | "ai"
  | "danger";

export const PILL =
  "rounded-md border border-app bg-app px-2 py-1 text-[0.62rem] uppercase tracking-[0.14em] font-medium text-app transition-colors hover:bg-surface disabled:opacity-50";

export const PRIMARY =
  "rounded-md bg-tool-accent px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.14em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const DANGER =
  "rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[0.62rem] uppercase tracking-[0.14em] font-medium text-rose-400 transition-colors hover:bg-rose-400/20 disabled:opacity-50";

// 16px font-size on inputs prevents iOS Safari from auto-zooming the
// page when the field receives focus on mobile.
export const INPUT =
  "rounded-lg border border-app bg-app px-3 py-2 text-[16px] text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft";

/** Format an ISO timestamp as "5m ago" / "2h ago" / "3d ago" / a date. */
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${Math.max(0, sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 7 * 86_400) return `${Math.floor(sec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Render an activity event into a human-readable string. */
export function describeActivity(ev: ActivityEvent): string {
  const who = ev.actor_name ?? "Someone";
  switch (ev.kind) {
    case "member_joined":
      return `${who} joined the workspace.`;
    case "member_left":
      return `${who} left the workspace.`;
    case "invited": {
      const target =
        (ev.payload?.identifier as string | undefined) ??
        (ev.payload?.invitee_email as string | undefined) ??
        "someone";
      return `${who} invited ${target}.`;
    }
    case "invite_accepted":
      return `${who} accepted an invite.`;
    case "role_changed": {
      const target = (ev.payload?.target_name as string | undefined) ?? "a member";
      const role = (ev.payload?.new_role as string | undefined) ?? "a new role";
      return `${who} changed ${target}'s role to ${role}.`;
    }
    case "settings_changed": {
      const keys = Object.keys(ev.payload ?? {}).filter(
        (k) => k !== "diff"
      );
      if (keys.length === 0) return `${who} updated workspace settings.`;
      return `${who} updated ${keys.join(", ")}.`;
    }
    case "transferred":
      return `${who} transferred ownership.`;
    case "archived":
      return `${who} archived the workspace.`;
    case "unarchived":
      return `${who} restored the workspace from archive.`;
    case "tool_installed": {
      const tool = (ev.payload?.tool_id as string | undefined) ?? "an app";
      return `${who} installed ${tool}.`;
    }
    case "tool_uninstalled": {
      const tool = (ev.payload?.tool_id as string | undefined) ?? "an app";
      return `${who} uninstalled ${tool}.`;
    }
    default:
      return `${who} ${ev.kind.replace(/_/g, " ")}.`;
  }
}
