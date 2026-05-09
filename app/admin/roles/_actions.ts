"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type AdminRoleRow,
  type PermissionAction,
  type PermissionResource,
} from "../_types";

/**
 * Server actions for `/admin/roles`. Every mutating action calls
 * `assertAdmin()` (also enforced by RLS) and `recordAdminAction(...)` so
 * the audit log captures every permission change.
 */

const ROLE_ID_REGEX = /^[a-z][a-z0-9-]*$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESOURCE_SET = new Set<string>(PERMISSION_RESOURCES);
const ACTION_SET = new Set<string>(PERMISSION_ACTIONS);

function isResource(value: string): value is PermissionResource {
  return RESOURCE_SET.has(value);
}

function isAction(value: string): value is PermissionAction {
  return ACTION_SET.has(value);
}

/* ────────────────── createRole ────────────────── */

export async function createRole(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const cloneFrom = String(formData.get("clone_from") ?? "").trim().toLowerCase();

  if (!id) throw new Error("missing role id");
  if (!ROLE_ID_REGEX.test(id)) {
    throw new Error("invalid id — use lowercase letters, digits, dashes");
  }
  if (id === "*") {
    throw new Error("'*' is reserved");
  }

  const admin = createAdminClient();

  const insertRow = {
    id,
    display_name: display_name || id,
    description,
    is_system_default: false,
    updated_by: auth.userId,
  };

  const { error } = await admin.from("admin_roles").insert(insertRow);
  if (error) throw new Error(error.message);

  // If cloning, copy the source role's permissions onto the new role.
  let clonedRows = 0;
  if (cloneFrom) {
    const { data: source } = await admin
      .from("admin_role_permissions")
      .select("resource, action")
      .eq("role_id", cloneFrom);
    const rows = (source ?? [])
      .filter(
        (r): r is { resource: string; action: string } =>
          typeof r.resource === "string" && typeof r.action === "string"
      )
      .map((r) => ({
        role_id: id,
        resource: r.resource,
        action: r.action,
        granted_by: auth.userId,
      }));
    if (rows.length > 0) {
      const { error: insErr } = await admin
        .from("admin_role_permissions")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
      clonedRows = rows.length;
    }
  }

  await recordAdminAction({
    action: "role.create",
    targetType: "admin_role",
    targetId: id,
    after: insertRow,
    metadata: cloneFrom
      ? { cloned_from: cloneFrom, cloned_permissions: clonedRows }
      : {},
  });

  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${encodeURIComponent(id)}`);
}

/* ────────────────── updateRole ────────────────── */

export async function updateRole(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing role id");

  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("admin_roles")
    .select("id, display_name, description, is_system_default")
    .eq("id", id)
    .maybeSingle();

  const update = {
    display_name: display_name || id,
    description,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("admin_roles")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "role.update",
    targetType: "admin_role",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${encodeURIComponent(id)}`);
}

/* ────────────────── deleteRole ────────────────── */

export async function deleteRole(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing role id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("admin_roles")
    .select("id, display_name, description, is_system_default")
    .eq("id", id)
    .maybeSingle();

  if (!before) throw new Error("role not found");
  if ((before as AdminRoleRow).is_system_default) {
    throw new Error("cannot delete a system-default role");
  }

  const { error } = await admin.from("admin_roles").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "role.delete",
    targetType: "admin_role",
    targetId: id,
    before,
  });

  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}

/* ────────────────── clonePermissions ────────────────── */

