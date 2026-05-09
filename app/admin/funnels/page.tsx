import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../_lib";
import type { FunnelRow } from "../_types";
import { toggleFunnel } from "./_actions";
import { asFunnelSteps } from "./_helpers";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

type SearchParams = {
  q?: string;
  enabled?: string;
};

export default async function AdminFunnelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const enabledFilterRaw = (sp.enabled ?? "").trim();
  const enabledFilter =
    enabledFilterRaw === "true" || enabledFilterRaw === "false"
      ? enabledFilterRaw
      : "";

  const admin = createAdminClient();
  let query = admin
    .from("funnels")
    .select("*", { count: "exact" })
    .order("display_name", { ascending: true })
    .limit(PER_PAGE);

  if (enabledFilter) query = query.eq("enabled", enabledFilter === "true");
  if (q) {
    const escaped = q.replace(/,/g, " ").replace(/\*/g, "");
    query = query.or(
      `id.ilike.%${escaped}%,display_name.ilike.%${escaped}%,description.ilike.%${escaped}%`
    );
  }

  const { data, count } = await query;
  const rows = (data ?? []) as FunnelRow[];
  const total = count ?? rows.length;

  const stats = {
    total,
    enabled: rows.filter((r) => r.enabled).length,
    avgSteps:
      rows.length === 0
        ? 0
        : Math.round(
            rows.reduce(
              (acc, r) => acc + asFunnelSteps(r.steps).length,
              0
            ) / rows.length
          ),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Funnels</h1>
          <p className="mt-0.5 text-xs text-muted">
            Conversion funnels measured against{" "}
            <code className="font-mono">funnel_events</code>. Each step is an
            event-kind match — see the per-funnel page for conversion stats.
          </p>
        </div>
        <Link href="/admin/funnels/new" className={buttonClass}>
          + New funnel
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total funnels" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} tone="emerald" />
        <StatCard label="Avg steps" value={stats.avgSteps} tone="violet" />
      </div>

      <form
        action="/admin/funnels"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-3 sm:grid-cols-[1fr_140px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by id, name, or description"
          className={`${inputClass} h-9`}
        />
        <select
          name="enabled"
          defaultValue={enabledFilter}
          className={`${inputClass} h-9`}
        >
          <option value="">All</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Steps</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No funnels match.
                </td>
              </tr>
            ) : (
              rows.map((r) => <FunnelRowView key={r.id} row={r} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelRowView({ row }: { row: FunnelRow }) {
  const steps = asFunnelSteps(row.steps);
  const encoded = encodeURIComponent(row.id);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/funnels/${encoded}`}
          className="font-medium text-app hover:text-tool-accent"
        >
          {row.display_name}
        </Link>
        {row.description && (
          <div className="mt-0.5 truncate text-[11px] text-muted">
            {row.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-secondary">{row.id}</td>
      <td className="px-3 py-2 text-xs text-secondary">
        <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 font-mono text-[10px] font-medium text-tool-accent">
          {steps.length}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(row.updated_at)}
      </td>
      <td className="px-3 py-2">
        <form action={toggleFunnel} className="inline-flex">
          <input type="hidden" name="id" value={row.id} />
          <input
            type="hidden"
            name="next"
            value={row.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            title={row.enabled ? "Click to disable" : "Click to enable"}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
              row.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {row.enabled ? "On" : "Off"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/funnels/${encoded}`}
          className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "violet";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "violet"
        ? "text-tool-accent"
        : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
