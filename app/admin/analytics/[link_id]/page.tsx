import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import { Funnel, LineChart, type SeriesPoint } from "../_components/Charts";
import {
  resolveSince,
  truncateMiddle,
  typeChipClass,
  webhookStatusChipClass,
} from "../_lib";

export const dynamic = "force-dynamic";

type shareLinkRow = {
  id: string;
  workspace_id: string | null;
  owner_user_id: string | null;
  type: string;
  slug: string;
  custom_subdomain: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  view_count: number;
  submit_count: number;
  created_at: string;
  expires_at: string | null;
  source_tool: string | null;
};

type LinkDailyRow = {
  day: string;
  views: number;
  submits: number;
  redirects: number;
  converts: number;
  unique_ips: number;
};

type WebhookRow = {
  id: number;
  event: string;
  webhook_url: string;
  status: string;
  http_status: number | null;
  response_excerpt: string | null;
  signed: boolean;
  attempted_at: string;
  duration_ms: number | null;
};

type EventRow = {
  id: number;
  event: string;
  ip_hash: string | null;
  ua_hash: string | null;
  referrer: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type WorkspaceRow = { id: string; name: string | null };

function titleFromPayload(
  payload: Record<string, unknown> | null,
  fallback: string
): string {
  if (!payload) return fallback;
  const raw = payload["title"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return fallback;
}

export default async function AdminAnalyticsLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ link_id: string }>;
  searchParams: Promise<{ range?: string; since?: string }>;
}) {
  const { link_id } = await params;
  const sp = await searchParams;
  const { since, range } = resolveSince(sp);

  const admin = createAdminClient();

  const { data: linkData } = await admin
    .from("share_links")
    .select(
      "id, workspace_id, owner_user_id, type, slug, custom_subdomain, payload, status, view_count, submit_count, created_at, expires_at, source_tool"
    )
    .eq("id", link_id)
    .maybeSingle();

  const link = linkData as shareLinkRow | null;
  if (!link) notFound();

  const [seriesRpc, webhooksRes, eventsRes, workspaceRes] = await Promise.all([
    // share_link_analytics is security-definer with no admin check, so
    // either client works. Use admin to keep the read path consistent.
    admin.rpc("share_link_analytics", {
      p_link_id: link_id,
      p_since: since,
    }),
    admin
      .from("share_webhook_deliveries")
      .select(
        "id, event, webhook_url, status, http_status, response_excerpt, signed, attempted_at, duration_ms"
      )
      .eq("link_id", link_id)
      .order("attempted_at", { ascending: false })
      .limit(50),
    admin
      .from("share_events")
      .select("id, event, ip_hash, ua_hash, referrer, payload, created_at")
      .eq("link_id", link_id)
      .order("created_at", { ascending: false })
      .limit(100),
    link.workspace_id
      ? admin
          .from("workspaces")
          .select("id, name")
          .eq("id", link.workspace_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const series = ((seriesRpc.data ?? []) as LinkDailyRow[]).map((r) => ({
    day:
      typeof r.day === "string"
        ? r.day
        : new Date(r.day).toISOString().slice(0, 10),
    views: r.views ?? 0,
    submits: r.submits ?? 0,
    converts: r.converts ?? 0,
  })) satisfies SeriesPoint[];

  const filledSeries = fillDateRange(series, since);

  const totalViews = filledSeries.reduce((a, b) => a + b.views, 0);
  const totalSubmits = filledSeries.reduce((a, b) => a + b.submits, 0);
  const totalConverts = filledSeries.reduce((a, b) => a + b.converts, 0);
  const totalUnique = ((seriesRpc.data ?? []) as LinkDailyRow[]).reduce(
    (a, b) => a + (b.unique_ips ?? 0),
    0
  );

  const webhooks = (webhooksRes.data ?? []) as WebhookRow[];
  const events = (eventsRes.data ?? []) as EventRow[];

  const workspaceRow = (workspaceRes.data as WorkspaceRow | null) ?? null;

  const linkTitle = titleFromPayload(link.payload, link.slug);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          <Link href="/admin/analytics" className="hover:text-tool-accent">
            ← All analytics
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${typeChipClass(link.type)}`}
              >
                {link.type}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  link.status === "active"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : link.status === "paused"
                      ? "bg-amber-500/15 text-amber-500"
                      : "bg-rose-500/15 text-rose-500"
                }`}
              >
                {link.status}
              </span>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-app">
              {linkTitle}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-secondary">
              {link.custom_subdomain
                ? `${link.custom_subdomain}.share.example.com/${link.slug}`
                : `share.example.com/${link.slug}`}
            </p>
          </div>
          <RangeSelector range={range} link_id={link_id} />
        </div>
      </header>

      {/* Metadata grid */}
      <section className="grid gap-3 md:grid-cols-3">
        <Meta
          label="Workspace"
          value={
            workspaceRow ? (
              <Link
                href={`/admin/workspaces/${workspaceRow.id}`}
                className="text-app hover:text-tool-accent"
              >
                {workspaceRow.name ?? "—"}
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )
          }
        />
        <Meta
          label="Owner"
          value={
            link.owner_user_id ? (
              <Link
                href={`/admin/users/${link.owner_user_id}`}
                className="font-mono text-xs text-app hover:text-tool-accent"
              >
                {link.owner_user_id.slice(0, 8)}…
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )
          }
        />
        <Meta
          label="Source tool"
          value={
            link.source_tool ? (
              <span className="font-mono text-xs text-secondary">
                {link.source_tool}
              </span>
            ) : (
              <span className="text-faint">—</span>
            )
          }
        />
        <Meta
          label="Created"
          value={
            <span className="font-mono text-xs text-secondary">
              {formatDateTime(link.created_at)}
            </span>
          }
        />
        <Meta
          label="Expires"
          value={
            <span className="font-mono text-xs text-secondary">
              {link.expires_at ? formatDateTime(link.expires_at) : "never"}
            </span>
          }
        />
        <Meta
          label="Lifetime counters"
          value={
            <span className="font-mono text-xs text-secondary">
              {link.view_count.toLocaleString()} views ·{" "}
              {link.submit_count.toLocaleString()} submits
            </span>
          }
        />
      </section>

      {/* Time-series chart */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex items-center justify-between">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Daily activity ({range === "custom" ? "custom" : `last ${range}`})
          </div>
          <Legend />
        </div>
        <div className="mt-3">
          <LineChart
            data={filledSeries}
            height={200}
            ariaLabel="Daily views, submits, and converts time series"
          />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
          <Stat label="Views" value={totalViews} accent="#3b82f6" />
          <Stat label="Submits" value={totalSubmits} accent="#10b981" />
          <Stat label="Converts" value={totalConverts} accent="#a855f7" />
          <Stat label="Unique IPs" value={totalUnique} />
        </div>
      </section>

      {/* Funnel */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Funnel breakdown
        </div>
        <div className="mt-2">
          <Funnel
            views={totalViews}
            submits={totalSubmits}
            converts={totalConverts}
            height={120}
          />
        </div>
      </section>

      {/* Webhook deliveries */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-app">
          Recent webhook deliveries
        </h2>
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Attempted</th>
                <th className="px-3 py-2 text-left font-normal">Event</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-right font-normal">HTTP</th>
                <th className="px-3 py-2 text-right font-normal">Duration</th>
                <th className="px-3 py-2 text-left font-normal">URL</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No webhook deliveries logged.
                  </td>
                </tr>
              ) : (
                webhooks.map((w) => (
                  <WebhookDeliveryRow key={w.id} row={w} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Events */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-app">Recent events</h2>
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">Event</th>
                <th className="px-3 py-2 text-left font-normal">IP hash</th>
                <th className="px-3 py-2 text-left font-normal">Referrer</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No events recorded for this link.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${eventChipClass(e.event)}`}
                      >
                        {e.event}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-faint">
                      {truncateMiddle(e.ip_hash, 4)}
                    </td>
                    <td className="px-3 py-2 max-w-[420px] truncate text-xs text-secondary">
                      {e.referrer ? (
                        <span title={e.referrer}>{e.referrer}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
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

function Meta({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1.5 text-sm">{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-app bg-app px-3 py-2">
      <div className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {accent ? (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
        ) : null}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-app">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted">
      <LegendDot color="#3b82f6" label="views" />
      <LegendDot color="#10b981" label="submits" />
      <LegendDot color="#a855f7" label="converts" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function RangeSelector({
  range,
  link_id,
}: {
  range: string;
  link_id: string;
}) {
  const opts = [
    { k: "7d", label: "7d" },
    { k: "30d", label: "30d" },
    { k: "90d", label: "90d" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated text-xs">
      {opts.map((o) => {
        const params = new URLSearchParams();
        params.set("range", o.k);
        const active = range === o.k;
        return (
          <Link
            key={o.k}
            href={`/admin/analytics/${link_id}?${params.toString()}`}
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
  );
}

function eventChipClass(event: string): string {
  switch (event) {
    case "view":
      return "bg-blue-500/15 text-blue-500";
    case "submit":
      return "bg-emerald-500/15 text-emerald-500";
    case "convert":
      return "bg-purple-500/15 text-purple-500";
    case "redirect":
      return "bg-amber-500/15 text-amber-500";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

/* ─────────────────────── webhook row (collapsible) ─────────────────────── */

function WebhookDeliveryRow({ row }: { row: WebhookRow }) {
  // <details>/<summary> = no client component needed for expand/collapse.
  // Using a trick: only the first cell becomes a <summary>; the
  // remaining cells stay in the row with a CSS rule from <details>.
  return (
    <>
      <tr className="border-b border-app last:border-b-0 group hover:bg-app/40">
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
          {formatDateTime(row.attempted_at)}
        </td>
        <td className="px-3 py-2 text-xs text-secondary">{row.event}</td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${webhookStatusChipClass(row.status)}`}
          >
            {row.status}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
          {row.http_status ?? "—"}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
          {row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
        </td>
        <td className="px-3 py-2 max-w-[320px] text-xs">
          <details className="group/d">
            <summary className="cursor-pointer truncate text-secondary hover:text-app list-none">
              <span className="truncate" title={row.webhook_url}>
                {row.webhook_url}
              </span>
              {row.response_excerpt ? (
                <span className="ml-1 text-faint group-open/d:hidden">
                  · show response
                </span>
              ) : null}
            </summary>
            {row.response_excerpt ? (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-app bg-app p-2 font-mono text-[11px] text-secondary">
                {row.response_excerpt}
              </pre>
            ) : (
              <div className="mt-2 text-[11px] text-faint">
                no response body recorded
              </div>
            )}
          </details>
        </td>
      </tr>
    </>
  );
}

/* ─────────────────────── helpers ─────────────────────── */

/** Fill missing days inside the date window so the line chart is continuous. */
function fillDateRange(
  rows: SeriesPoint[],
  sinceIso: string
): SeriesPoint[] {
  const startMs = Date.parse(sinceIso);
  if (Number.isNaN(startMs)) return rows;
  const startDay = new Date(startMs);
  startDay.setUTCHours(0, 0, 0, 0);
  const endDay = new Date();
  endDay.setUTCHours(0, 0, 0, 0);

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: SeriesPoint[] = [];
  for (let d = new Date(startDay); d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    out.push(
      byDay.get(day) ?? {
        day,
        views: 0,
        submits: 0,
        converts: 0,
      }
    );
  }
  return out;
}