export async function clonePermissions(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const fromRole = String(formData.get("from_role") ?? "").trim().toLowerCase();
  const toRole = String(formData.get("to_role") ?? "").trim().toLowerCase();

  if (!fromRole || !toRole) throw new Error("missing source or target role");
  if (fromRole === toRole) throw new Error("source and target must differ");

  const admin = createAdminClient();

  const [target, source] = await Promise.all([
    admin
      .from("admin_roles")
      .select("id, is_system_default")
      .eq("id", toRole)
      .maybeSingle(),
    admin
      .from("admin_role_permissions")
      .select("resource, action")
      .eq("role_id", fromRole),
  ]);

  if (!target.data) throw new Error("target role not found");
  if ((target.data as AdminRoleRow).is_system_default && toRole === "super-admin") {
    throw new Error("cannot rewrite super-admin permissions");
  }

  const rows = (source.data ?? [])
    .filter(
      (r): r is { resource: string; action: string } =>
        typeof r.resource === "string" && typeof r.action === "string"
    )
    .map((r) => ({
      role_id: toRole,
      resource: r.resource,
      action: r.action,
      granted_by: auth.userId,
    }));

  const { data: before } = await admin
    .from("admin_role_permissions")
    .select("resource, action")
    .eq("role_id", toRole);

  if (rows.length > 0) {
    const { error: upErr } = await admin
      .from("admin_role_permissions")
      .upsert(rows, { onConflict: "role_id,resource,action" });
    if (upErr) throw new Error(upErr.message);
  }

  await recordAdminAction({
    action: "role.clone_permissions",
    targetType: "admin_role",
    targetId: toRole,
    before,
    after: rows.map((r) => ({ resource: r.resource, action: r.action })),
    metadata: { from_role: fromRole, copied: rows.length },
  });

  revalidatePath(`/admin/roles/${encodeURIComponent(toRole)}`);
}

/* ────────────────── togglePermission ────────────────── */

export async function togglePermission(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const role_id = String(formData.get("role_id") ?? "").trim().toLowerCase();
  const resource = String(formData.get("resource") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  // Native checkbox: present means desired state is "checked", absent
  // means "unchecked". We pre-render checkboxes in a per-cell <form>
  // with a hidden `desired` field set from the current state, so the
  // submission tells us which way to flip.
  const desired = String(formData.get("desired") ?? "off") === "on";

  if (!role_id) throw new Error("missing role_id");
  if (!resource || !isResource(resource)) {
    throw new Error("invalid resource");
  }
  if (!action || !isAction(action)) {
    throw new Error("invalid action");
  }
  if (role_id === "super-admin") {
    throw new Error("super-admin permissions are wildcard, not editable");
  }

  const admin = createAdminClient();

  const { data: roleRow } = await admin
    .from("admin_roles")
    .select("id")
    .eq("id", role_id)
    .maybeSingle();
  if (!roleRow) throw new Error("role not found");

  const { data: existing } = await admin
    .from("admin_role_permissions")
    .select("role_id, resource, action")
    .eq("role_id", role_id)
    .eq("resource", resource)
    .eq("action", action)
    .maybeSingle();

  const before = { granted: Boolean(existing) };
  let after: { granted: boolean };

  if (desired) {
    if (!existing) {
      const { error } = await admin.from("admin_role_permissions").insert({
        role_id,
        resource,
        action,
        granted_by: auth.userId,
      });
      if (error) throw new Error(error.message);
    }
    after = { granted: true };
  } else {
    if (existing) {
      const { error } = await admin
        .from("admin_role_permissions")
        .delete()
        .eq("role_id", role_id)
        .eq("resource", resource)
        .eq("action", action);
      if (error) throw new Error(error.message);
    }
    after = { granted: false };
  }

  await recordAdminAction({
    action: "role.permission_change",
    targetType: "admin_role",
    targetId: role_id,
    before,
    after,
    metadata: { resource, action },
  });

  revalidatePath(`/admin/roles/${encodeURIComponent(role_id)}`);
}

/* ────────────────── grantUserRole ────────────────── */

export async function grantUserRole(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const user_id = String(formData.get("user_id") ?? "").trim().toLowerCase();
  const role_id = String(formData.get("role_id") ?? "").trim().toLowerCase();
  const expires_at_raw = String(formData.get("expires_at") ?? "").trim();
  // Optional return path so we can revalidate the right screen.
  const redirectTo = String(formData.get("redirect_to") ?? "").trim();

  if (!user_id || !UUID_REGEX.test(user_id)) {
    throw new Error("invalid user_id");
  }
  if (!role_id) throw new Error("missing role_id");

  let expires_at: string | null = null;
  if (expires_at_raw) {
    const d = new Date(expires_at_raw);
    if (Number.isNaN(d.getTime())) throw new Error("invalid expires_at");
    expires_at = d.toISOString();
  }

  const admin = createAdminClient();

  const { data: roleRow } = await admin
    .from("admin_roles")
    .select("id")
    .eq("id", role_id)
    .maybeSingle();
  if (!roleRow) throw new Error("role not found");

  const insertRow = {
    user_id,
    role_id,
    granted_by: auth.userId,
    expires_at,
  };

  const { error } = await admin
    .from("user_admin_roles")
    .upsert(insertRow, { onConflict: "user_id,role_id" });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user_role.grant",
    targetType: "user_admin_role",
    targetId: `${user_id}:${role_id}`,
    after: insertRow,
  });

  revalidatePath(`/admin/roles/${encodeURIComponent(role_id)}`);
  revalidatePath(`/admin/users/${user_id}`);
  if (redirectTo === "user") {
    redirect(`/admin/users/${user_id}`);
  }
}

