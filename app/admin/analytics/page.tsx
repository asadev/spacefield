import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { formatDateTime } from "../_lib";
import { Funnel, Sparkline } from "./_components/Charts";
import {
  formatPercent,
  resolveSince,
  typeChipClass,
} from "./_lib";

export const dynamic = "force-dynamic";

type SortKey = "views" | "submits" | "converts" | "conv_rate" | "last_event";
type SortDir = "asc" | "desc";

type GlobalAnalytics = {
  total_links: number;
  active_links: number;
  total_views: number;
  total_submits: number;
  total_converts: number;
  by_type: Record<string, number>;
  webhook_success_rate: number;
};

type ToshareLinkRow = {
  id: string;
  workspace_id: string | null;
  type: string;
  slug: string;
  payload: Record<string, unknown> | null;
  status: string;
};

type ToshareEventRow = {
  link_id: string;
  event: string;
  created_at: string;
};

type WebhookDailyRow = {
  attempted_at: string;
  status: string;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
};

type TopLink = {
  link_id: string;
  type: string;
  slug: string;
  title: string;
  workspace_id: string | null;
  workspace_name: string;
  views: number;
  submits: number;
  converts: number;
  conv_rate: number;
  last_event: string | null;
};

const SORT_KEYS: ReadonlyArray<SortKey> = [
  "views",
  "submits",
  "converts",
  "conv_rate",
  "last_event",
];

function parseSort(sp: { sort?: string; dir?: string }): {
  sort: SortKey;
  dir: SortDir;
} {
  const sort = (SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as SortKey)
    : "views";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  return { sort, dir };
}

