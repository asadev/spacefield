import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import type {
  AdminRoleRow,
  PermissionAction,
  PermissionResource,
} from "@/app/admin/_types";

/**
 * Fine-grained permission gate library for admin server actions.
 *
 * Calls the v6 `has_permission(uid, resource, action)` RPC. Super-admins
 * (profiles.is_admin = true) short-circuit to allow before any RPC fires.
 *
 * IMPORTANT: this lib is *additive*. It does not replace `assertAdmin()`
 * — every mutation path must still call `assertAdmin()` for the
 * back-compat super-admin check, then optionally layer `assertCan(...)`
 * for the resource × action grant.
 */

export class PermissionDeniedError extends Error {
  code = "forbidden" as const;
  resource: PermissionResource;
  action: PermissionAction;
  constructor(resource: PermissionResource, action: PermissionAction) {
    super(`forbidden: ${resource}.${action}`);
    this.name = "PermissionDeniedError";
    this.resource = resource;
    this.action = action;
  }
}

/* ──────────────────── internals ──────────────────── */

async function getCallerUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

async function callerIsSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_caller_is_admin");
  if (error) return false;
  return data === true;
}

/* ──────────────────── public API ──────────────────── */

/**
 * Throws `PermissionDeniedError` (with shape `{ code: "forbidden",
 * resource, action }`) when the caller doesn't have the requested
 * permission. No-op when the caller has `profiles.is_admin = true`.
 */
export async function assertCan(
  resource: PermissionResource,
  action: PermissionAction
): Promise<void> {
  // Super-admin short-circuit before touching has_permission. Mirrors
  // assertAdmin() back-compat: any user with is_admin=true is allowed.
  if (await callerIsSuperAdmin()) return;

  const uid = await getCallerUserId();
  if (!uid) throw new PermissionDeniedError(resource, action);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    uid,
    p_resource: resource,
    p_action: action,
  });
  if (error || data !== true) {
    throw new PermissionDeniedError(resource, action);
  }
}

/** Non-throwing variant. Returns true when allowed, false otherwise. */
export async function callerCan(
  resource: PermissionResource,
  action: PermissionAction
): Promise<boolean> {
  if (await callerIsSuperAdmin()) return true;

  const uid = await getCallerUserId();
  if (!uid) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    uid,
    p_resource: resource,
    p_action: action,
  });
  if (error) return false;
  return data === true;
}

/**
 * Roles assigned to the calling user (joins user_admin_roles →
 * admin_roles). Excludes expired assignments. Empty array when not
 * signed in.
 */
export async function getCallerRoles(): Promise<AdminRoleRow[]> {
  const uid = await getCallerUserId();
  if (!uid) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_admin_roles")
    .select(
      "role_id, expires_at, admin_roles!inner(id, display_name, description, is_system_default, metadata, created_at, updated_at)"
    )
    .eq("user_id", uid);

  if (error || !data) return [];

  const now = Date.now();
  const out: AdminRoleRow[] = [];
  for (const row of data as unknown as {
    role_id: string;
    expires_at: string | null;
    admin_roles:
      | AdminRoleRow
      | AdminRoleRow[]
      | null;
  }[]) {
    if (
      row.expires_at &&
      Number.isFinite(Date.parse(row.expires_at)) &&
      Date.parse(row.expires_at) <= now
    ) {
      continue;
    }
    const role = Array.isArray(row.admin_roles)
      ? row.admin_roles[0]
      : row.admin_roles;
    if (role) out.push(role);
  }
  // Stable order: system defaults first, then by display name.
  out.sort((a, b) => {
    if (a.is_system_default !== b.is_system_default) {
      return a.is_system_default ? -1 : 1;
    }
    return a.display_name.localeCompare(b.display_name);
  });
  return out;
}

export type CallerPermissionEntry = {
  resource: PermissionResource;
  action: PermissionAction;
  source: "role" | "is_admin";
};

/**
 * Flattened effective permissions for the calling user. When the caller
 * is a super-admin, returns a single synthetic `("*","*")` entry with
 * `source: "is_admin"`. Otherwise expands every (resource, action) row
 * granted via assigned, non-expired roles, deduplicated.
 */
export async function getCallerPermissions(): Promise<CallerPermissionEntry[]> {
  if (await callerIsSuperAdmin()) {
    return [
      {
        resource: "*" as PermissionResource,
        action: "*" as PermissionAction,
        source: "is_admin",
      },
    ];
  }

  const uid = await getCallerUserId();
  if (!uid) return [];

  const admin = createAdminClient();

  // Active (non-expired) role IDs for this user.
  const { data: assignments, error: aerr } = await admin
    .from("user_admin_roles")
    .select("role_id, expires_at")
    .eq("user_id", uid);
  if (aerr || !assignments || assignments.length === 0) return [];

  const now = Date.now();
  const activeRoleIds = (
    assignments as { role_id: string; expires_at: string | null }[]
  )
    .filter(
      (r) =>
        !r.expires_at ||
        !Number.isFinite(Date.parse(r.expires_at)) ||
        Date.parse(r.expires_at) > now
    )
    .map((r) => r.role_id);

  if (activeRoleIds.length === 0) return [];

  const { data: perms, error: perr } = await admin
    .from("admin_role_permissions")
    .select("resource, action")
    .in("role_id", activeRoleIds);
  if (perr || !perms) return [];

  const seen = new Set<string>();
  const out: CallerPermissionEntry[] = [];
  for (const row of perms as { resource: string; action: string }[]) {
    const key = `${row.resource}:${row.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      resource: row.resource as PermissionResource,
      action: row.action as PermissionAction,
      source: "role",
    });
  }
  // Sort: wildcards first, then by resource, then action.
  out.sort((a, b) => {
    const aw = (a.resource as string) === "*" || (a.action as string) === "*";
    const bw = (b.resource as string) === "*" || (b.action as string) === "*";
    if (aw !== bw) return aw ? -1 : 1;
    if (a.resource !== b.resource) return a.resource.localeCompare(b.resource);
    return a.action.localeCompare(b.action);
  });
  return out;
}
