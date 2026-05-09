import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime } from "../_lib";
import { runSuite, toggleSuite } from "./_actions";
import {
  RUN_STATUS_CHIP_CLASS,
  SCORING_LABELS,
  TARGET_CHIP_CLASS,
  readCases,
} from "./_helpers";

import type { EvalRunRow, EvalSuiteRow } from "../_types";

export const dynamic = "force-dynamic";

export default async function AdminEvalPage() {
  const admin = createAdminClient();

  const [suitesRes, runsRes] = await Promise.all([
    admin
      .from("eval_suites")
      .select("*")
      .order("display_name", { ascending: true }),
    admin
      .from("eval_runs")
      .select(
        "id, suite_id, status, total_cases, passed_cases, failed_cases, errored_cases, duration_ms, created_at, finished_at"
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (suitesRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load suites: {suitesRes.error.message}
      </div>
    );
  }

  const suites = (suitesRes.data ?? []) as EvalSuiteRow[];
  const recentRuns = (runsRes.data ?? []) as EvalRunRow[];
  const stats = computeStats(suites, recentRuns);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            AI Quality
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Eval suites</h1>
          <p className="mt-0.5 text-xs text-muted">
            Reusable test suites for agents, skills, and workflows. Each
            suite stores a list of <code className="rounded bg-app px-1 text-[11px]">{`{ name, input, expected }`}</code>{" "}
            cases plus a scoring method. Hit &quot;Run now&quot; to execute
            and see pass/fail.
          </p>
          <p className="mt-1 text-[11px] text-faint">
            The actual eval runner is environmental — runs synthesize
            results in-memory until the runner ships. The DB row, audit
            log, and per-run UI are real.
          </p>
        </div>
        <Link href="/admin/eval/new" className={buttonClass}>
          + New suite
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total suites" value={stats.totalSuites} />
        <StatCard
          label="Enabled"
          value={stats.enabledSuites}
          accent="emerald"
        />
        <StatCard
          label="Recent runs"
          value={stats.totalRuns}
          accent="violet"
        />
        <StatCard
          label="Pass rate (recent)"
          value={stats.passRatePct}
          suffix="%"
          accent={
            stats.passRatePct >= 90
              ? "emerald"
              : stats.passRatePct >= 70
                ? "amber"
                : "rose"
          }
        />
      </div>

      {/* Suites table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Suite</th>
              <th className="px-3 py-2 text-left font-normal">Target</th>
              <th className="px-3 py-2 text-left font-normal">Scoring</th>
              <th className="px-3 py-2 text-right font-normal">Cases</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-faint">
                  No suites yet. Create one above.
                </td>
              </tr>
            ) : (
              suites.map((s) => (
                <SuiteRow key={s.id} suite={s} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent runs */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Recent runs</h2>
        <p className="mt-0.5 text-xs text-muted">
          Last 10 runs across all suites.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Suite</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-right font-normal">Pass / Fail / Err</th>
                <th className="px-3 py-2 text-right font-normal">Duration</th>
                <th className="px-3 py-2 text-left font-normal">Started</th>
                <th className="px-3 py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-faint"
                  >
                    No runs yet.
                  </td>
                </tr>
              ) : (
                recentRuns.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-app">
                      {r.suite_id ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <RunStatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <PassFailCell
                        passed={r.passed_cases}
                        failed={r.failed_cases}
                        errored={r.errored_cases}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {r.duration_ms != null
                        ? `${r.duration_ms.toLocaleString()}ms`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/eval/runs/${r.id}`}
                        className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────── components ───────────────────── */

function SuiteRow({ suite }: { suite: EvalSuiteRow }) {
  const cases = readCases(suite.cases);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/eval/${encodeURIComponent(suite.id)}`}
          className="block font-medium text-app hover:text-tool-accent"
        >
          {suite.display_name}
        </Link>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {suite.id}
        </div>
        {suite.description && (
          <div className="mt-0.5 line-clamp-2 max-w-md text-[11px] text-muted">
            {suite.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              TARGET_CHIP_CLASS[suite.target_kind]
            }`}
          >
            {suite.target_kind}
          </span>
          {suite.target_id && (
            <span className="font-mono text-[11px] text-muted">
              {suite.target_id}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-secondary">
        {SCORING_LABELS[suite.scoring_method]}
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-app">
        {cases.length}
      </td>
      <td className="px-3 py-2">
        <form action={toggleSuite} className="inline-flex">
          <input type="hidden" name="id" value={suite.id} />
          <input
            type="hidden"
            name="enabled"
            value={suite.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            title={suite.enabled ? "Click to disable" : "Click to enable"}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
              suite.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {suite.enabled ? "On" : "Off"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(suite.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
          <form action={runSuite} className="inline-flex">
            <input type="hidden" name="id" value={suite.id} />
            <button
              type="submit"
              disabled={!suite.enabled || cases.length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-tool-accent px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              title={
                !suite.enabled
                  ? "Enable the suite first"
                  : cases.length === 0
                    ? "Add at least one case"
                    : "Run this suite now"
              }
            >
              Run now
            </button>
          </form>
          <Link
            href={`/admin/eval/${encodeURIComponent(suite.id)}`}
            className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
          >
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}

export function RunStatusChip({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        RUN_STATUS_CHIP_CLASS[status] ?? "bg-app text-faint border border-app"
      }`}
    >
      {status}
    </span>
  );
}

export function PassFailCell({
  passed,
  failed,
  errored,
}: {
  passed: number;
  failed: number;
  errored: number;
}) {
  const parts: string[] = [];
  if (passed > 0) parts.push(`${passed}P`);
  if (failed > 0) parts.push(`${failed}F`);
  if (errored > 0) parts.push(`${errored}E`);
  if (parts.length === 0) return <span className="text-faint">—</span>;
  return (
    <span className="font-mono text-xs tabular-nums">
      {passed > 0 && <span className="text-emerald-500">{passed}P</span>}
      {failed > 0 && (
        <>
          {passed > 0 && <span className="text-faint"> · </span>}
          <span className="text-rose-500">{failed}F</span>
        </>
      )}
      {errored > 0 && (
        <>
          {(passed > 0 || failed > 0) && <span className="text-faint"> · </span>}
          <span className="text-amber-500">{errored}E</span>
        </>
      )}
    </span>
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

function computeStats(suites: EvalSuiteRow[], runs: EvalRunRow[]) {
  let totalCasesEvaluated = 0;
  let totalPassed = 0;
  for (const r of runs) {
    totalCasesEvaluated += r.total_cases ?? 0;
    totalPassed += r.passed_cases ?? 0;
  }
  return {
    totalSuites: suites.length,
    enabledSuites: suites.filter((s) => s.enabled).length,
    totalRuns: runs.length,
    passRatePct:
      totalCasesEvaluated === 0
        ? 0
        : Math.round((totalPassed / totalCasesEvaluated) * 100),
  };
}
