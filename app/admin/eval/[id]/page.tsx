import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime } from "../../_lib";
import { runSuite } from "../_actions";
import {
  TARGET_CHIP_CLASS,
  TARGET_KINDS,
  fetchTargetOptions,
  readCases,
} from "../_helpers";
import { PassFailCell, RunStatusChip } from "../page";
import SuiteForm from "../_SuiteForm";
import { updateSuite } from "../_actions";
import DeleteSuiteButton from "./_DeleteSuiteButton";

import type {
  EvalRunRow,
  EvalSuiteRow,
  EvalTargetKind,
} from "../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ target_kind?: string }>;
};

export default async function SuiteDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).toLowerCase();

  const admin = createAdminClient();
  const [suiteRes, runsRes, targets] = await Promise.all([
    admin.from("eval_suites").select("*").eq("id", id).maybeSingle(),
    admin
      .from("eval_runs")
      .select("*")
      .eq("suite_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    fetchTargetOptions(),
  ]);

  if (suiteRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load suite: {suiteRes.error.message}
      </div>
    );
  }
  const suite = suiteRes.data as EvalSuiteRow | null;
  if (!suite) notFound();

  // The form's target_kind dropdown can be overridden via ?target_kind=
  // so the candidate dropdown re-renders without saving. Default to
  // whatever the suite currently has.
  const selectedKind: EvalTargetKind = (TARGET_KINDS as readonly string[]).includes(
    sp.target_kind ?? ""
  )
    ? (sp.target_kind as EvalTargetKind)
    : (suite.target_kind as EvalTargetKind);

  const runs = (runsRes.data ?? []) as EvalRunRow[];
  const cases = readCases(suite.cases);

  const stats = {
    totalRuns: runs.length,
    avgDuration: runs.length
      ? Math.round(
          runs.reduce((acc, r) => acc + (r.duration_ms ?? 0), 0) / runs.length
        )
      : 0,
    passRate: (() => {
      const total = runs.reduce((acc, r) => acc + (r.total_cases ?? 0), 0);
      const passed = runs.reduce((acc, r) => acc + (r.passed_cases ?? 0), 0);
      return total === 0 ? 0 : Math.round((passed / total) * 100);
    })(),
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/eval"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Eval suites
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">
            {suite.display_name}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              TARGET_CHIP_CLASS[suite.target_kind]
            }`}
          >
            {suite.target_kind}
            {suite.target_id && (
              <span className="ml-1 font-mono opacity-70">
                · {suite.target_id}
              </span>
            )}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              suite.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {suite.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span className="font-mono">id={suite.id}</span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            {cases.length} case{cases.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(suite.updated_at)}
          </span>
          <form action={runSuite} className="inline-flex">
            <input type="hidden" name="id" value={suite.id} />
            <button
              type="submit"
              disabled={!suite.enabled || cases.length === 0}
              className={`${buttonClass} disabled:opacity-40`}
              title={
                !suite.enabled
                  ? "Enable the suite first"
                  : cases.length === 0
                    ? "Add at least one case"
                    : "Run now"
              }
            >
              Run now
            </button>
          </form>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total runs" value={stats.totalRuns} />
        <StatCard
          label="Pass rate"
          value={stats.passRate}
          suffix="%"
          accent={
            stats.passRate >= 90
              ? "emerald"
              : stats.passRate >= 70
                ? "amber"
                : "rose"
          }
        />
        <StatCard
          label="Avg duration"
          value={stats.avgDuration}
          suffix="ms"
          accent="violet"
        />
      </div>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit suite</h2>
        <div className="mt-4">
          <SuiteForm
            mode="edit"
            action={updateSuite}
            suite={suite}
            targets={targets}
            selectedKind={selectedKind}
          />
        </div>
      </section>

      {/* Re-list targets helper */}
      <form
        method="get"
        action={`/admin/eval/${encodeURIComponent(suite.id)}`}
        className="flex items-center gap-2"
      >
        <select
          name="target_kind"
          defaultValue={selectedKind}
          className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app"
        >
          {TARGET_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Re-list targets
        </button>
        <span className="text-[11px] text-faint">
          (purely re-renders the &quot;Target ID&quot; dropdown above —
          doesn&apos;t save anything)
        </span>
      </form>

      {/* Run history */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">Run history</h2>
          <span className="text-[11px] text-faint">
            Last {runs.length} runs
          </span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-right font-normal">Pass / Fail / Err</th>
                <th className="px-3 py-2 text-right font-normal">Cases</th>
                <th className="px-3 py-2 text-right font-normal">Duration</th>
                <th className="px-3 py-2 text-left font-normal">Started</th>
                <th className="px-3 py-2 text-left font-normal">Finished</th>
                <th className="px-3 py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-faint"
                  >
                    No runs yet. Hit &quot;Run now&quot; above.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
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
                      {r.total_cases}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {r.duration_ms != null
                        ? `${r.duration_ms.toLocaleString()}ms`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.finished_at)}
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

      {/* Danger */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this suite. All run history attached to it
          will cascade-delete.
        </p>
        <div className="mt-3">
          <DeleteSuiteButton id={suite.id} />
        </div>
      </section>
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
