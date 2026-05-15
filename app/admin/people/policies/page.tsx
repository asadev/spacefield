import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import type { TimeOffPolicy } from "@/lib/people/types";

import PolicyEditor from "./_PolicyEditor";

export const dynamic = "force-dynamic";

/**
 * Admin CRUD for time-off policies. All workspaces shown side-by-side.
 * Service-role client; the RPC layer + RLS handle the per-workspace
 * guardrails when admins act on rows belonging to a workspace they're
 * not a member of.
 */
export default async function PoliciesPage() {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, name, slug")
    .order("name");
  const { data: pols } = await admin
    .from("time_off_policies")
    .select("*")
    .order("created_at", { ascending: false });

  const workspaces = (ws ?? []) as { id: string; name: string; slug: string }[];
  const policies = (pols ?? []) as TimeOffPolicy[];
  const byWorkspace = new Map<string, TimeOffPolicy[]>();
  for (const p of policies) {
    const list = byWorkspace.get(p.workspace_id) ?? [];
    list.push(p);
    byWorkspace.set(p.workspace_id, list);
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            HR / People
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Time-off policies</h1>
          <p className="mt-0.5 text-xs text-muted">
            {policies.length} policies across {workspaces.length} workspaces
          </p>
        </div>
        <Link
          href="/admin/people"
          className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
        >
          ← People
        </Link>
      </div>

      <PolicyEditor workspaces={workspaces} />

      <div className="space-y-6">
        {workspaces.map((w) => {
          const list = byWorkspace.get(w.id) ?? [];
          if (!list.length) return null;
          return (
            <div key={w.id} className="rounded-xl border border-app bg-app-elevated">
              <header className="border-b border-app px-4 py-3 text-sm font-semibold text-app">
                {w.name}{" "}
                <span className="text-xs font-normal text-faint">
                  / {w.slug}
                </span>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                    <th className="px-3 py-2 text-left font-normal">Name</th>
                    <th className="px-3 py-2 text-left font-normal">Kind</th>
                    <th className="px-3 py-2 text-left font-normal">Accrual / yr</th>
                    <th className="px-3 py-2 text-left font-normal">Carryover</th>
                    <th className="px-3 py-2 text-left font-normal">Cap</th>
                    <th className="px-3 py-2 text-left font-normal">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="border-b border-app last:border-b-0">
                      <td className="px-3 py-2 text-app">{p.name}</td>
                      <td className="px-3 py-2 text-secondary">{p.kind}</td>
                      <td className="px-3 py-2 tabular-nums text-app">{p.accrual_per_year_days}</td>
                      <td className="px-3 py-2 tabular-nums text-secondary">
                        {p.carryover_max ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-secondary">{p.cap ?? "—"}</td>
                      <td className="px-3 py-2">
                        {p.active ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500 dark:text-emerald-400">
                            on
                          </span>
                        ) : (
                          <span className="rounded-full bg-app-elevated border border-app px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                            off
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
