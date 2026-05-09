import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, buttonGhostClass, formatDateTime, inputClass } from "../_lib";
import type { CronJobRow } from "../_types";

import CronStatusChip from "./_components/CronStatusChip";
import { discoverCronRoutes, readVercelCrons } from "./_discovery";
import { registerCronJob, runCronNow, setCronEnabled } from "./_actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 100; // cron jobs are sparse — one page is plenty.

type CronJobLite = Pick<
  CronJobRow,
  | "id"
  | "path"
  | "schedule"
  | "description"
  | "enabled"
  | "last_run_at"
  | "last_run_status"
  | "last_run_duration_ms"
>;

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const statusFilter = (sp.status ?? "").trim();

  const admin = createAdminClient();

  const [jobsRes, runsCountRes, last24Res, errorsRes, discovered, vercelCrons] =
    await Promise.all([
      admin
        .from("cron_jobs")
        .select(
          "id, path, schedule, description, enabled, last_run_at, last_run_status, last_run_duration_ms"
        )
        .order("id", { ascending: true })
        .limit(PER_PAGE),
      admin
        .from("cron_runs")
        .select("id", { count: "exact", head: true }),
      admin
        .from("cron_runs")
        .select("id", { count: "exact", head: true })
        .gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      admin
        .from("cron_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "error")
        .gte("started_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      discoverCronRoutes(),
      readVercelCrons(),
    ]);

  if (jobsRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load cron_jobs: {jobsRes.error.message}
      </div>
    );
  }

  const allRows = (jobsRes.data ?? []) as CronJobLite[];

  const rows = allRows.filter((r) => {
    if (statusFilter === "enabled" && !r.enabled) return false;
    if (statusFilter === "disabled" && r.enabled) return false;
    if (statusFilter === "errors" && r.last_run_status !== "error") return false;
    if (query) {
      const needle = query.toLowerCase();
      const hay = `${r.id} ${r.path} ${r.description}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  // Build the "discovered, not registered" list: filesystem entries
  // whose path is missing from cron_jobs.
  const registeredPaths = new Set(allRows.map((r) => r.path));
  const unregistered = discovered.filter(
    (d) => !registeredPaths.has(d.path)
  );

  const stats = {
    total: allRows.length,
    enabled: allRows.filter((r) => r.enabled).length,
    disabled: allRows.filter((r) => !r.enabled).length,
    runs_total: runsCountRes.count ?? 0,
    runs_24h: last24Res.count ?? 0,
    errors_7d: errorsRes.count ?? 0,
    discovered: unregistered.length,
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Ops
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Jobs &amp; cron</h1>
        <p className="mt-0.5 text-xs text-muted">
          {stats.total} registered · {stats.enabled} enabled · {stats.disabled}{" "}
          disabled · {stats.runs_24h.toLocaleString()} runs in last 24h ·{" "}
          {stats.errors_7d.toLocaleString()} errors in last 7d
          {stats.discovered > 0 && (
            <>
              {" "}·{" "}
              <span className="text-amber-500">
                {stats.discovered} discovered, not registered
              </span>
            </>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Registered jobs" value={stats.total.toString()} />
        <StatCard label="Enabled" value={stats.enabled.toString()} />
        <StatCard label="Runs (24h)" value={stats.runs_24h.toLocaleString()} />
        <StatCard
          label="Errors (7d)"
          value={stats.errors_7d.toLocaleString()}
          accent={stats.errors_7d > 0 ? "rose" : undefined}
        />
      </div>

      {/* Filters */}
      <form
        action="/admin/jobs"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <Field label="Search">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="id / path / description…"
            className={`${inputClass} h-9 w-64`}
          />
        </Field>
        <Field label="Status">
          <select
            name="status"
            defaultValue={statusFilter}
            className={`${inputClass} h-9 w-44`}
          >
            <option value="">Any</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="errors">Last run errored</option>
          </select>
        </Field>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/jobs"
          className="h-9 rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted transition-colors hover:border-app hover:text-app"
        >
          Reset
        </Link>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Path</th>
              <th className="px-3 py-2 text-left font-normal">Schedule</th>
              <th className="px-3 py-2 text-left font-normal">Description</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Last run</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-faint">
                  {allRows.length === 0
                    ? "No cron jobs registered yet."
                    : "No jobs match the current filter."}
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
                      href={`/admin/jobs/${encodeURIComponent(r.id)}`}
                      className="font-mono text-xs text-app hover:text-tool-accent"
                    >
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-app px-1.5 py-0.5 font-mono text-[11px] text-secondary">
                      {r.path}
                    </code>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-secondary">
                    {r.schedule}
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    <span className="line-clamp-2" title={r.description}>
                      {r.description || (
                        <span className="text-faint">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <form action={setCronEnabled} className="inline-flex">
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={r.enabled ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        title={r.enabled ? "Click to disable" : "Click to enable"}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
                          r.enabled
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-app text-faint border border-app"
                        }`}
                      >
                        {r.enabled ? "On" : "Off"}
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <CronStatusChip status={r.last_run_status} />
                      <div className="flex flex-col">
                        <span className="font-mono tabular-nums text-secondary">
                          {formatDateTime(r.last_run_at)}
                        </span>
                        {typeof r.last_run_duration_ms === "number" && (
                          <span className="font-mono text-[10px] text-faint">
                            {formatDuration(r.last_run_duration_ms)}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <form action={runCronNow} className="inline-flex">
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className={buttonClass}
                          title="Trigger this cron immediately"
                        >
                          Run now
                        </button>
                      </form>
                      <Link
                        href={`/admin/jobs/${encodeURIComponent(r.id)}`}
                        className={buttonGhostClass}
                      >
                        Detail
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Discovered, not registered */}
      <DiscoveredPanel
        rows={unregistered}
        vercelCrons={vercelCrons}
      />
    </div>
  );
}

function DiscoveredPanel({
  rows,
  vercelCrons,
}: {
  rows: { id: string; path: string; filePath: string }[];
  vercelCrons: Map<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-muted">
        Filesystem scan: every <code className="rounded bg-app px-1">app/api/cron/*</code>{" "}
        route is registered in <code className="rounded bg-app px-1">cron_jobs</code>. Nice.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-amber-500">
            Discovered, not registered
          </div>
          <p className="mt-0.5 text-xs text-secondary">
            {rows.length} cron route{rows.length === 1 ? "" : "s"} exist in code but not in{" "}
            <code className="rounded bg-app px-1">cron_jobs</code>. Schedule is read from{" "}
            <code className="rounded bg-app px-1">vercel.json</code> when available.
          </p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-app bg-app">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Suggested ID</th>
              <th className="px-3 py-2 text-left font-normal">Path</th>
              <th className="px-3 py-2 text-left font-normal">Schedule (vercel.json)</th>
              <th className="px-3 py-2 text-right font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const schedule = vercelCrons.get(r.path) ?? "";
              return (
                <tr
                  key={r.path}
                  className="border-b border-app last:border-b-0"
                >
                  <td className="px-3 py-2 font-mono text-xs text-app">
                    {r.id}
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-[11px] text-secondary">
                      {r.path}
                    </code>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {schedule ? (
                      <span className="text-secondary">{schedule}</span>
                    ) : (
                      <span className="text-faint italic">
                        not in vercel.json
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={registerCronJob} className="inline-flex items-center gap-1.5">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="path" value={r.path} />
                      <input
                        type="text"
                        name="schedule"
                        defaultValue={schedule || "0 9 * * *"}
                        className="h-8 w-28 rounded-md border border-app bg-app-elevated px-2 font-mono text-[11px] text-app outline-none focus:border-tool-accent"
                        title="Cron schedule"
                      />
                      <button type="submit" className={buttonClass}>
                        Register
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose" | "amber";
}) {
  const valueClass =
    accent === "rose"
      ? "text-rose-500"
      : accent === "amber"
      ? "text-amber-500"
      : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function formatDuration(ms: number | null | undefined): string {
  const n = Number(ms ?? 0);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  const mins = Math.floor(n / 60_000);
  const secs = Math.round((n - mins * 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
