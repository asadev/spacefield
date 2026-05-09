import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { AgentWorkflowRow } from "../_types";
import StatusChip from "./_components/StatusChip";
import TriggerChip from "./_components/TriggerChip";

export const dynamic = "force-dynamic";

/**
 * Index of every row in `public.agent_workflows`. Workflows compose
 * multiple skills/tools/prompts into a multi-step flow that a runtime
 * dispatcher (separate work) can execute end-to-end. This page lists the
 * registry; per-workflow editing happens at `/admin/workflows/[id]`.
 *
 * Filters are server-side via search params so the page stays a server
 * component — no client state needed for browse.
 */

type SearchParams = {
  status?: string;
  trigger?: string;
  q?: string;
};

const STATUSES = new Set(["live", "draft", "disabled"]);
const TRIGGERS = new Set(["manual", "event", "cron"]);

export default async function AdminWorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterStatus = STATUSES.has(params.status ?? "")
    ? (params.status as "live" | "draft" | "disabled")
    : "";
  const filterTrigger = TRIGGERS.has(params.trigger ?? "")
    ? (params.trigger as "manual" | "event" | "cron")
    : "";
  const filterQ = (params.q ?? "").trim().toLowerCase();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_workflows")
    .select(
      "id, display_name, description, status, trigger_kind, steps, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load workflows: {error.message}
      </div>
    );
  }

  type Row = Pick<
    AgentWorkflowRow,
    "id" | "display_name" | "description" | "status" | "trigger_kind" | "steps" | "updated_at"
  >;
  const allRows = (data ?? []) as Row[];

  const filtered = allRows.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterTrigger && r.trigger_kind !== filterTrigger) return false;
    if (filterQ) {
      const hay = `${r.id} ${r.display_name} ${r.description}`.toLowerCase();
      if (!hay.includes(filterQ)) return false;
    }
    return true;
  });

  const counts = {
    total: allRows.length,
    live: allRows.filter((r) => r.status === "live").length,
    draft: allRows.filter((r) => r.status === "draft").length,
    disabled: allRows.filter((r) => r.status === "disabled").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Workflows</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} workflows · {counts.live} live · {counts.draft} draft
            · {counts.disabled} disabled. A workflow is an ordered list of
            steps (skills, tools, prompts, branches) the runtime executes
            top-to-bottom.
          </p>
        </div>
        <Link
          href="/admin/workflows/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New workflow
        </Link>
      </div>

      {/* Filters — plain GET form so the page stays an RSC. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-app bg-app-elevated p-3"
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={filterQ}
            placeholder="id, name, description"
            className="h-9 w-52 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
          />
        </FilterField>
        <FilterField label="Trigger">
          <select
            name="trigger"
            defaultValue={filterTrigger}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="manual">manual</option>
            <option value="event">event</option>
            <option value="cron">cron</option>
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            name="status"
            defaultValue={filterStatus}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="live">live</option>
            <option value="draft">draft</option>
            <option value="disabled">disabled</option>
          </select>
        </FilterField>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/workflows"
          className="text-[11px] text-faint transition-colors hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Workflow</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Trigger</th>
              <th className="px-3 py-2 text-left font-normal">Steps</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-faint">
                  {allRows.length === 0
                    ? "No workflows yet — click \"+ New workflow\" to add one."
                    : "No workflows match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const stepCount = Array.isArray(r.steps) ? r.steps.length : 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/workflows/${encodeURIComponent(r.id)}`}
                        className="text-app hover:text-tool-accent"
                      >
                        <div className="font-medium">{r.display_name}</div>
                        {r.description && (
                          <div className="mt-0.5 max-w-xl truncate text-[11px] text-muted">
                            {r.description}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {r.id}
                    </td>
                    <td className="px-3 py-2">
                      <TriggerChip kind={r.trigger_kind} />
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-secondary">
                      {stepCount}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/workflows/${encodeURIComponent(r.id)}`}
                        className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        Edit
                      </Link>
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

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted">
      {label}
      {children}
    </label>
  );
}
