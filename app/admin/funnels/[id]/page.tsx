import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonGhostClass, formatDateTime, inputClass } from "../../_lib";
import type { FunnelRow } from "../../_types";
import { deleteFunnel, updateFunnel } from "../_actions";
import FunnelChart, {
  type FunnelChartStep,
} from "../_components/FunnelChart";
import FunnelForm from "../_components/FunnelForm";
import {
  asFunnelSteps,
  pickRangeDays,
  RANGE_OPTIONS,
} from "../_helpers";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
};

type FunnelEventRow = {
  funnel_id: string | null;
  step_index: number;
  user_id: string | null;
};

export default async function FunnelDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).toLowerCase();
  const rangeValue = sp.range ?? "30";
  const rangeDays = pickRangeDays(rangeValue);

  const admin = createAdminClient();
  const { data: funnelData } = await admin
    .from("funnels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const funnel = (funnelData as FunnelRow | null) ?? null;
  if (!funnel) notFound();

  const steps = asFunnelSteps(funnel.steps);

  // Compute distinct user counts per step by paginating through
  // funnel_events. We pull (user_id, step_index) for the funnel within
  // the date range, then dedupe per step in memory. For very high-volume
  // funnels an RPC aggregator would be preferable; v3 funnels have
  // bounded volume so this works.
  const sinceISO = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
  const SCAN_LIMIT = 50000;

  const stepUsers: Set<string>[] = steps.map(() => new Set<string>());
  let scanned = 0;

  if (steps.length > 0) {
    const { data: eventData } = await admin
      .from("funnel_events")
      .select("funnel_id, step_index, user_id")
      .eq("funnel_id", id)
      .gte("occurred_at", sinceISO)
      .limit(SCAN_LIMIT);
    const events = (eventData ?? []) as FunnelEventRow[];
    scanned = events.length;
    for (const e of events) {
      if (typeof e.step_index !== "number") continue;
      if (e.step_index < 0 || e.step_index >= steps.length) continue;
      if (!e.user_id) continue;
      stepUsers[e.step_index].add(e.user_id);
    }
  }

  const chartSteps: FunnelChartStep[] = steps.map((s, i) => ({
    ...s,
    count: stepUsers[i]?.size ?? 0,
  }));

  const top = chartSteps[0]?.count ?? 0;
  const bottom = chartSteps[chartSteps.length - 1]?.count ?? 0;
  const overall = top > 0 ? (bottom / top) * 100 : 0;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/funnels"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Funnels
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">{funnel.display_name}</h1>
          <span className="rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-secondary">
            {funnel.id}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              funnel.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {funnel.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(funnel.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(funnel.created_at)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Steps" value={steps.length} />
        <Card label="Top step users" value={top} tone="violet" />
        <Card label="Bottom step users" value={bottom} tone="violet" />
        <Card
          label="Overall conversion"
          value={`${overall.toFixed(1)}%`}
          tone={overall >= 25 ? "emerald" : overall >= 5 ? "amber" : "rose"}
          mono
        />
      </div>

      {/* Conversion view */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app">Conversion</h2>
            <p className="mt-0.5 text-xs text-muted">
              Distinct users per step. Scanned{" "}
              <span className="font-mono">{scanned.toLocaleString()}</span> events
              in the last <span className="font-mono">{rangeDays}</span> days.
            </p>
          </div>
          <form
            method="get"
            action={`/admin/funnels/${encodeURIComponent(id)}`}
            className="flex items-center gap-2"
          >
            <select
              name="range"
              defaultValue={rangeValue}
              className={`${inputClass} h-9`}
            >
              {RANGE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-lg border border-app bg-app px-3 text-sm text-app transition-colors hover:border-tool-accent"
            >
              Apply
            </button>
          </form>
        </div>
        <div className="mt-4 rounded-xl border border-app bg-app p-3">
          <FunnelChart
            steps={chartSteps}
            rangeLabel={`Last ${rangeDays} days`}
          />
        </div>

        {/* Step-by-step table */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">#</th>
                <th className="px-3 py-2 text-left font-normal">Step</th>
                <th className="px-3 py-2 text-left font-normal">Event kind</th>
                <th className="px-3 py-2 text-left font-normal">Users</th>
                <th className="px-3 py-2 text-left font-normal">Conversion</th>
                <th className="px-3 py-2 text-left font-normal">Drop-off</th>
              </tr>
            </thead>
            <tbody>
              {chartSteps.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No steps defined.
                  </td>
                </tr>
              ) : (
                chartSteps.map((s, i) => {
                  const prev = i > 0 ? chartSteps[i - 1].count : null;
                  const conv =
                    prev !== null && prev > 0
                      ? (s.count / prev) * 100
                      : null;
                  const drop = prev !== null ? prev - s.count : null;
                  return (
                    <tr
                      key={`${i}-${s.event_kind}-${s.name}`}
                      className="border-b border-app last:border-b-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 text-sm text-app">{s.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">
                        {s.event_kind}
                      </td>
                      <td className="px-3 py-2 font-mono text-sm tabular-nums text-app">
                        {s.count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">
                        {conv === null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <span
                            className={
                              conv >= 50
                                ? "text-emerald-500"
                                : conv >= 25
                                  ? "text-amber-500"
                                  : "text-rose-500"
                            }
                          >
                            {conv.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {drop === null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          drop.toLocaleString()
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit funnel</h2>
        <p className="mt-0.5 text-xs text-muted">
          Step indexes are positional — reordering or removing steps will
          invalidate historical events for the affected indexes.
        </p>
        <div className="mt-4">
          <FunnelForm
            funnel={funnel}
            action={updateFunnel}
            submitLabel="Save changes"
          />
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this funnel and cascade-delete all its events.
        </p>
        <form action={deleteFunnel} className="mt-3">
          <input type="hidden" name="id" value={funnel.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete {funnel.id}
          </button>
        </form>
      </section>

      <div>
        <Link href="/admin/funnels" className={buttonGhostClass}>
          Back to funnels
        </Link>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "violet" | "emerald" | "amber" | "rose";
  mono?: boolean;
}) {
  const toneCls =
    tone === "violet"
      ? "text-tool-accent"
      : tone === "emerald"
        ? "text-emerald-500 dark:text-emerald-400"
        : tone === "amber"
          ? "text-amber-500"
          : tone === "rose"
            ? "text-rose-500"
            : "text-app";
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 truncate font-semibold tabular-nums ${toneCls} ${
          mono ? "font-mono text-xl" : "text-2xl"
        }`}
      >
        {display}
      </div>
    </div>
  );
}
