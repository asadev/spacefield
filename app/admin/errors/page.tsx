import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../_lib";
import {
  ERROR_LEVELS,
  LEVEL_CHIP_CLASS,
  fetchErrorGroups,
  parseDateBoundary,
  parseLevel,
  parseResolved,
  type ErrorFilters,
} from "./_helpers";
import ExpandableErrorRow from "./_ExpandableRow";
import { reopenGroup, resolveGroup } from "./_actions";

import type { ErrorEventRow, ErrorLevel } from "../_types";

export const dynamic = "force-dynamic";

type RawSearchParams = {
  level?: string;
  source?: string;
  fingerprint?: string;
  user?: string;
  resolved?: string;
  from?: string;
  to?: string;
  group?: string;
};

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters: ErrorFilters = {
    level: parseLevel(sp.level) ?? undefined,
    source: sp.source?.trim() || undefined,
    fingerprint: sp.fingerprint?.trim() || undefined,
    user: sp.user?.trim() || undefined,
    resolved: parseResolved(sp.resolved),
    from: sp.from?.trim() || undefined,
    to: sp.to?.trim() || undefined,
    groupBy: sp.group === "fingerprint" ? "fingerprint" : "none",
  };

  const stats = await fetchStats();

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Ops
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Errors</h1>
        <p className="mt-0.5 text-xs text-muted">
          Sentry-lite. Every captured server / client exception lives in{" "}
          <code className="rounded bg-app px-1 text-[11px]">error_events</code>.
          Group by fingerprint to see the noisiest, click a row to expand
          stack &amp; context, hit &quot;Resolve&quot; to clear the group.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Open" value={stats.open} accent="rose" />
        <StatCard label="Resolved" value={stats.resolved} accent="emerald" />
        <StatCard label="Last 24h" value={stats.last24h} accent="amber" />
        <StatCard label="Fatal" value={stats.fatal} accent="rose" />
      </div>

      {/* Filter bar */}
      <Filters filters={filters} />

      {/* Tab switcher: list view vs group view */}
      <ViewSwitcher current={filters.groupBy ?? "none"} sp={sp} />

      {filters.groupBy === "fingerprint" ? (
        <GroupView filters={filters} />
      ) : (
        <ListView filters={filters} />
      )}
    </div>
  );
}

/* ──────────────────── data: stat counts ──────────────────── */

async function fetchStats() {
  const admin = createAdminClient();
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [total, open, last24h, fatal] = await Promise.all([
    admin
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
    admin
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .then((r) => r.count ?? 0),
    admin
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", since24)
      .then((r) => r.count ?? 0),
    admin
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .eq("level", "fatal")
      .is("resolved_at", null)
      .then((r) => r.count ?? 0),
  ]);

  return {
    total,
    open,
    resolved: Math.max(0, total - open),
    last24h,
    fatal,
  };
}

/* ──────────────────── filters bar ──────────────────── */

function Filters({ filters }: { filters: ErrorFilters }) {
  return (
    <form
      method="get"
      action="/admin/errors"
      className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-2 lg:grid-cols-7"
    >
      {/* preserve the group-by mode across filter submissions */}
      {filters.groupBy === "fingerprint" && (
        <input type="hidden" name="group" value="fingerprint" />
      )}
      <select
        name="level"
        defaultValue={filters.level ?? ""}
        className={`${inputClass} h-9`}
      >
        <option value="">Any level</option>
        {ERROR_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="source"
        defaultValue={filters.source ?? ""}
        placeholder="Source (e.g. api/agents)"
        className={`${inputClass} h-9`}
      />
      <input
        type="text"
        name="fingerprint"
        defaultValue={filters.fingerprint ?? ""}
        placeholder="Fingerprint contains…"
        className={`${inputClass} h-9 font-mono text-xs`}
      />
      <input
        type="text"
        name="user"
        defaultValue={filters.user ?? ""}
        placeholder="User UUID"
        className={`${inputClass} h-9 font-mono text-xs`}
      />
      <select
        name="resolved"
        defaultValue={filters.resolved ?? "all"}
        className={`${inputClass} h-9`}
      >
        <option value="all">Any state</option>
        <option value="no">Open only</option>
        <option value="yes">Resolved only</option>
      </select>
      <input
        type="date"
        name="from"
        defaultValue={filters.from ?? ""}
        className={`${inputClass} h-9`}
      />
      <input
        type="date"
        name="to"
        defaultValue={filters.to ?? ""}
        className={`${inputClass} h-9`}
      />
      <div className="sm:col-span-2 lg:col-span-7 flex justify-end gap-2">
        <Link href="/admin/errors" className={buttonGhostClass}>
          Clear
        </Link>
        <button type="submit" className={buttonClass}>
          Apply filters
        </button>
      </div>
    </form>
  );
}

function ViewSwitcher({
  current,
  sp,
}: {
  current: "none" | "fingerprint";
  sp: RawSearchParams;
}) {
  const params = new URLSearchParams();
  if (sp.level) params.set("level", sp.level);
  if (sp.source) params.set("source", sp.source);
  if (sp.fingerprint) params.set("fingerprint", sp.fingerprint);
  if (sp.user) params.set("user", sp.user);
  if (sp.resolved) params.set("resolved", sp.resolved);
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);
  const baseQS = params.toString();
  const groupQS = baseQS
    ? `${baseQS}&group=fingerprint`
    : "group=fingerprint";

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-app">
      <Link
        href={`/admin/errors${baseQS ? `?${baseQS}` : ""}`}
        className={[
          "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors",
          current === "none"
            ? "border-tool-accent bg-app-elevated text-app font-medium"
            : "border-transparent text-secondary hover:text-app hover:bg-app-elevated/60",
        ].join(" ")}
      >
        Event list
      </Link>
      <Link
        href={`/admin/errors?${groupQS}`}
        className={[
          "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors",
          current === "fingerprint"
            ? "border-tool-accent bg-app-elevated text-app font-medium"
            : "border-transparent text-secondary hover:text-app hover:bg-app-elevated/60",
        ].join(" ")}
      >
        Group by fingerprint
      </Link>
    </div>
  );
}

