import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { CronJobRow, CronRunRow } from "../../_types";

import CronStatusChip from "../_components/CronStatusChip";
import { deleteCron, runCronNow, updateCron } from "../_actions";

export const dynamic = "force-dynamic";

const RUNS_PER_PAGE = 50;

export default async function AdminJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ expanded?: string }>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId);
  const expandedRunId = (sp.expanded ?? "").trim();

  const admin = createAdminClient();

  const [jobRes, runsRes, runsCountRes, errorsCountRes] = await Promise.all([
    admin
      .from("cron_jobs")
      .select(
        "id, path, schedule, description, enabled, last_run_at, last_run_status, last_run_duration_ms, metadata, created_at, updated_at, updated_by"
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("cron_runs")
      .select(
        "id, job_id, started_at, finished_at, status, summary, error, triggered_by, metadata"
      )
      .eq("job_id", id)
      .order("started_at", { ascending: false })
      .limit(RUNS_PER_PAGE),
    admin
      .from("cron_runs")
      .select("id", { count: "exact", head: true })
      .eq("job_id", id),
    admin
      .from("cron_runs")
      .select("id", { count: "exact", head: true })
      .eq("job_id", id)
      .eq("status", "error"),
  ]);

  if (jobRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load job: {jobRes.error.message}
      </div>
    );
  }
  if (!jobRes.data) notFound();
  const job = jobRes.data as CronJobRow;
  const runs = (runsRes.data ?? []) as CronRunRow[];
  const totalRuns = runsCountRes.count ?? 0;
  const totalErrors = errorsCountRes.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            <Link
              href="/admin/jobs"
              className="hover:text-tool-accent"
            >
              Jobs &amp; cron
            </Link>
            <span>/</span>
            <span className="font-mono text-app">{job.id}</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">{job.id}</h1>
          <p className="mt-0.5 text-xs text-muted">
            <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-[11px] text-secondary">
              {job.path}
            </code>{" "}
            ·{" "}
            <span className="font-mono">{job.schedule}</span>{" "}
            · {totalRuns.toLocaleString()} runs ·{" "}
            <span className={totalErrors > 0 ? "text-rose-500" : ""}>
              {totalErrors.toLocaleString()} errors
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={runCronNow}>
            <input type="hidden" name="id" value={job.id} />
            <button type="submit" className={buttonClass} title="Trigger this cron immediately">
              Run now
            </button>
          </form>
          <Link href="/admin/jobs" className={buttonGhostClass}>
            ← Back
          </Link>
        </div>
      </div>

      {/* Last run summary card */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Last status"
          valueNode={<CronStatusChip status={job.last_run_status} />}
        />
        <SummaryCard
          label="Last run at"
          value={formatDateTime(job.last_run_at)}
          mono
        />
        <SummaryCard
          label="Last duration"
          value={formatDuration(job.last_run_duration_ms)}
          mono
        />
        <SummaryCard
          label="Schedule"
          value={job.schedule}
          mono
        />
      </div>

      {/* Edit form */}
      <div className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Edit
          </div>
          <form action={deleteCron}>
            <input type="hidden" name="id" value={job.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
              title="Remove this row from cron_jobs (does not affect vercel.json)"
            >
              Delete row
            </button>
          </form>
        </div>
        <form action={updateCron} className="space-y-3">
          <input type="hidden" name="id" value={job.id} />

          <Field
            label="Description"
            hint="Free-form text describing what this cron does. Shown in the index."
          >
            <textarea
              name="description"
              rows={2}
              defaultValue={job.description}
              placeholder="Publishes scheduled social_posts whose scheduled_at has passed."
              className={`${inputClass} min-h-[64px]`}
            />
          </Field>

          <div className="flex items-center gap-3 rounded-lg border border-app bg-app p-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-app">
              <input
                type="checkbox"
                name="enabled"
                value="true"
                defaultChecked={job.enabled}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Enabled</span>
            </label>
            <p className="flex-1 text-[11px] text-muted">
              When off, routes that opt into{" "}
              <code className="rounded bg-app-elevated px-1">
                lib/cron/_check_enabled.ts
              </code>{" "}
              will short-circuit. Routes that haven&rsquo;t opted in still
              run on schedule — wire the helper into a route to enforce
              this toggle.
            </p>
          </div>

          <div>
            <button type="submit" className={buttonClass}>
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Run history */}
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              Run history
            </div>
            <h2 className="mt-1 text-base font-semibold text-app">
              Last {RUNS_PER_PAGE} runs
            </h2>
          </div>
          <p className="text-[11px] text-muted">
            {runs.length} shown · {totalRuns.toLocaleString()} total
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Started</th>
                <th className="px-3 py-2 text-left font-normal">Finished</th>
                <th className="px-3 py-2 text-left font-normal">Duration</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">Trigger</th>
                <th className="px-3 py-2 text-left font-normal">Summary</th>
                <th className="px-3 py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-faint">
                    No runs yet. Click &ldquo;Run now&rdquo; to fire one.
                  </td>
                </tr>
              ) : (
                runs.map((r) => {
                  const isExpanded = expandedRunId === r.id;
                  const expandHref = isExpanded
                    ? `/admin/jobs/${encodeURIComponent(job.id)}`
                    : `/admin/jobs/${encodeURIComponent(job.id)}?expanded=${encodeURIComponent(r.id)}#run-${r.id}`;
                  return <RunRowGroup key={r.id} run={r} expanded={isExpanded} expandHref={expandHref} />;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RunRowGroup({
  run,
  expanded,
  expandHref,
}: {
  run: CronRunRow;
  expanded: boolean;
  expandHref: string;
}) {
  const durationMs = computeDuration(run);
  return (
    <>
      <tr
        id={`run-${run.id}`}
        className="border-b border-app last:border-b-0 hover:bg-app/40"
      >
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
          {formatDateTime(run.started_at)}
        </td>
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
          {formatDateTime(run.finished_at)}
        </td>
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
          {formatDuration(durationMs)}
        </td>
        <td className="px-3 py-2">
          <CronStatusChip status={run.status} />
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary border border-app">
            {run.triggered_by}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-secondary">
          {run.summary ? (
            <span className="line-clamp-2 break-words" title={run.summary}>
              {run.summary}
            </span>
          ) : run.error ? (
            <span className="line-clamp-2 break-words text-rose-500" title={run.error}>
              {run.error}
            </span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <Link
            href={expandHref}
            scroll={false}
            className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
          >
            {expanded ? "Hide" : "Detail"}
          </Link>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-app bg-app/30">
          <td colSpan={7} className="px-3 py-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <KV label="Run ID" value={run.id} mono />
              <KV label="Job ID" value={run.job_id ?? "—"} mono />
              <KV
                label="Started"
                value={formatDateTime(run.started_at)}
                mono
              />
              <KV
                label="Finished"
                value={formatDateTime(run.finished_at)}
                mono
              />
              <KV
                label="Duration"
                value={formatDuration(durationMs)}
                mono
              />
              <KV label="Triggered by" value={run.triggered_by} />
            </div>
            {run.error && (
              <div className="mt-3">
                <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-rose-500">
                  Error
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] leading-relaxed text-rose-500">
                  {run.error}
                </pre>
              </div>
            )}
            {run.summary && (
              <div className="mt-3">
                <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                  Summary
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-2 text-[11px] leading-relaxed text-secondary">
                  {run.summary}
                </pre>
              </div>
            )}
            <div className="mt-3">
              <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                Metadata
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-2 text-[11px] leading-relaxed text-secondary">
                {prettyJson(run.metadata)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated p-2">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 break-all text-xs text-app ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function SummaryCard({
  label,
  value,
  valueNode,
  mono,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 text-sm text-app ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {valueNode ?? value ?? "—"}
      </div>
    </div>
  );
}

function computeDuration(run: CronRunRow): number | null {
  const meta = run.metadata as { duration_ms?: number } | null | undefined;
  if (meta && typeof meta.duration_ms === "number") return meta.duration_ms;
  if (!run.finished_at) return null;
  const start = new Date(run.started_at).getTime();
  const finish = new Date(run.finished_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(finish)) return null;
  return Math.max(0, finish - start);
}

function formatDuration(ms: number | null | undefined): string {
  const n = Number(ms ?? NaN);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  const mins = Math.floor(n / 60_000);
  const secs = Math.round((n - mins * 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}