/* ────────────────── revokeUserRole ────────────────── */

export async function revokeUserRole(formData: FormData): Promise<void> {
  await assertAdmin();
  const user_id = String(formData.get("user_id") ?? "").trim().toLowerCase();
  const role_id = String(formData.get("role_id") ?? "").trim().toLowerCase();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim();

  if (!user_id || !UUID_REGEX.test(user_id)) {
    throw new Error("invalid user_id");
  }
  if (!role_id) throw new Error("missing role_id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("user_admin_roles")
    .select("user_id, role_id, granted_by, granted_at, expires_at")
    .eq("user_id", user_id)
    .eq("role_id", role_id)
    .maybeSingle();

  const { error } = await admin
    .from("user_admin_roles")
    .delete()
    .eq("user_id", user_id)
    .eq("role_id", role_id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user_role.revoke",
    targetType: "user_admin_role",
    targetId: `${user_id}:${role_id}`,
    before,
  });

  revalidatePath(`/admin/roles/${encodeURIComponent(role_id)}`);
  revalidatePath(`/admin/users/${user_id}`);
  if (redirectTo === "user") {
    redirect(`/admin/users/${user_id}`);
  }
}

/* ────────────────── grantUserRoleByEmail ────────────────── */

/**
 * Email-lookup helper used on the per-role "Add member" form. Resolves
 * the email to a user id via the auth admin API, then upserts the
 * user_admin_roles row.
 */
export async function grantUserRoleByEmail(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role_id = String(formData.get("role_id") ?? "").trim().toLowerCase();
  const expires_at_raw = String(formData.get("expires_at") ?? "").trim();

  if (!email || !email.includes("@")) {
    throw new Error("invalid email");
  }
  if (!role_id) throw new Error("missing role_id");

  let expires_at: string | null = null;
  if (expires_at_raw) {
    const d = new Date(expires_at_raw);
    if (Number.isNaN(d.getTime())) throw new Error("invalid expires_at");
    expires_at = d.toISOString();
  }

  const admin = createAdminClient();

  const { data: roleRow } = await admin
    .from("admin_roles")
    .select("id")
    .eq("id", role_id)
    .maybeSingle();
  if (!roleRow) throw new Error("role not found");

  // Resolve email → user id by scanning auth.users. The admin API has
  // no email filter, so we pull a few pages and substring-match (same
  // approach used in `_lib.ts#listAuthUsers`). Bounded scan = 1000 rows.
  const PAGES = 5;
  const PAGE_SIZE = 200;
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) =>
      admin.auth.admin
        .listUsers({ page: i + 1, perPage: PAGE_SIZE })
        .catch(() => null)
    )
  );
  let user_id: string | null = null;
  for (const r of pages) {
    if (!r || r.error || !r.data?.users) continue;
    for (const u of r.data.users) {
      if ((u.email ?? "").toLowerCase() === email) {
        user_id = u.id;
        break;
      }
    }
    if (user_id) break;
  }
  if (!user_id) throw new Error(`no user with email ${email}`);

  const insertRow = {
    user_id,
    role_id,
    granted_by: auth.userId,
    expires_at,
  };

  const { error } = await admin
    .from("user_admin_roles")
    .upsert(insertRow, { onConflict: "user_id,role_id" });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user_role.grant",
    targetType: "user_admin_role",
    targetId: `${user_id}:${role_id}`,
    after: insertRow,
    metadata: { resolved_from_email: email },
  });

  revalidatePath(`/admin/roles/${encodeURIComponent(role_id)}`);
  revalidatePath(`/admin/users/${user_id}`);
}

// AdminRoleRow / AdminRolePermissionRow are intentionally NOT re-exported
// here — `"use server"` modules can only export async functions.
// Importers should pull types from `@/app/admin/_types` directly.
