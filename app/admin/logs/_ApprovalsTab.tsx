import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime, inputClass } from "../_lib";

import ApprovalActions from "./_ApprovalActions";
import {
  PER_PAGE,
  Pagination,
  parseDateBoundary,
  shortId,
} from "./_shared";

type ApprovalRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  channel: string;
  skill_id: string;
  tool_name: string;
  summary: string;
  expires_at: string;
  created_at: string;
};

export type ApprovalFilters = {
  ws?: string;
  expired?: string; // "", "yes", "no"
  from?: string;
  to?: string;
};

export default async function ApprovalsTab({
  page,
  filters,
  baseParams,
}: {
  page: number;
  filters: ApprovalFilters;
  baseParams: Record<string, string | undefined>;
}) {
  const admin = createAdminClient();

  let q = admin
    .from("agent_pending_approvals")
    .select(
      "id, workspace_id, user_id, channel, skill_id, tool_name, summary, expires_at, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (filters.ws) q = q.eq("workspace_id", filters.ws);

  const fromIso = parseDateBoundary(filters.from, "from");
  const toIso = parseDateBoundary(filters.to, "to");
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  // Expired filter against current wall time. We split into "expired"
  // (expires_at < now) vs "active" (expires_at >= now).
  const nowIso = new Date().toISOString();
  if (filters.expired === "yes") q = q.lt("expires_at", nowIso);
  else if (filters.expired === "no") q = q.gte("expires_at", nowIso);

  const start = (page - 1) * PER_PAGE;
  q = q.range(start, start + PER_PAGE - 1);

  const { data, error, count } = await q;
  const rows = (data ?? []) as ApprovalRow[];
  const total = count ?? 0;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const userMap = await fetchAuthUsersByIds(userIds);

  return (
    <div className="space-y-4">
      <FiltersForm filters={filters} />

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          Failed to load approval queue: {error.message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Created</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">Channel</th>
                <th className="px-3 py-2 text-left font-normal">Skill</th>
                <th className="px-3 py-2 text-left font-normal">Tool</th>
                <th className="px-3 py-2 text-left font-normal">Summary</th>
                <th className="px-3 py-2 text-left font-normal">Expires</th>
                <th className="px-3 py-2 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-faint">
                    No pending approvals.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const expired = new Date(r.expires_at).getTime() < Date.now();
                  const userEmail = userMap.get(r.user_id)?.email ?? null;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-app last:border-b-0 hover:bg-app/40 ${
                        expired ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">
                        {shortId(r.workspace_id, 12)}
                      </td>
                      <td className="px-3 py-2 text-xs text-secondary">
                        {userEmail ?? shortId(r.user_id)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">
                        {r.channel}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-app">
                        {r.skill_id}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-app">
                        {r.tool_name}
                      </td>
                      <td className="px-3 py-2 max-w-[24rem]">
                        <span
                          className="line-clamp-2 text-secondary"
                          title={r.summary}
                        >
                          {r.summary}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums whitespace-nowrap">
                        {expired ? (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
                            expired
                          </span>
                        ) : (
                          <span className="text-secondary">
                            {formatDateTime(r.expires_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ApprovalActions id={r.id} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        total={total}
        perPage={PER_PAGE}
        baseParams={baseParams}
      />
    </div>
  );
}

function FiltersForm({ filters }: { filters: ApprovalFilters }) {
  return (
    <form
      action="/admin/logs"
      className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
    >
      <input type="hidden" name="tab" value="approvals" />
      <FilterField label="Workspace ID">
        <input
          type="search"
          name="ws"
          defaultValue={filters.ws ?? ""}
          placeholder="exact uuid"
          className={`${inputClass} h-9 w-56 font-mono text-xs`}
        />
      </FilterField>
      <FilterField label="Expired">
        <select
          name="expired"
          defaultValue={filters.expired ?? ""}
          className={`${inputClass} h-9 w-36`}
        >
          <option value="">All</option>
          <option value="no">Active</option>
          <option value="yes">Expired</option>
        </select>
      </FilterField>
      <FilterField label="From">
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className={`${inputClass} h-9 w-40`}
        />
      </FilterField>
      <FilterField label="To">
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className={`${inputClass} h-9 w-40`}
        />
      </FilterField>
      <button
        type="submit"
        className="h-9 rounded-lg border border-app bg-app px-3 text-sm text-app transition-colors hover:border-tool-accent"
      >
        Apply
      </button>
    </form>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}
