import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime } from "../_lib";

import type { AdminRoleRow } from "../_types";

export const dynamic = "force-dynamic";

type RoleListEntry = AdminRoleRow & {
  permission_count: number;
  member_count: number;
  is_wildcard: boolean;
};

export default async function AdminRolesIndexPage() {
  const admin = createAdminClient();

  // Pull roles, then aggregate permission + member counts in two
  // separate queries (the supabase JS client doesn't expose grouped
  // joins). All three queries are independent — run them in parallel.
  const [rolesRes, permsRes, usersRes] = await Promise.all([
    admin
      .from("admin_roles")
      .select(
        "id, display_name, description, is_system_default, metadata, created_at, updated_at, updated_by"
      )
      .order("is_system_default", { ascending: false })
      .order("display_name", { ascending: true }),
    admin
      .from("admin_role_permissions")
      .select("role_id, resource, action"),
    admin.from("user_admin_roles").select("role_id, expires_at"),
  ]);

  if (rolesRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load roles: {rolesRes.error.message}
      </div>
    );
  }

  const rawRoles = (rolesRes.data ?? []) as AdminRoleRow[];
  const permRows = (permsRes.data ?? []) as {
    role_id: string;
    resource: string;
    action: string;
  }[];
  const userRows = (usersRes.data ?? []) as {
    role_id: string;
    expires_at: string | null;
  }[];

  const permsByRole = new Map<string, { count: number; wildcard: boolean }>();
  for (const r of permRows) {
    const cur = permsByRole.get(r.role_id) ?? { count: 0, wildcard: false };
    cur.count += 1;
    if (r.resource === "*" && r.action === "*") cur.wildcard = true;
    permsByRole.set(r.role_id, cur);
  }

  const now = Date.now();
  const membersByRole = new Map<string, number>();
  for (const r of userRows) {
    if (
      r.expires_at &&
      Number.isFinite(Date.parse(r.expires_at)) &&
      Date.parse(r.expires_at) <= now
    )
      continue;
    membersByRole.set(r.role_id, (membersByRole.get(r.role_id) ?? 0) + 1);
  }

  const roles: RoleListEntry[] = rawRoles.map((r) => {
    const p = permsByRole.get(r.id);
    return {
      ...r,
      permission_count: p?.count ?? 0,
      is_wildcard: Boolean(p?.wildcard),
      member_count: membersByRole.get(r.id) ?? 0,
    };
  });

  const totalRoles = roles.length;
  const systemRoles = roles.filter((r) => r.is_system_default).length;
  const totalAssignments = userRows.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            People
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Roles &amp; permissions
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted">
            Named bundles of (resource × action) permissions. Assign
            roles to users from the Members list on each role, or from a
            user&apos;s detail page. The legacy{" "}
            <code className="rounded bg-app px-1 text-[11px]">
              profiles.is_admin=true
            </code>{" "}
            flag still grants full access.
          </p>
        </div>
        <Link href="/admin/roles/new" className={buttonClass}>
          + New role
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total roles" value={totalRoles} />
        <StatCard label="System defaults" value={systemRoles} accent="emerald" />
        <StatCard label="Active assignments" value={totalAssignments} accent="violet" />
      </div>

      {/* Index table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Role</th>
              <th className="px-3 py-2 text-left font-normal">Description</th>
              <th className="px-3 py-2 text-right font-normal">Permissions</th>
              <th className="px-3 py-2 text-right font-normal">Members</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-faint"
                >
                  No roles defined yet. Run the v6 migration to seed
                  defaults, or click &quot;+ New role&quot; above.
                </td>
              </tr>
            ) : (
              roles.map((role) => <RoleRow key={role.id} role={role} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleRow({ role }: { role: RoleListEntry }) {
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <Link
            href={`/admin/roles/${encodeURIComponent(role.id)}`}
            className="text-sm font-medium text-app hover:text-tool-accent"
          >
            {role.display_name}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-faint">
            <span>{role.id}</span>
            {role.is_system_default && (
              <span className="rounded-full bg-tool-accent-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-tool-accent">
                system
              </span>
            )}
            {role.is_wildcard && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-500">
                wildcard
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-secondary">
        <div className="max-w-md truncate text-xs text-secondary">
          {role.description || (
            <span className="text-faint">— no description —</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
        {role.is_wildcard ? (
          <span className="text-amber-500">∞</span>
        ) : (
          role.permission_count
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
        {role.member_count}
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(role.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/roles/${encodeURIComponent(role.id)}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "violet"
          ? "text-tool-accent"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
