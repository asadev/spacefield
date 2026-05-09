import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime, inputClass } from "../_lib";
import type { AiAgentRunRow } from "../_types";

import ExpandableRow from "./_ExpandableRow";
import {
  AgentRunStatusChip,
  PER_PAGE,
  Pagination,
  fmtNumber,
  parseDateBoundary,
  shortId,
} from "./_shared";

const RUN_STATUSES = ["success", "error", "denied", "timeout"] as const;

export type AgentRunFilters = {
  agent?: string;
  status?: string;
  channel?: string;
  email?: string;
  from?: string;
  to?: string;
};

export default async function AgentRunsTab({
  page,
  filters,
  baseParams,
}: {
  page: number;
  filters: AgentRunFilters;
  baseParams: Record<string, string | undefined>;
}) {
  const admin = createAdminClient();

  // ── 1. base list with structural filters ────────────────────────
  let q = admin
    .from("ai_agent_runs")
    .select(
      "id, agent_id, workspace_id, user_id, channel, status, input_excerpt, output_excerpt, tokens_in, tokens_out, duration_ms, model, error, metadata, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (filters.agent) q = q.eq("agent_id", filters.agent);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.channel) q = q.eq("channel", filters.channel);

  const fromIso = parseDateBoundary(filters.from, "from");
  const toIso = parseDateBoundary(filters.to, "to");
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  // Email substring filter narrows the user_id set first via auth admin.
  // No matches → return an obviously-empty result.
  let restrictUserIds: string[] | null = null;
  if (filters.email && filters.email.trim()) {
    const needle = filters.email.trim().toLowerCase();
    const adminClient = createAdminClient();
    const { data } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const users = (data?.users ?? []).filter((u) =>
      (u.email ?? "").toLowerCase().includes(needle)
    );
    restrictUserIds = users.map((u) => u.id);
    if (restrictUserIds.length === 0) {
      return (
        <RunsShell filters={filters} agentOptions={await loadAgentOptions()}>
          <EmptyState text="No users match that email." />
          <Pagination page={page} total={0} perPage={PER_PAGE} baseParams={baseParams} />
        </RunsShell>
      );
    }
    q = q.in("user_id", restrictUserIds);
  }

  const start = (page - 1) * PER_PAGE;
  q = q.range(start, start + PER_PAGE - 1);

  const { data, error, count } = await q;
  const rows = (data ?? []) as AiAgentRunRow[];
  const total = count ?? 0;

  // ── 2. user-email lookup for the rows we got back ──────────────
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  // ── 3. agent dropdown options (small list, fine to fetch) ──────
  const agentOptions = await loadAgentOptions();

  return (
    <RunsShell filters={filters} agentOptions={agentOptions}>
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          Failed to load agent runs: {error.message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Created</th>
                <th className="px-3 py-2 text-left font-normal">Agent</th>
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-left font-normal">Channel</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">Model</th>
                <th className="px-3 py-2 text-right font-normal">Tokens</th>
                <th className="px-3 py-2 text-right font-normal">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-faint">
                    No agent runs match.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const userEmail = r.user_id
                    ? userMap.get(r.user_id)?.email ?? null
                    : null;
                  return (
                    <ExpandableRow
                      key={r.id}
                      colSpan={9}
                      summary={
                        <>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary whitespace-nowrap">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-app">
                            {r.agent_id ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-secondary">
                            {userEmail ?? (r.user_id ? shortId(r.user_id) : "—")}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-secondary">
                            {r.workspace_id ? shortId(r.workspace_id) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-secondary">
                            {r.channel ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <AgentRunStatusChip status={r.status} />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-secondary">
                            {r.model ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                            {fmtNumber(r.tokens_in)} / {fmtNumber(r.tokens_out)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                            {r.duration_ms != null
                              ? `${r.duration_ms} ms`
                              : "—"}
                          </td>
                        </>
                      }
                      detail={<AgentRunDetail row={r} userEmail={userEmail} />}
                    />
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
    </RunsShell>
  );
}

async function loadAgentOptions(): Promise<{ id: string; label: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_agents")
    .select("id, display_name")
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<{ id: string; display_name: string }>).map(
    (a) => ({ id: a.id, label: a.display_name || a.id })
  );
}

function RunsShell({
  filters,
  agentOptions,
  children,
}: {
  filters: AgentRunFilters;
  agentOptions: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <FiltersForm filters={filters} agentOptions={agentOptions} />
      {children}
    </div>
  );
}

function FiltersForm({
  filters,
  agentOptions,
}: {
  filters: AgentRunFilters;
  agentOptions: { id: string; label: string }[];
}) {
  return (
    <form
      action="/admin/logs"
      className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
    >
      <input type="hidden" name="tab" value="agent_runs" />
      <FilterField label="Agent">
        <select
          name="agent"
          defaultValue={filters.agent ?? ""}
          className={`${inputClass} h-9 w-48`}
        >
          <option value="">All agents</option>
          {agentOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Status">
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className={`${inputClass} h-9 w-32`}
        >
          <option value="">All</option>
          {RUN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Channel">
        <input
          type="search"
          name="channel"
          defaultValue={filters.channel ?? ""}
          placeholder="e.g. chat, wa"
          className={`${inputClass} h-9 w-36`}
        />
      </FilterField>
      <FilterField label="User email contains">
        <input
          type="search"
          name="email"
          defaultValue={filters.email ?? ""}
          placeholder="substring"
          className={`${inputClass} h-9 w-56`}
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

function AgentRunDetail({
  row,
  userEmail,
}: {
  row: AiAgentRunRow;
  userEmail: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailCell label="Run ID">
          <span className="font-mono text-xs text-app">{row.id}</span>
        </DetailCell>
        <DetailCell label="User">
          <span className="font-mono text-xs text-app">
            {userEmail ?? row.user_id ?? "—"}
          </span>
        </DetailCell>
        <DetailCell label="Workspace ID">
          <span className="font-mono text-xs text-app">
            {row.workspace_id ?? "—"}
          </span>
        </DetailCell>
        <DetailCell label="Tokens (in / out)">
          <span className="font-mono text-xs tabular-nums text-app">
            {fmtNumber(row.tokens_in)} / {fmtNumber(row.tokens_out)}
          </span>
        </DetailCell>
      </div>
      {row.error && (
        <DetailCell label="Error">
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-600 dark:text-rose-400">
            {row.error}
          </pre>
        </DetailCell>
      )}
      <DetailCell label="Input excerpt">
        {row.input_excerpt ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
            {row.input_excerpt}
          </pre>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </DetailCell>
      <DetailCell label="Output excerpt">
        {row.output_excerpt ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
            {row.output_excerpt}
          </pre>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </DetailCell>
    </div>
  );
}

function DetailCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated px-3 py-8 text-center text-sm text-faint">
      {text}
    </div>
  );
}
