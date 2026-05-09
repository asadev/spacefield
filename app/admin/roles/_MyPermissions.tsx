import { createClient } from "@/lib/supabase/server";

import {
  getCallerPermissions,
  getCallerRoles,
} from "@/lib/admin-perms";

/**
 * Server-rendered self-audit panel for the signed-in admin. Shows:
 *  - identity (email)
 *  - super-admin banner when profiles.is_admin = true
 *  - assigned, non-expired roles
 *  - collapsed `<details>` with the flattened (resource × action) grants
 *
 * Renders at the top of /admin/roles so an operator can verify their
 * effective access at a glance before editing role definitions.
 */
export default async function MyPermissions() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData?.user?.email ?? null;

  const [roles, perms] = await Promise.all([
    getCallerRoles(),
    getCallerPermissions(),
  ]);

  const isSuper =
    perms.length === 1 && perms[0]?.source === "is_admin";

  return (
    <section
      aria-label="My effective permissions"
      className="rounded-xl border border-app bg-app-elevated p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            My access
          </div>
          <div className="mt-0.5 text-sm text-app">
            Signed in as{" "}
            <span className="font-mono text-xs text-secondary">
              {email ?? "—"}
            </span>
          </div>
        </div>
        <div className="font-mono text-[10px] tabular-nums text-faint">
          {isSuper
            ? "super-admin"
            : `${roles.length} role${roles.length === 1 ? "" : "s"} · ${perms.length} grant${perms.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {isSuper && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          <span className="font-medium">Super-admin (full access).</span> The
          legacy <code className="rounded bg-app px-1 text-[11px]">profiles.is_admin=true</code>{" "}
          flag bypasses the role/permission matrix below. <code className="rounded bg-app px-1 text-[11px]">assertCan(...)</code>{" "}
          calls always succeed for you.
        </div>
      )}

      {/* Roles chips */}
      <div className="mt-3">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Assigned roles
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {roles.length === 0 ? (
            <span className="text-xs text-faint">
              {isSuper
                ? "— none assigned (super-admin grant comes from is_admin flag) —"
                : "— no roles assigned —"}
            </span>
          ) : (
            roles.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app px-2 py-0.5 text-[11px] text-secondary"
                title={r.description || r.id}
              >
                <span className="font-medium text-app">{r.display_name}</span>
                <span className="font-mono text-[9px] text-faint">{r.id}</span>
                {r.is_system_default && (
                  <span className="rounded-full bg-tool-accent-soft px-1.5 text-[9px] font-medium uppercase tracking-wide text-tool-accent">
                    system
                  </span>
                )}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Permissions detail */}
      <details className="mt-3 group">
        <summary className="cursor-pointer select-none text-[11px] uppercase tracking-[0.2em] text-faint transition-colors hover:text-app">
          <span className="group-open:hidden">Show effective permissions</span>
          <span className="hidden group-open:inline">Hide effective permissions</span>
        </summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Resource</th>
                <th className="px-3 py-2 text-left font-normal">Action</th>
                <th className="px-3 py-2 text-left font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {perms.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-xs text-faint"
                  >
                    — no permissions granted —
                  </td>
                </tr>
              ) : (
                perms.map((p) => (
                  <tr
                    key={`${p.resource}:${p.action}:${p.source}`}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-1.5 font-mono text-xs text-secondary">
                      {p.resource}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-secondary">
                      {p.action}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.source === "is_admin" ? (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
                          is_admin
                        </span>
                      ) : (
                        <span className="rounded-full bg-tool-accent-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                          role
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
