import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../../_lib";
import type { ImpersonationSessionRow } from "../../_types";
import { endImpersonation } from "../_actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

function formatDuration(start: string, end: string | null): string {
  const a = Date.parse(start);
  const b = end ? Date.parse(end) : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const ms = Math.max(0, b - a);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export default async function AdminImpersonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ active?: string }>;
}) {
  const sp = await searchParams;
  const onlyActive = (sp.active ?? "").trim() === "1";

  const admin = createAdminClient();
  let query = admin
    .from("impersonation_sessions")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false })
    .limit(PER_PAGE);
  if (onlyActive) query = query.is("ended_at", null);

  const { data, count } = await query;
  const rows = (data ?? []) as ImpersonationSessionRow[];

  const userIds = Array.from(
    new Set(rows.flatMap((r) => [r.admin_id, r.target_user_id]))
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  const activeCount = rows.filter((r) => !r.ended_at).length;
  const total = count ?? rows.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/support"
            className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
          >
            ← Support inbox
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-app">
            Impersonation sessions
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {total.toLocaleString()} total · {activeCount} currently active
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/admin/support/impersonations"
            className={`rounded-lg border border-app px-3 py-1.5 transition-colors ${onlyActive ? "bg-app-elevated text-secondary hover:border-tool-accent" : "bg-tool-accent-soft text-tool-accent"}`}
          >
            All
          </Link>
          <Link
            href="/admin/support/impersonations?active=1"
            className={`rounded-lg border border-app px-3 py-1.5 transition-colors ${onlyActive ? "bg-tool-accent-soft text-tool-accent" : "bg-app-elevated text-secondary hover:border-tool-accent"}`}
          >
            Active only
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Admin</th>
              <th className="px-3 py-2 text-left font-normal">Target user</th>
              <th className="px-3 py-2 text-left font-normal">Reason</th>
              <th className="px-3 py-2 text-left font-normal">Started</th>
              <th className="px-3 py-2 text-left font-normal">Ended</th>
              <th className="px-3 py-2 text-left font-normal">Duration</th>
              <th className="px-3 py-2 text-right font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-faint">
                  No impersonation sessions {onlyActive ? "active right now" : "yet"}.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const adminEmail = userMap.get(s.admin_id)?.email ?? null;
                const targetEmail =
                  userMap.get(s.target_user_id)?.email ?? null;
                const isActive = !s.ended_at;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-app last:border-b-0 ${isActive ? "bg-amber-500/5" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] tabular-nums text-secondary">
                        {adminEmail ?? `${s.admin_id.slice(0, 8)}…`}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${s.target_user_id}`}
                        className="font-mono text-[11px] tabular-nums text-app hover:text-tool-accent"
                      >
                        {targetEmail ?? `${s.target_user_id.slice(0, 8)}…`}
                      </Link>
                    </td>
                    <td className="max-w-md px-3 py-2 text-xs text-secondary">
                      <span className="line-clamp-2">{s.reason}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(s.started_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {s.ended_at ? (
                        formatDateTime(s.ended_at)
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          live
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDuration(s.started_at, s.ended_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isActive ? (
                        <form
                          action={endImpersonation}
                          className="inline-flex"
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-600 transition-colors hover:border-rose-500 dark:text-rose-400"
                          >
                            End session
                          </button>
                        </form>
                      ) : (
                        <span className="text-[11px] text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
