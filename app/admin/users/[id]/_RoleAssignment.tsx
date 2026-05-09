import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../../_lib";
import type { AdminRoleRow, UserAdminRoleRow } from "../../_types";
import { grantUserRole, revokeUserRole } from "../../roles/_actions";

/**
 * Role-assignment panel rendered under the user-detail tabs.
 *
 * The naming says "client island" but this is a server component — we
 * keep all logic on the server (no client-side state needed) and rely
 * on native form-action submissions which the parent page can leave in
 * place without disturbing the existing tab layout.
 */
export default async function RoleAssignment({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string | null;
}) {
  const admin = createAdminClient();

  const [userRolesRes, allRolesRes] = await Promise.all([
    admin
      .from("user_admin_roles")
      .select("user_id, role_id, granted_by, granted_at, expires_at")
      .eq("user_id", userId)
      .order("granted_at", { ascending: false }),
    admin
      .from("admin_roles")
      .select(
        "id, display_name, description, is_system_default, metadata, created_at, updated_at"
      )
      .order("is_system_default", { ascending: false })
      .order("display_name", { ascending: true }),
  ]);

  const userRoles = (userRolesRes.data ?? []) as UserAdminRoleRow[];
  const allRoles = (allRolesRes.data ?? []) as AdminRoleRow[];
  const grantedSet = new Set(userRoles.map((r) => r.role_id));
  const grantable = allRoles.filter((r) => !grantedSet.has(r.id));

  const now = Date.now();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-app">Admin roles</h2>
          <p className="mt-0.5 text-xs text-muted">
            Roles granted to{" "}
            <span className="font-mono">{userEmail ?? userId}</span>.
            Permissions stack — having any matching role grants the
            (resource, action) combo.
          </p>
        </div>
        <Link
          href="/admin/roles"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          Manage roles →
        </Link>
      </div>

      {/* Current roles */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Role</th>
              <th className="px-3 py-2 text-left font-normal">Granted at</th>
              <th className="px-3 py-2 text-left font-normal">Expires</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {userRoles.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-faint"
                >
                  No roles. The user only has access via{" "}
                  <code className="font-mono">profiles.is_admin</code>{" "}
                  if that flag is true.
                </td>
              </tr>
            ) : (
              userRoles.map((r) => {
                const role = allRoles.find((x) => x.id === r.role_id);
                const expired =
                  r.expires_at != null &&
                  Number.isFinite(Date.parse(r.expires_at)) &&
                  Date.parse(r.expires_at) <= now;
                return (
                  <tr
                    key={r.role_id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/roles/${encodeURIComponent(r.role_id)}`}
                        className="text-secondary hover:text-tool-accent"
                      >
                        <span className="text-app">
                          {role?.display_name ?? r.role_id}
                        </span>
                        <span className="ml-2 font-mono text-[10px] text-faint">
                          {r.role_id}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.granted_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">
                      {r.expires_at ? (
                        <span
                          className={
                            expired
                              ? "text-rose-500"
                              : "text-amber-500"
                          }
                        >
                          {formatDateTime(r.expires_at)}
                          {expired && " (expired)"}
                        </span>
                      ) : (
                        <span className="text-faint">never</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={revokeUserRole} className="inline-flex">
                        <input type="hidden" name="user_id" value={userId} />
                        <input type="hidden" name="role_id" value={r.role_id} />
                        <input
                          type="hidden"
                          name="redirect_to"
                          value="user"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Grant role */}
      <div className="rounded-xl border border-app bg-app-elevated p-4">
        <h3 className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">
          Grant role
        </h3>
        {grantable.length === 0 ? (
          <p className="mt-2 text-xs text-faint">
            All available roles are already assigned to this user.
          </p>
        ) : (
          <form
            action={grantUserRole}
            className="mt-2 grid gap-2 sm:grid-cols-[1fr_220px_auto]"
          >
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="redirect_to" value="user" />
            <select
              name="role_id"
              required
              defaultValue=""
              className={inputClass}
            >
              <option value="" disabled>
                — pick a role —
              </option>
              {grantable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name} ({r.id})
                </option>
              ))}
            </select>
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
        )}
        <p className="mt-2 text-[11px] text-faint">
          Permissions take effect immediately. Audit log records the
          actor and timestamp.
        </p>
      </div>
    </section>
  );
}
