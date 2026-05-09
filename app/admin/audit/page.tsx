import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";
import type { AdminAuditLogRow } from "../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/**
 * Action-category coloring. The map keys are the prefix before the first
 * dot in the action string (e.g. `app.publish_toggle` → `app`). Anything
 * not in the map falls through to a neutral chip.
 */
const ACTION_COLORS: Record<string, string> = {
  app: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  agent: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  domain: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  feature: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  user: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

const NEUTRAL_CHIP = "bg-app-elevated text-secondary border border-app";

function actionChipClass(action: string): string {
  const prefix = action.split(".")[0] ?? "";
  return ACTION_COLORS[prefix] ?? NEUTRAL_CHIP;
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function summarize(row: AdminAuditLogRow): string {
  const verb = row.action.split(".").slice(1).join(".") || row.action;
  const target = row.target_type
    ? `${row.target_type}${row.target_id ? `:${truncate(row.target_id, 14)}` : ""}`
    : "";
  return [verb, target].filter(Boolean).join(" → ");
}

function safeIsoStart(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function safeIsoEnd(value: string | undefined): string | null {
  if (!value) return null;
  // YYYY-MM-DD inputs land on midnight UTC. For an inclusive end-of-day
  // filter add a day so .lte still works as "any time on that date".
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T23:59:59.999Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Stats = {
  last24h: number;
  last7d: number;
  distinctActors7d: number;
  topActions7d: Array<{ action: string; count: number }>;
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    actor?: string;
    action?: string;
    target_type?: string;
    from?: string;
    to?: string;
    expanded?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const actorQ = (sp.actor ?? "").trim();
  const actionQ = (sp.action ?? "").trim();
  const targetTypeQ = (sp.target_type ?? "").trim();
  const fromQ = (sp.from ?? "").trim();
  const toQ = (sp.to ?? "").trim();
  const expandedId = (sp.expanded ?? "").trim();

  const fromIso = safeIsoStart(fromQ);
  const toIso = safeIsoEnd(toQ);

  const admin = createAdminClient();

  const offset = (page - 1) * PER_PAGE;

  // List query (rows) with filters
  let listQuery = admin
    .from("admin_audit_log")
    .select(
      "id, actor_id, actor_email, action, target_type, target_id, before, after, ip, user_agent, metadata, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (actorQ) listQuery = listQuery.ilike("actor_email", `%${actorQ}%`);
  if (actionQ) listQuery = listQuery.ilike("action", `${actionQ}%`);
  if (targetTypeQ) listQuery = listQuery.eq("target_type", targetTypeQ);
  if (fromIso) listQuery = listQuery.gte("created_at", fromIso);
  if (toIso) listQuery = listQuery.lte("created_at", toIso);

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Stat queries — three head-only counts and a window for top actions.
  const [
    listRes,
    last24Res,
    last7Res,
    last7WindowRes,
    targetTypesRes,
  ] = await Promise.all([
    listQuery,
    admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo),
    admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    admin
      .from("admin_audit_log")
      .select("actor_id, action")
      .gte("created_at", sevenDaysAgo)
      .limit(5000),
    admin
      .from("admin_audit_log")
      .select("target_type")
      .not("target_type", "is", null)
      .limit(2000),
  ]);

  const rows = (listRes.data ?? []) as AdminAuditLogRow[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Compute distinct actors + top actions from the 7d window.
  const windowRows =
    (last7WindowRes.data ?? []) as Array<{
      actor_id: string | null;
      action: string;
    }>;
  const actorsSet = new Set<string>();
  const actionCounts = new Map<string, number>();
  for (const r of windowRows) {
    if (r.actor_id) actorsSet.add(r.actor_id);
    actionCounts.set(r.action, (actionCounts.get(r.action) ?? 0) + 1);
  }
  const topActions = Array.from(actionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }));

  const stats: Stats = {
    last24h: last24Res.count ?? 0,
    last7d: last7Res.count ?? 0,
    distinctActors7d: actorsSet.size,
    topActions7d: topActions,
  };

  const targetTypeOptions = Array.from(
    new Set(
      ((targetTypesRes.data ?? []) as Array<{ target_type: string | null }>)
        .map((r) => r.target_type)
        .filter((t): t is string => !!t)
    )
  ).sort();

  // Filter-preserving param builder for pagination + expand toggles.
  const baseParams = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (actorQ) p.set("actor", actorQ);
    if (actionQ) p.set("action", actionQ);
    if (targetTypeQ) p.set("target_type", targetTypeQ);
    if (fromQ) p.set("from", fromQ);
    if (toQ) p.set("to", toQ);
    if (page > 1) p.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    return p;
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Audit
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Admin action log
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          {total.toLocaleString()} total · page {page} of {totalPages}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Last 24h" value={stats.last24h.toLocaleString()} />
        <StatCard label="Last 7d" value={stats.last7d.toLocaleString()} />
        <StatCard
          label="Distinct actors (7d)"
          value={stats.distinctActors7d.toLocaleString()}
        />
        <div className="rounded-xl border border-app bg-app-elevated p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Top actions (7d)
          </div>
          {stats.topActions7d.length === 0 ? (
            <div className="mt-2 text-xs text-faint">No activity.</div>
          ) : (
            <ul className="mt-2 space-y-1">
              {stats.topActions7d.map((t) => (
                <li
                  key={t.action}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span
                    className={`truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${actionChipClass(
                      t.action
                    )}`}
                    title={t.action}
                  >
                    {t.action}
                  </span>
                  <span className="font-mono tabular-nums text-secondary">
                    {t.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Filters */}
      <form
        action="/admin/audit"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <Field label="Actor email">
          <input
            type="search"
            name="actor"
            defaultValue={actorQ}
            placeholder="email contains…"
            className={`${inputClass} h-9 w-48`}
          />
        </Field>
        <Field label="Action prefix">
          <input
            type="search"
            name="action"
            defaultValue={actionQ}
            placeholder="e.g. app."
            className={`${inputClass} h-9 w-40`}
          />
        </Field>
        <Field label="Target type">
          <select
            name="target_type"
            defaultValue={targetTypeQ}
            className={`${inputClass} h-9 w-44`}
          >
            <option value="">Any</option>
            {targetTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={fromQ}
            className={`${inputClass} h-9 w-40`}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={toQ}
            className={`${inputClass} h-9 w-40`}
          />
        </Field>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/audit"
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
              <th className="px-3 py-2 text-left font-normal">When</th>
              <th className="px-3 py-2 text-left font-normal">Actor</th>
              <th className="px-3 py-2 text-left font-normal">Action</th>
              <th className="px-3 py-2 text-left font-normal">Target</th>
              <th className="px-3 py-2 text-left font-normal">Summary</th>
              <th className="px-3 py-2 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No events match.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isExpanded = expandedId === r.id;
                const expandParams = baseParams({
                  expanded: isExpanded ? undefined : r.id,
                });
                return (
                  <RowGroup
                    key={r.id}
                    row={r}
                    expanded={isExpanded}
                    expandHref={`/admin/audit?${expandParams.toString()}${
                      isExpanded ? "" : `#row-${r.id}`
                    }`}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink
          params={baseParams({ page: String(Math.max(1, page - 1)) })}
          disabled={page <= 1}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          params={baseParams({ page: String(Math.min(totalPages, page + 1)) })}
          disabled={page >= totalPages}
        >
          Next →
        </PageLink>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-app">{value}</div>
    </div>
  );
}

function PageLink({
  params,
  disabled,
  children,
}: {
  params: URLSearchParams;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/audit?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}

function RowGroup({
  row,
  expanded,
  expandHref,
}: {
  row: AdminAuditLogRow;
  expanded: boolean;
  expandHref: string;
}) {
  const summary = summarize(row);
  return (
    <>
      <tr
        id={`row-${row.id}`}
        className="border-b border-app last:border-b-0 hover:bg-app/40"
      >
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
          {formatDateTime(row.created_at)}
        </td>
        <td className="px-3 py-2 text-xs text-app">
          <div className="truncate" title={row.actor_email ?? ""}>
            {row.actor_email ?? (
              <span className="text-faint">—</span>
            )}
          </div>
          {row.actor_id && (
            <div
              className="truncate font-mono text-[10px] text-faint"
              title={row.actor_id}
            >
              {row.actor_id.slice(0, 8)}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${actionChipClass(
              row.action
            )}`}
          >
            {row.action}
          </span>
        </td>
        <td className="px-3 py-2 text-xs">
          {row.target_type ? (
            <div>
              <div className="text-secondary">{row.target_type}</div>
              {row.target_id && (
                <div
                  className="truncate font-mono text-[10px] text-faint"
                  title={row.target_id}
                >
                  {truncate(row.target_id, 24)}
                </div>
              )}
            </div>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-secondary">
          <span className="line-clamp-2">{summary}</span>
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
      {expanded && <DetailRow row={row} />}
    </>
  );
}

function DetailRow({ row }: { row: AdminAuditLogRow }) {
  return (
    <tr className="border-b border-app bg-app/30">
      <td colSpan={6} className="px-3 py-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DetailKV label="Event ID" value={row.id} mono />
          <DetailKV
            label="When"
            value={formatDateTime(row.created_at)}
            mono
          />
          <DetailKV
            label="Actor"
            value={row.actor_email ?? "—"}
            sub={row.actor_id ?? undefined}
          />
          <DetailKV label="Action" value={row.action} />
          <DetailKV label="Target type" value={row.target_type ?? "—"} />
          <DetailKV label="Target id" value={row.target_id ?? "—"} mono />
          <DetailKV label="IP" value={row.ip ?? "—"} mono />
          <DetailKV
            label="User agent"
            value={row.user_agent ?? "—"}
            mono
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <JsonBlock label="Before" value={row.before} />
          <JsonBlock label="After" value={row.after} />
        </div>
        <div className="mt-3">
          <JsonBlock label="Metadata" value={row.metadata} />
        </div>
      </td>
    </tr>
  );
}

function DetailKV({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
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
      {sub && (
        <div className="mt-0.5 break-all font-mono text-[10px] text-faint">
          {sub}
        </div>
      )}
    </div>
  );
}

function JsonBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "object" &&
      value !== null &&
      Object.keys(value as Record<string, unknown>).length === 0);
  let pretty: string;
  try {
    pretty = JSON.stringify(value ?? null, null, 2);
  } catch {
    pretty = String(value);
  }
  return (
    <div className="rounded-lg border border-app bg-app p-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          {label}
        </div>
        {isEmpty && (
          <span className="text-[10px] text-faint">empty</span>
        )}
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-secondary">
        {pretty}
      </pre>
    </div>
  );
}