/* ──────────────────── list view ──────────────────── */

async function ListView({ filters }: { filters: ErrorFilters }) {
  const admin = createAdminClient();
  let query = admin
    .from("error_events")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (filters.level) query = query.eq("level", filters.level);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.fingerprint)
    query = query.ilike("fingerprint", `%${filters.fingerprint}%`);
  if (filters.user) query = query.eq("user_id", filters.user);
  if (filters.resolved === "yes") query = query.not("resolved_at", "is", null);
  else if (filters.resolved === "no") query = query.is("resolved_at", null);

  const fromTs = parseDateBoundary(filters.from, false);
  const toTs = parseDateBoundary(filters.to, true);
  if (fromTs) query = query.gte("occurred_at", fromTs);
  if (toTs) query = query.lte("occurred_at", toTs);

  const { data, count, error } = await query;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load errors: {error.message}
      </div>
    );
  }
  const rows = (data ?? []) as ErrorEventRow[];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>
          Showing {rows.length.toLocaleString()} of {(count ?? 0).toLocaleString()}{" "}
          matching events. Click any row to expand.
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 text-left font-normal">Level</th>
              <th className="px-3 py-2 text-left font-normal">Message</th>
              <th className="px-3 py-2 text-left font-normal">Source</th>
              <th className="px-3 py-2 text-left font-normal">Occurred</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-faint"
                >
                  No errors match these filters.
                </td>
              </tr>
            ) : (
              rows.map((event) => (
                <ExpandableErrorRow
                  key={event.id}
                  event={event}
                  levelChipClass={
                    LEVEL_CHIP_CLASS[event.level as ErrorLevel] ??
                    LEVEL_CHIP_CLASS.error
                  }
                  formattedOccurredAt={formatDateTime(event.occurred_at)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────── group view ──────────────────── */

async function GroupView({ filters }: { filters: ErrorFilters }) {
  const { groups } = await fetchErrorGroups(filters);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>
          {groups.length.toLocaleString()} unique fingerprints in the latest
          1000 events under these filters. Sorted by count desc.
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Level</th>
              <th className="px-3 py-2 text-left font-normal">Message</th>
              <th className="px-3 py-2 text-left font-normal">Source</th>
              <th className="px-3 py-2 text-right font-normal">Count</th>
              <th className="px-3 py-2 text-left font-normal">First seen</th>
              <th className="px-3 py-2 text-left font-normal">Last seen</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-faint"
                >
                  No groups under current filters.
                </td>
              </tr>
            ) : (
              groups.map((g) => {
                const allResolved =
                  g.resolved_count > 0 && g.resolved_count === g.count;
                return (
                  <tr
                    key={g.fingerprint}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          LEVEL_CHIP_CLASS[g.level as ErrorLevel] ??
                          LEVEL_CHIP_CLASS.error
                        }`}
                      >
                        {g.level}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="line-clamp-2 max-w-2xl text-sm text-app">
                        {g.message}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {g.fingerprint.startsWith("__msg__:")
                          ? "(message-grouped)"
                          : g.fingerprint}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-secondary">
                      {g.source ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-right font-mono text-sm font-semibold tabular-nums text-app">
                      {g.count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(g.first_seen)}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(g.last_seen)}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {allResolved ? (
                          <form action={reopenGroup} className="inline-flex">
                            <input
                              type="hidden"
                              name="fingerprint"
                              value={g.fingerprint}
                            />
                            <button
                              type="submit"
                              className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                            >
                              Re-open
                            </button>
                          </form>
                        ) : (
                          <form action={resolveGroup} className="inline-flex">
                            <input
                              type="hidden"
                              name="fingerprint"
                              value={g.fingerprint}
                            />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                            >
                              Resolve group
                            </button>
                          </form>
                        )}
                      </div>
                      {g.resolved_count > 0 && !allResolved && (
                        <div className="mt-1 text-[10px] text-faint">
                          {g.resolved_count} of {g.count} previously resolved
                        </div>
                      )}
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

/* ──────────────────── stat card ──────────────────── */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
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
      </div>
    </div>
  );
}
