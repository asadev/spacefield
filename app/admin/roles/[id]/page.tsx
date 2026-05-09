import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../_lib";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type AdminRolePermissionRow,
  type AdminRoleRow,
  type UserAdminRoleRow,
} from "../../_types";
import {
  clonePermissions,
  deleteRole,
  grantUserRoleByEmail,
  revokeUserRole,
  updateRole,
} from "../_actions";
import PermissionMatrix from "../_components/PermissionMatrix";

export const dynamic = "force-dynamic";

export default async function AdminRoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    test_email?: string;
    test_resource?: string;
    test_action?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const [roleRes, permRes, userRolesRes, allRolesRes] = await Promise.all([
    admin
      .from("admin_roles")
      .select(
        "id, display_name, description, is_system_default, metadata, created_at, updated_at, updated_by"
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("admin_role_permissions")
      .select("role_id, resource, action, granted_by, granted_at")
      .eq("role_id", id),
    admin
      .from("user_admin_roles")
      .select("user_id, role_id, granted_by, granted_at, expires_at")
      .eq("role_id", id)
      .order("granted_at", { ascending: false }),
    admin
      .from("admin_roles")
      .select("id, display_name, is_system_default")
      .order("display_name", { ascending: true }),
  ]);

  if (roleRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load role: {roleRes.error.message}
      </div>
    );
  }
  const role = roleRes.data as AdminRoleRow | null;
  if (!role) notFound();

  const permRows = (permRes.data ?? []) as AdminRolePermissionRow[];
  const userRoles = (userRolesRes.data ?? []) as UserAdminRoleRow[];
  const allRoles = (allRolesRes.data ?? []) as Pick<
    AdminRoleRow,
    "id" | "display_name" | "is_system_default"
  >[];

  // Build a Set of granted (resource:action) combos for the matrix.
  const granted = new Set<string>();
  let isWildcard = false;
  for (const r of permRows) {
    granted.add(`${r.resource}:${r.action}`);
    if (r.resource === "*" && r.action === "*") isWildcard = true;
  }

  // Membership rows. Resolve email + active flag for each.
  const userIds = userRoles.map((r) => r.user_id);
  const authUsers = await fetchAuthUsersByIds(userIds);
  const now = Date.now();
  const members = userRoles.map((r) => {
    const auth = authUsers.get(r.user_id);
    const expired =
      r.expires_at != null &&
      Number.isFinite(Date.parse(r.expires_at)) &&
      Date.parse(r.expires_at) <= now;
    return {
      ...r,
      email: auth?.email ?? null,
      expired,
    };
  });

  // Tester widget — re-evaluates on the server when ?test_* params are
  // provided. Calls has_permission(uid, resource, action) directly via
  // the Postgres RPC, plus checks whether THIS role grants that combo.
  const testEmail = (sp.test_email ?? "").trim().toLowerCase();
  const testResource = (sp.test_resource ?? "").trim();
  const testAction = (sp.test_action ?? "").trim();
  const tester = await runPermissionTest({
    roleId: role.id,
    rolePerms: permRows,
    isWildcard,
    email: testEmail,
    resource: testResource,
    action: testAction,
  });

  const isSuperAdmin = role.id === "super-admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/roles" className="hover:text-tool-accent">
          ← Roles
        </Link>
      </div>

      {/* Header */}
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-app bg-app-elevated p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-app">
              {role.display_name}
            </h1>
            <code className="rounded bg-app px-1.5 py-0.5 font-mono text-[11px] text-secondary">
              {role.id}
            </code>
            {role.is_system_default && (
              <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                system
              </span>
            )}
            {isWildcard && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
                wildcard
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Created {formatDateTime(role.created_at)} · last updated{" "}
            {formatDateTime(role.updated_at)} ·{" "}
            {permRows.length.toLocaleString()} perms ·{" "}
            {members.filter((m) => !m.expired).length.toLocaleString()}{" "}
            active members
          </p>
        </div>
        {!role.is_system_default && (
          <form action={deleteRole}>
            <input type="hidden" name="id" value={role.id} />
            <button
              type="submit"
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
            >
              Delete role
            </button>
          </form>
        )}
      </section>

      {/* Edit metadata */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Details</h2>
        <p className="mt-0.5 text-xs text-muted">
          Display name and description. The role id is immutable.
        </p>
        <form action={updateRole} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={role.id} />
          <label className="block">
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              Display name
            </div>
            <input
              type="text"
              name="display_name"
              defaultValue={role.display_name}
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              Description
            </div>
            <textarea
              name="description"
              rows={2}
              defaultValue={role.description}
              className={`${inputClass} resize-y`}
            />
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" className={buttonClass}>
              Save details
            </button>
          </div>
        </form>
      </section>

      {/* Permission matrix */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app">
              Permission matrix
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Click a cell to toggle. Rows ={" "}
              {PERMISSION_RESOURCES.length.toLocaleString()} resources ·
              columns = {PERMISSION_ACTIONS.length.toLocaleString()}{" "}
              actions. Native form submit per cell — no client JS.
            </p>
          </div>
          {!isSuperAdmin && (
            <ClonePermsForm
              currentId={role.id}
              roles={allRoles.filter(
                (r) => r.id !== role.id && r.id !== "super-admin"
              )}
            />
          )}
        </div>
        <PermissionMatrix
          roleId={role.id}
          granted={granted}
          readOnly={isSuperAdmin}
          isWildcard={isWildcard}
        />
      </section>

      {/* Tester */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Visibility tester</h2>
        <p className="mt-0.5 text-xs text-muted">
          Pick a user + (resource, action). We&apos;ll show whether THIS
          role grants the combo and whether the user effectively has the
          permission.
        </p>
        <form
          method="GET"
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_140px_auto]"
        >
          <input
            type="email"
            name="test_email"
            placeholder="user@example.com"
            defaultValue={testEmail}
            className={inputClass}
          />
          <select
            name="test_resource"
            defaultValue={testResource}
            className={inputClass}
          >
            <option value="">— resource —</option>
            {PERMISSION_RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            name="test_action"
            defaultValue={testAction}
            className={inputClass}
          >
            <option value="">— action —</option>
            {PERMISSION_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass}>
            Test
          </button>
        </form>
        {tester && <TesterResult tester={tester} />}
      </section>

      {/* Members */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app">
              Members with this role
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {members.length.toLocaleString()} total ·{" "}
              {members.filter((m) => m.expired).length.toLocaleString()}{" "}
              expired.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <h3 className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">
            Grant role
          </h3>
          <form
            action={grantUserRoleByEmail}
            className="mt-2 grid gap-2 sm:grid-cols-[1fr_220px_auto]"
          >
            <input type="hidden" name="role_id" value={role.id} />
            <input
              type="email"
              name="email"
              required
              placeholder="user@example.com"
              className={inputClass}
            />
            <input
              type="datetime-local"
              name="expires_at"
              className={inputClass}
              title="Optional expiry. Leave blank for permanent grant."
            />
            <button type="submit" className={buttonClass}>
              Grant role
            </button>
          </form>
          <p className="mt-2 text-[11px] text-faint">
            Email is resolved against{" "}
            <code className="font-mono">auth.users</code>. Errors if no
            account matches.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">Granted at</th>
                <th className="px-3 py-2 text-left font-normal">Expires</th>
                <th className="px-3 py-2 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-faint"
                  >
                    Nobody has this role yet. Use the form above to grant it.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.user_id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${m.user_id}`}
                        className="text-secondary hover:text-tool-accent"
                      >
                        {m.email ?? (
                          <span className="font-mono text-xs text-faint">
                            {m.user_id.slice(0, 8)}…
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(m.granted_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {m.expires_at ? (
                        <span
                          className={
                            m.expired ? "text-rose-500" : "text-amber-500"
                          }
                        >
                          {formatDateTime(m.expires_at)}
                          {m.expired && " (expired)"}
                        </span>
                      ) : (
                        <span className="text-faint">never</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={revokeUserRole} className="inline-flex">
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <input type="hidden" name="role_id" value={role.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ──────────────────── helpers ──────────────────── */

interface TesterRunArgs {
  roleId: string;
  rolePerms: AdminRolePermissionRow[];
  isWildcard: boolean;
  email: string;
  resource: string;
  action: string;
}

interface PermissionTestResult {
  email: string;
  resource: string;
  action: string;
  user_found: boolean;
  user_id: string | null;
  role_grants: boolean;
  user_has_permission: boolean | null;
  user_via_is_admin: boolean | null;
  error: string | null;
}

async function runPermissionTest(
  args: TesterRunArgs
): Promise<PermissionTestResult | null> {
  if (!args.email && !args.resource && !args.action) return null;
  if (!args.email || !args.resource || !args.action) {
    return {
      email: args.email,
      resource: args.resource,
      action: args.action,
      user_found: false,
      user_id: null,
      role_grants: false,
      user_has_permission: null,
      user_via_is_admin: null,
      error: "fill in email, resource, and action",
    };
  }

  // Does THIS role grant the (resource, action)? Wildcard = always yes.
  const role_grants =
    args.isWildcard ||
    args.rolePerms.some(
      (p) => p.resource === args.resource && p.action === args.action
    );

  // Resolve email → user_id by scanning auth.users.
  const admin = createAdminClient();
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
      if ((u.email ?? "").toLowerCase() === args.email) {
        user_id = u.id;
        break;
      }
    }
    if (user_id) break;
  }

  if (!user_id) {
    return {
      email: args.email,
      resource: args.resource,
      action: args.action,
      user_found: false,
      user_id: null,
      role_grants,
      user_has_permission: null,
      user_via_is_admin: null,
      error: `no user with email ${args.email}`,
    };
  }

  // has_permission RPC + is_admin shortcut.
  const [rpcRes, profRes] = await Promise.all([
    admin.rpc("has_permission", {
      uid: user_id,
      p_resource: args.resource,
      p_action: args.action,
    }),
    admin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user_id)
      .maybeSingle(),
  ]);

  return {
    email: args.email,
    resource: args.resource,
    action: args.action,
    user_found: true,
    user_id,
    role_grants,
    user_has_permission:
      rpcRes.error || rpcRes.data == null
        ? null
        : Boolean(rpcRes.data),
    user_via_is_admin: Boolean(
      (profRes.data as { is_admin?: boolean | null } | null)?.is_admin
    ),
    error: rpcRes.error?.message ?? null,
  };
}

function TesterResult({ tester }: { tester: PermissionTestResult }) {
  if (tester.error && !tester.user_found) {
    return (
      <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
        {tester.error}
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <ResultPill
        label="This role grants"
        ok={tester.role_grants}
        detail={`${tester.resource}:${tester.action}`}
      />
      <ResultPill
        label="User effectively has"
        ok={tester.user_has_permission ?? false}
        detail={
          tester.user_has_permission == null
            ? "RPC error"
            : tester.user_has_permission
              ? "yes"
              : "no"
        }
      />
      <ResultPill
        label="Via is_admin"
        ok={Boolean(tester.user_via_is_admin)}
        detail={tester.user_via_is_admin ? "shortcut" : "—"}
      />
    </div>
  );
}

function ResultPill({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (ok
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-app bg-app")
      }
    >
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={
          "mt-1 text-sm font-medium " +
          (ok ? "text-emerald-500" : "text-secondary")
        }
      >
        {ok ? "Yes" : "No"}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted">{detail}</div>
    </div>
  );
}

function ClonePermsForm({
  currentId,
  roles,
}: {
  currentId: string;
  roles: { id: string; display_name: string; is_system_default: boolean }[];
}) {
  return (
    <form
      action={clonePermissions}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="to_role" value={currentId} />
      <select
        name="from_role"
        defaultValue=""
        required
        className={`${inputClass} h-8 py-0 text-xs`}
      >
        <option value="" disabled>
          — clone from —
        </option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.display_name} ({r.id})
          </option>
        ))}
      </select>
      <button type="submit" className={buttonGhostClass}>
        Copy permissions
      </button>
    </form>
  );
}
