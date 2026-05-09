import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime, inputClass } from "../_lib";

import {
  NeutralChip,
  PER_PAGE,
  Pagination,
  fmtNumber,
  parseDateBoundary,
  shortId,
} from "./_shared";

const BUCKETS = ["quick", "deep"] as const;

type CreditEventRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  bucket: string;
  tokens: number;
  model: string;
  call_kind: string;
  request_id: string | null;
  created_at: string;
};

export type CreditFilters = {
  bucket?: string;
  ws?: string;
  from?: string;
  to?: string;
};

export default async function CreditsTab({
  page,
  filters,
  baseParams,
}: {
  page: number;
  filters: CreditFilters;
  baseParams: Record<string, string | undefined>;
}) {
  const admin = createAdminClient();

  let q = admin
    .from("agent_credit_events")
    .select(
      "id, workspace_id, user_id, bucket, tokens, model, call_kind, request_id, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (filters.bucket) q = q.eq("bucket", filters.bucket);
  if (filters.ws) q = q.eq("workspace_id", filters.ws);

  const fromIso = parseDateBoundary(filters.from, "from");
  const toIso = parseDateBoundary(filters.to, "to");
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  const start = (page - 1) * PER_PAGE;
  q = q.range(start, start + PER_PAGE - 1);

  const { data, error, count } = await q;
  const rows = (data ?? []) as CreditEventRow[];
  const total = count ?? 0;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const userMap = await fetchAuthUsersByIds(userIds);

  return (
    <div className="space-y-4">
      <FiltersForm filters={filters} />

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          Failed to load credit events: {error.message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Created</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">Bucket</th>
                <th className="px-3 py-2 text-right font-normal">Tokens</th>
                <th className="px-3 py-2 text-left font-normal">Model</th>
                <th className="px-3 py-2 text-left font-normal">Call kind</th>
                <th className="px-3 py-2 text-left font-normal">Request</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-faint">
                    No credit events match.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const userEmail = userMap.get(r.user_id)?.email ?? null;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-app last:border-b-0 hover:bg-app/40"
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
                      <td className="px-3 py-2">
                        <NeutralChip>{r.bucket}</NeutralChip>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-app">
                        {fmtNumber(r.tokens)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">
                        {r.model}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">
                        {r.call_kind}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-faint">
                        {r.request_id ? shortId(r.request_id, 10) : "—"}
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

function FiltersForm({ filters }: { filters: CreditFilters }) {
  return (
    <form
      action="/admin/logs"
      className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
    >
      <input type="hidden" name="tab" value="credits" />
      <FilterField label="Bucket">
        <select
          name="bucket"
          defaultValue={filters.bucket ?? ""}
          className={`${inputClass} h-9 w-32`}
        >
          <option value="">All</option>
          {BUCKETS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Workspace ID">
        <input
          type="search"
          name="ws"
          defaultValue={filters.ws ?? ""}
          placeholder="exact uuid"
          className={`${inputClass} h-9 w-56 font-mono text-xs`}
        />
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
