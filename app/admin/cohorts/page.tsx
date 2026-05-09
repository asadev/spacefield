import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../_lib";
import type { CohortRow } from "../_types";
import { recomputeCohort, toggleCohort } from "./_actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;
const STALE_MS = 24 * 60 * 60 * 1000;

type SearchParams = {
  q?: string;
  enabled?: string;
};

export default async function AdminCohortsPage({
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
    .from("cohorts")
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
  const rows = (data ?? []) as CohortRow[];
  const total = count ?? rows.length;

  const now = Date.now();
  const stats = {
    total,
    enabled: rows.filter((r) => r.enabled).length,
    totalMembers: rows.reduce((acc, r) => acc + (r.user_count ?? 0), 0),
    stale: rows.filter(
      (r) =>
        !r.last_computed_at ||
        now - new Date(r.last_computed_at).getTime() > STALE_MS
    ).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            People
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Cohorts</h1>
          <p className="mt-0.5 text-xs text-muted">
            Saved user segments. Recompute on demand to refresh membership.
            Definition is a JSON object — currently supports{" "}
            <code className="font-mono">tier</code> and{" "}
            <code className="font-mono">signed_up_after</code>.
          </p>
        </div>
        <Link href="/admin/cohorts/new" className={buttonClass}>
          + New cohort
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total cohorts" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} tone="emerald" />
        <StatCard label="Total members" value={stats.totalMembers} tone="violet" />
        <StatCard label="Stale (>24h)" value={stats.stale} tone="amber" />
      </div>

      <form
        action="/admin/cohorts"
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
              <th className="px-3 py-2 text-left font-normal">User count</th>
              <th className="px-3 py-2 text-left font-normal">Last computed</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No cohorts match.
                </td>
              </tr>
            ) : (
              rows.map((r) => <CohortRowView key={r.id} row={r} now={now} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CohortRowView({ row, now }: { row: CohortRow; now: number }) {
  const last = row.last_computed_at
    ? new Date(row.last_computed_at).getTime()
    : null;
  const stale =
    last === null || now - last > STALE_MS;
  const encoded = encodeURIComponent(row.id);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/cohorts/${encoded}`}
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
      <td className="px-3 py-2 font-mono text-sm tabular-nums text-app">
        {(row.user_count ?? 0).toLocaleString()}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-secondary">
            {formatDateTime(row.last_computed_at)}
          </span>
          {stale && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              stale
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <form action={toggleCohort} className="inline-flex">
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
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <form action={recomputeCohort}>
            <input type="hidden" name="id" value={row.id} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
              title="Re-evaluate definition against users and refresh membership."
            >
              Recompute
            </button>
          </form>
          <Link
            href={`/admin/cohorts/${encoded}`}
            className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
          >
            Edit
          </Link>
        </div>
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
  tone?: "default" | "emerald" | "violet" | "amber";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "violet"
        ? "text-tool-accent"
        : tone === "amber"
          ? "text-amber-500"
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
