import Link from "next/link";

import {
  adminListTasks,
  adminListWorkspacesForFilter,
} from "@/lib/tasks/server";
import {
  PRIORITY_LABEL,
  PRIORITY_PILL_CLASS,
  dueClassname,
  fmtDate,
} from "@/app/tasks/_components/shared";

import { assertAdmin, formatDateTime } from "../_lib";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

/**
 * Admin oversight of tasks across every workspace. Service-role read,
 * so it bypasses RLS — gated by assertAdmin() at the top of the page.
 *
 * Filters: workspace, status, priority, free-text search.
 * CSV export is delegated to /api/tasks/export-csv with the same params.
 */
export default async function AdminTasksPage({ searchParams }: PageProps) {
  await assertAdmin();
  const sp = await searchParams;

  const workspaceId = single(sp.workspace);
  const status = single(sp.status);
  const priority = single(sp.priority);
  const search = single(sp.q);

  const [rows, workspaces] = await Promise.all([
    adminListTasks({
      workspaceId,
      status,
      priority,
      search,
      limit: 500,
    }).catch(() => []),
    adminListWorkspacesForFilter(),
  ]);

  const workspaceById = new Map(workspaces.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Work
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">All tasks</h1>
          <p className="mt-0.5 text-xs text-muted">
            {rows.length} task{rows.length === 1 ? "" : "s"} across all
            workspaces. Service-role read — RLS is bypassed here.
          </p>
        </div>
        <Link
          href={(() => {
            const next = new URLSearchParams();
            if (workspaceId) next.set("workspace", workspaceId);
            if (status) next.set("status", status);
            if (priority) next.set("priority", priority);
            if (search) next.set("q", search);
            return `/api/tasks/export-csv?${next.toString()}`;
          })()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Export CSV
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Workspace
          <select
            name="workspace"
            defaultValue={workspaceId ?? ""}
            className="rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          >
            <option value="">All</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Status
          <input
            type="text"
            name="status"
            defaultValue={status ?? ""}
            placeholder="any"
            className="w-32 rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Priority
          <select
            name="priority"
            defaultValue={priority ?? ""}
            className="rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          >
            <option value="">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Search
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="title or description"
            className="w-56 rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-[30px] items-center rounded-lg bg-tool-accent px-3 text-xs font-medium text-white"
        >
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Task</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Priority</th>
              <th className="px-3 py-2 text-left font-normal">Due</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No tasks match this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/tasks/${r.id}`}
                      className="text-app hover:text-tool-accent"
                    >
                      <div className="font-medium">{r.title}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-faint">
                        {r.id.slice(0, 8)}…
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    {workspaceById.get(r.workspace_id) ?? r.workspace_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-flex items-center rounded-md border border-app bg-app px-2 py-0.5 text-secondary">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        PRIORITY_PILL_CLASS[r.priority]
                      }`}
                    >
                      {PRIORITY_LABEL[r.priority]}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 font-mono text-xs tabular-nums ${dueClassname(
                      r.due_at,
                      r.completed_at
                    )}`}
                  >
                    {fmtDate(r.due_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(r.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
