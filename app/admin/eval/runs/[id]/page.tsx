import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../../_lib";
import { cancelRun } from "../../_actions";
import {
  RUN_STATUS_CHIP_CLASS,
  jsonExcerpt,
  readResults,
} from "../../_helpers";

import type { EvalRunRow } from "../../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RunDetailPage({ params }: PageProps) {
  const { id } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eval_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load run: {error.message}
      </div>
    );
  }
  const run = data as EvalRunRow | null;
  if (!run) notFound();

  const results = readResults(run.results);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={
            run.suite_id
              ? `/admin/eval/${encodeURIComponent(run.suite_id)}`
              : "/admin/eval"
          }
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← {run.suite_id ?? "Eval suites"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">
            Run {run.id.slice(0, 8)}…
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              RUN_STATUS_CHIP_CLASS[run.status] ??
              "bg-app text-faint border border-app"
            }`}
          >
            {run.status}
          </span>
          {run.status === "running" && (
            <form action={cancelRun} className="inline-flex">
              <input type="hidden" name="id" value={run.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
              >
                Cancel run
              </button>
            </form>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            id <span className="ml-1 font-mono">{run.id}</span>
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            suite{" "}
            <span className="ml-1 font-mono">{run.suite_id ?? "—"}</span>
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            started {formatDateTime(run.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            finished {formatDateTime(run.finished_at)}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={run.total_cases} />
        <StatCard
          label="Passed"
          value={run.passed_cases}
          accent="emerald"
        />
        <StatCard
          label="Failed"
          value={run.failed_cases}
          accent={run.failed_cases > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="Errored"
          value={run.errored_cases}
          accent={run.errored_cases > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Duration"
          value={run.duration_ms ?? 0}
          suffix="ms"
          accent="violet"
        />
      </div>

      {/* Per-case results */}
      <section className="rounded-xl border border-app bg-app-elevated">
        <div className="flex items-center justify-between border-b border-app px-4 py-3">
          <h2 className="text-sm font-semibold text-app">
            Case-by-case breakdown
          </h2>
          <span className="text-[11px] text-faint">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        </div>
        {results.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-faint">
            No results stored on this run.
          </div>
        ) : (
          <div className="divide-y divide-app">
            {results.map((r, idx) => (
              <div key={`${r.name}-${idx}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-faint">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-app">{r.name || "(unnamed)"}</span>
                  {r.pass ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                      pass
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                      fail
                    </span>
                  )}
                  {r.error && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                      errored
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs tabular-nums text-secondary">
                    score {r.score.toFixed(2)}
                  </span>
                  {r.duration_ms != null && (
                    <span className="font-mono text-[11px] tabular-nums text-faint">
                      {r.duration_ms}ms
                    </span>
                  )}
                </div>
                <div className="mt-2 grid gap-2 text-xs lg:grid-cols-3">
                  <CaseField label="Input" value={r.input} />
                  <CaseField label="Expected" value={r.expected} />
                  <CaseField label="Actual" value={r.actual} />
                </div>
                {r.error && (
                  <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-500">
                    {r.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stub notice */}
      {(run.metadata as Record<string, unknown> | null)?.stub === true && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
          <strong className="font-semibold">Stubbed run:</strong> the actual
          eval runner isn&apos;t wired yet. Results above were synthesized
          in-memory by the scoring method on each case&apos;s expected
          value. The DB row, audit log, and per-run UI are real — only the
          &quot;actual&quot; output is fake.
        </div>
      )}
    </div>
  );
}

function CaseField({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <pre className="mt-1 overflow-x-auto rounded-lg border border-app bg-app p-2 font-mono text-[11px] leading-relaxed text-app">
        {jsonExcerpt(value, 800)}
      </pre>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: "emerald" | "amber" | "rose" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "rose"
          ? "text-rose-500"
          : accent === "violet"
            ? "text-tool-accent"
            : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value.toLocaleString()}
        {suffix && <span className="ml-0.5 text-base">{suffix}</span>}
      </div>
    </div>
  );
}
