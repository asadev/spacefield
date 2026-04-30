"use client";

/* useWorkspaceRole — fetches the calling user's role in the currently
 * active workspace. Drives permission-gated UI (AppStore visibility,
 * invite buttons, etc.).
 *
 * Roles:
 *   "owner"  — can do everything
 *   "admin"  — can invite + install apps + change settings + manage non-admin members
 *   "member" — can use installed tools, edit shared state; no App Store, no invite
 *   null     — not signed in OR active workspace isn't synced yet (assume owner so
 *              the local-only single-user experience still works)
 */

import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useWorkspaces } from "./useWorkspaces";

export type WorkspaceRole = "owner" | "admin" | "member" | null;

type WhoCan = "admins" | "members";

interface ToolPolicy {
  who_can_install: WhoCan;
  who_can_uninstall: WhoCan;
}

const DEFAULT_TOOL_POLICY: ToolPolicy = {
  who_can_install: "admins",
  who_can_uninstall: "admins",
};

function canDo(role: WorkspaceRole, policy: WhoCan): boolean {
  if (role === "owner" || role === "admin") return true;
  return role === "member" && policy === "members";
}

export function useWorkspaceRole(): {
  role: WorkspaceRole;
  /** True for owner + admin. Use to gate App Store, invites, member management. */
  canAdmin: boolean;
  /** True for owner only. Use to gate Delete + Transfer ownership. */
  canOwn: boolean;
  /** Workspace policy-aware app install permission. */
  canInstallApps: boolean;
  /** Workspace policy-aware app uninstall permission. */
  canUninstallApps: boolean;
  hydrated: boolean;
} {
  const { user, supabase, enabled, hydrated: authHydrated } = useAuth();
  const { activeId, hydrated: wsHydrated } = useWorkspaces();
  const [role, setRole] = useState<WorkspaceRole>(null);
  const [toolPolicy, setToolPolicy] =
    useState<ToolPolicy>(DEFAULT_TOOL_POLICY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!authHydrated || !wsHydrated) return;
    // Local-only mode (no auth, or no active id) — treat as owner so the
    // user sees the full UI in single-device mode.
    if (!enabled || !user || !activeId) {
      setRole("owner");
      setToolPolicy({ who_can_install: "members", who_can_uninstall: "members" });
      setHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data, error }, { data: ws }] = await Promise.all([
        supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", activeId)
        .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("workspaces")
          .select("who_can_install, who_can_uninstall")
          .eq("id", activeId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const policyRow = ws as Partial<ToolPolicy> | null;
      setToolPolicy({
        who_can_install:
          policyRow?.who_can_install === "members" ? "members" : "admins",
        who_can_uninstall:
          policyRow?.who_can_uninstall === "members" ? "members" : "admins",
      });
      if (error || !data) {
        // Not yet recorded as a member (new local workspace not synced).
        // Default to owner — first sync will create the row server-side
        // via the workspace insert trigger.
        setRole("owner");
      } else {
        setRole(data.role as WorkspaceRole);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, user, supabase, activeId, authHydrated, wsHydrated]);

  return {
    role,
    canAdmin: role === "owner" || role === "admin",
    canOwn: role === "owner",
    canInstallApps: canDo(role, toolPolicy.who_can_install),
    canUninstallApps: canDo(role, toolPolicy.who_can_uninstall),
    hydrated,
  };
}