function titleFromPayload(
  payload: Record<string, unknown> | null,
  fallback: string
): string {
  if (!payload) return fallback;
  const raw = payload["title"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return fallback;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    since?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const { since, range } = resolveSince(sp);
  const { sort, dir } = parseSort(sp);

  // User-scoped client only for the global RPC (it requires
  // admin_caller_is_admin() which reads auth.uid()). Service-role calls
  // would set auth.uid() to null and trigger 'forbidden'. The layout
  // already gates non-admins, so this is safe.
  const userClient = await createClient();
  const admin = createAdminClient();

  const [
    globalRpc,
    eventsRecentRes,
    linksRes,
    webhookDailyRes,
  ] = await Promise.all([
    userClient.rpc("toshare_global_analytics", { p_since: since }),
    // Pull events for the date range. Aggregation done in JS — there's
    // no cross-workspace top-links RPC and writing one would require a
    // foundation migration which the contract forbids. Limit chosen to
    // bound memory at ~10 MB worst case (50k events × ~200 bytes).
    admin
      .from("toshare_events")
      .select("link_id, event, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50000),
    admin
      .from("toshare_links")
      .select("id, workspace_id, type, slug, payload, status"),
    admin
      .from("toshare_webhook_deliveries")
      .select("attempted_at, status")
      .gte("attempted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("attempted_at", { ascending: true })
      .limit(20000),
  ]);

  const stats: GlobalAnalytics = (globalRpc.data as GlobalAnalytics | null) ?? {
    total_links: 0,
    active_links: 0,
    total_views: 0,
    total_submits: 0,
    total_converts: 0,
    by_type: {},
    webhook_success_rate: 0,
  };

  const events = (eventsRecentRes.data ?? []) as ToshareEventRow[];
  const links = (linksRes.data ?? []) as ToshareLinkRow[];
  const webhookDaily = (webhookDailyRes.data ?? []) as WebhookDailyRow[];

  // ── Aggregate top-link rows in-process ───────────────────────────────
  // Per-link counters across the date range.
  type Counter = {
    views: number;
    submits: number;
    converts: number;
    last_event: string | null;
  };
  const counters = new Map<string, Counter>();
  for (const e of events) {
    const c = counters.get(e.link_id) ?? {
      views: 0,
      submits: 0,
      converts: 0,
      last_event: null,
    };
    if (e.event === "view") c.views += 1;
    else if (e.event === "submit") c.submits += 1;
    else if (e.event === "convert") c.converts += 1;
    if (!c.last_event || e.created_at > c.last_event) {
      c.last_event = e.created_at;
    }
    counters.set(e.link_id, c);
  }

  // Workspace name map — only fetch the ids referenced by the links
  // we're about to display.
  const wsIds = Array.from(
    new Set(
      links
        .map((l) => l.workspace_id)
        .filter((x): x is string => typeof x === "string")
    )
  );
  let workspaceNames = new Map<string, string>();
  if (wsIds.length > 0) {
    const { data: wsRows } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    workspaceNames = new Map(
      ((wsRows ?? []) as WorkspaceRow[]).map((w) => [w.id, w.name ?? "—"])
    );
  }

  const topLinks: TopLink[] = links
    .map((l) => {
      const c = counters.get(l.id) ?? {
        views: 0,
        submits: 0,
        converts: 0,
        last_event: null,
      };
      const conv_rate =
        c.views > 0 ? +((100 * (c.submits + c.converts)) / c.views).toFixed(2) : 0;
      return {
        link_id: l.id,
        type: l.type,
        slug: l.slug,
        title: titleFromPayload(l.payload, l.slug),
        workspace_id: l.workspace_id,
        workspace_name: l.workspace_id
          ? workspaceNames.get(l.workspace_id) ?? "—"
          : "—",
        views: c.views,
        submits: c.submits,
        converts: c.converts,
        conv_rate,
        last_event: c.last_event,
      };
    })
    // Drop links with zero activity in the window — they make the table
    // noisy and the user can find them on the per-workspace pages.
    .filter((r) => r.views + r.submits + r.converts > 0);

  topLinks.sort((a, b) => {
    const mult = dir === "asc" ? 1 : -1;
    if (sort === "last_event") {
      const av = a.last_event ? Date.parse(a.last_event) : 0;
      const bv = b.last_event ? Date.parse(b.last_event) : 0;
      return (av - bv) * mult;
    }
    return ((a[sort] as number) - (b[sort] as number)) * mult;
  });

  const visible = topLinks.slice(0, 50);

  // ── Webhook success-rate sparkline (last 30 days, daily) ─────────────
  const sparkSeries = buildDailyWebhookSuccess(webhookDaily, 30);

  // ── By-type rows for the small chip strip ────────────────────────────
  const byType = Object.entries(stats.by_type ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            toShare
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Analytics</h1>
          <p className="mt-0.5 text-xs text-muted">
            Cross-workspace view of every toShare link, event, and webhook
            delivery. Read-only.
          </p>
        </div>
        <RangeSelector range={range} sort={sort} dir={dir} />
      </header>

      {/* Top stat cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total links"
          value={stats.total_links.toLocaleString()}
          sub={`${stats.active_links.toLocaleString()} active`}
        />
        <StatCard
          label="Views"
          value={stats.total_views.toLocaleString()}
          sub={range === "custom" ? "in window" : `last ${range}`}
          accent="#3b82f6"
        />
        <StatCard
          label="Submits"
          value={stats.total_submits.toLocaleString()}
          sub={formatPercent(stats.total_submits, stats.total_views)}
          accent="#10b981"
        />
        <StatCard
          label="Converts"
          value={stats.total_converts.toLocaleString()}
          sub={formatPercent(stats.total_converts, stats.total_views)}
          accent="#a855f7"
        />
      </section>

      {/* By-type strip + webhook sparkline */}
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Links by type
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {byType.length === 0 ? (
              <span className="text-xs text-faint">No links yet.</span>
            ) : (
              byType.map(([type, count]) => (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${typeChipClass(type)}`}
                >
                  <span className="capitalize">{type}</span>
                  <span className="font-mono tabular-nums">
                    {count.toLocaleString()}
                  </span>
                </span>
              ))
            )}
          </div>
          <div className="mt-5">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              Funnel ({range === "custom" ? "custom range" : `last ${range}`})
            </div>
            <Funnel
              views={stats.total_views}
              submits={stats.total_submits}
              converts={stats.total_converts}
              height={120}
            />
          </div>
        </div>
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              Webhook success
            </div>
            <div className="font-mono text-sm tabular-nums text-app">
              {Number(stats.webhook_success_rate ?? 0).toFixed(1)}%
            </div>
          </div>
          <div className="mt-3">
            <Sparkline
              values={sparkSeries.map((d) => d.successPct)}
              height={50}
              stroke="#10b981"
              ariaLabel="Webhook success rate, last 30 days"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
            <span>30d ago</span>
            <span>today</span>
          </div>
          <div className="mt-3 text-[11px] text-muted">
            Daily success rate from{" "}
            <code className="font-mono text-secondary">toshare_webhook_deliveries</code>.
          </div>
        </div>
      </section>

      {/* Top links table */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">
            Top links across all workspaces
          </h2>
          <span className="text-[11px] text-faint">
            {topLinks.length.toLocaleString()} active in window · showing{" "}
            {visible.length.toLocaleString()}
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Type</th>
                <th className="px-3 py-2 text-left font-normal">Slug</th>
                <th className="px-3 py-2 text-left font-normal">Title</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <SortHeader
                  label="Views"
                  k="views"
                  current={sort}
                  dir={dir}
                  range={range}
                />
                <SortHeader
                  label="Submits"
                  k="submits"
                  current={sort}
                  dir={dir}
                  range={range}
                />
                <SortHeader
                  label="Converts"
                  k="converts"
                  current={sort}
                  dir={dir}
                  range={range}
                />
                <SortHeader
                  label="Conv %"
                  k="conv_rate"
                  current={sort}
                  dir={dir}
                  range={range}
                />
                <SortHeader
                  label="Last event"
                  k="last_event"
                  current={sort}
                  dir={dir}
                  range={range}
                />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-10 text-center text-faint"
                  >
                    No link activity in this window.
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr
                    key={r.link_id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeChipClass(r.type)}`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      <Link
                        href={`/admin/analytics/${r.link_id}`}
                        className="hover:text-tool-accent"
                      >
                        {r.slug}
                      </Link>
                    </td>
                    <td className="px-3 py-2 max-w-[280px] truncate text-app">
                      <Link
                        href={`/admin/analytics/${r.link_id}`}
                        title={r.title}
                        className="hover:text-tool-accent"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-secondary">
                      {r.workspace_name}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {r.views.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {r.submits.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {r.converts.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {r.conv_rate.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.last_event)}
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

/* ─────────────────────── components ─────────────────────── */

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {accent ? (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
        ) : null}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-app">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function RangeSelector({
  range,
  sort,
  dir,
}: {
  range: string;
  sort: SortKey;
  dir: SortDir;
}) {
  const opts: Array<{ k: string; label: string }> = [
    { k: "7d", label: "7 days" },
    { k: "30d", label: "30 days" },
    { k: "90d", label: "90 days" },
  ];
  const baseParams = new URLSearchParams();
  baseParams.set("sort", sort);
  baseParams.set("dir", dir);

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated text-xs">
        {opts.map((o) => {
          const params = new URLSearchParams(baseParams);
          params.set("range", o.k);
          const active = range === o.k;
          return (
            <Link
              key={o.k}
              href={`/admin/analytics?${params.toString()}`}
              className={`px-3 py-1.5 transition-colors ${
                active
                  ? "bg-tool-accent text-white"
                  : "text-secondary hover:text-app"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>
      {range === "custom" ? (
        <span className="rounded-lg border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary">
          custom range
        </span>
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  k,
  current,
  dir,
  range,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: SortDir;
  range: string;
}) {
  const params = new URLSearchParams();
  params.set("range", range);
  params.set("sort", k);
  // If this column is already active, flip the direction on click.
  // Otherwise default to descending (the most useful default for counts).
  const nextDir =
    k === current ? (dir === "desc" ? "asc" : "desc") : "desc";
  params.set("dir", nextDir);
  const active = k === current;
  const arrow = !active ? "" : dir === "asc" ? " ↑" : " ↓";
  return (
    <th className="px-3 py-2 text-right font-normal">
      <Link
        href={`/admin/analytics?${params.toString()}`}
        className={`transition-colors ${active ? "text-app" : "hover:text-secondary"}`}
      >
        {label}
        {arrow}
      </Link>
    </th>
  );
}

/* ─────────────────────── helpers ─────────────────────── */

function buildDailyWebhookSuccess(
  rows: WebhookDailyRow[],
  days: number
): Array<{ day: string; total: number; success: number; successPct: number }> {
  const buckets = new Map<
    string,
    { total: number; success: number }
  >();
  // Seed empty days so the sparkline draws a continuous line.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(start.getTime() - i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), { total: 0, success: 0 });
  }
  for (const r of rows) {
    const day = r.attempted_at.slice(0, 10);
    const b = buckets.get(day);
    if (!b) continue;
    b.total += 1;
    if (r.status === "success") b.success += 1;
  }
  return Array.from(buckets.entries()).map(([day, b]) => ({
    day,
    total: b.total,
    success: b.success,
    successPct: b.total === 0 ? 100 : (b.success / b.total) * 100,
  }));
}
