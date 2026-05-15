import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import WindowToggle, {
  WINDOW_MINUTES,
  parseWindow,
  type WindowKey,
} from "../_components/WindowToggle";

export const dynamic = "force-dynamic";

/**
 * /admin/insights/latency — p50/p95/p99/error-rate per API source over
 * a configurable window. Backed by the api_latency_summary RPC.
 *
 * Sort: defaults to p95 desc. The user can flip to other columns via
 * `?sort=<col>&dir=<asc|desc>` — column whitelist enforced.
 */

type LatencyRow = {
  source: string;
  count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  err_rate: number;
};

type SortColumn = "source" | "count" | "p50_ms" | "p95_ms" | "p99_ms" | "err_rate";
type SortDir = "asc" | "desc";

const SORT_COLUMNS: Record<SortColumn, string> = {
  source: "Source",
  count: "Count",
  p50_ms: "p50",
  p95_ms: "p95",
  p99_ms: "p99",
  err_rate: "Errors %",
};

function parseSort(value: string | undefined): SortColumn {
  if (value && (value as SortColumn) in SORT_COLUMNS) return value as SortColumn;
  return "p95_ms";
}

function parseDir(value: string | undefined): SortDir {
  return value === "asc" ? "asc" : "desc";
}

export default async function AdminLatencyPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const windowKey: WindowKey = parseWindow(sp.window);
  const windowMinutes = WINDOW_MINUTES[windowKey];
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("api_latency_summary", {
    p_window_minutes: windowMinutes,
  });

  const rows = ((data ?? []) as LatencyRow[]).slice();
  rows.sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const as = String(av ?? "");
    const bs = String(bv ?? "");
    return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
  });

  const totalCount = rows.reduce((acc, r) => acc + Number(r.count ?? 0), 0);
  const worstP95 = rows.reduce(
    (acc, r) => (r.p95_ms > acc ? r.p95_ms : acc),
    0
  );
  const weightedErr =
    totalCount > 0
      ? rows.reduce(
          (acc, r) => acc + Number(r.err_rate ?? 0) * Number(r.count ?? 0),
          0
        ) / totalCount
      : 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Observability
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">API latency</h1>
          <p className="mt-0.5 text-xs text-muted">
            p50 / p95 / p99 and error rate per source, sampled from{" "}
            <code className="rounded bg-app px-1 text-[11px]">api_latency</code>{" "}
            (written fire-and-forget from{" "}
            <code className="rounded bg-app px-1 text-[11px]">withApiHandler</code>).
          </p>
        </div>
        <WindowToggle
          basePath="/admin/insights/latency"
          current={windowKey}
          preserveParams={{ sort, dir }}
        />
      </header>

      {/* Stat cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sources" value={rows.length.toLocaleString()} />
        <StatCard label="Requests" value={totalCount.toLocaleString()} />
        <StatCard
          label="Worst p95"
          value={`${worstP95.toLocaleString()} ms`}
          accent={worstP95 > 1000 ? "rose" : worstP95 > 500 ? "amber" : "emerald"}
        />
        <StatCard
          label="Weighted error rate"
          value={`${(weightedErr * 100).toFixed(2)}%`}
          accent={weightedErr > 0.05 ? "rose" : weightedErr > 0.01 ? "amber" : "emerald"}
        />
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
          RPC failed: {error.message}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <SortableHeader
                column="source"
                label="Source"
                current={sort}
                dir={dir}
                windowKey={windowKey}
                align="left"
              />
              <SortableHeader
                column="count"
                label="Count"
                current={sort}
                dir={dir}
                windowKey={windowKey}
                align="right"
              />
              <SortableHeader
                column="p50_ms"
                label="p50"
                current={sort}
                dir={dir}
                windowKey={windowKey}
                align="right"
              />
              <SortableHeader
                column="p95_ms"
                label="p95"
                current={sort}
                dir={dir}
                windowKey={windowKey}
                align="right"
              />
              <SortableHeader
                column="p99_ms"
                label="p99"
                current={sort}
                dir={dir}
                windowKey={windowKey}
                align="right"
              />
              <SortableHeader
                column="err_rate"
                label="Errors %"
                current={sort}
                dir={dir}
                windowKey={windowKey}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-faint">
                  No latency samples in the last {windowKey} window. The
                  <code className="mx-1 rounded bg-app px-1 text-[11px]">api_latency</code>
                  table is populated by withApiHandler — hit some routes and
                  this page lights up.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const errPct = Number(r.err_rate ?? 0) * 100;
                return (
                  <tr
                    key={r.source}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-app">
                      <span className="line-clamp-1 break-all" title={r.source}>
                        {r.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {Number(r.count).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {Number(r.p50_ms).toLocaleString()}
                      <span className="ml-1 text-[10px] text-faint">ms</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      <span className={p95Class(Number(r.p95_ms))}>
                        {Number(r.p95_ms).toLocaleString()}
                      </span>
                      <span className="ml-1 text-[10px] text-faint">ms</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {Number(r.p99_ms).toLocaleString()}
                      <span className="ml-1 text-[10px] text-faint">ms</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      <span className={errClass(errPct)}>
                        {errPct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-faint">
        Sample window: last {windowKey} · ordered by {SORT_COLUMNS[sort]} ({dir}).
        See also{" "}
        <Link
          href="/admin/insights/slow-queries"
          className="text-tool-accent hover:underline"
        >
          slow queries
        </Link>{" "}
        for DB hot spots.
      </p>
    </div>
  );
}

function p95Class(ms: number): string {
  if (ms >= 1000) return "text-rose-500";
  if (ms >= 500) return "text-amber-500";
  return "text-emerald-500";
}

function errClass(pct: number): string {
  if (pct >= 5) return "text-rose-500";
  if (pct >= 1) return "text-amber-500";
  if (pct > 0) return "text-secondary";
  return "text-faint";
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "rose";
}) {
  const dot =
    accent === "rose"
      ? "bg-rose-500"
      : accent === "amber"
      ? "bg-amber-500"
      : accent === "emerald"
      ? "bg-emerald-500"
      : "";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {dot ? <span className={`inline-block h-2 w-2 rounded-full ${dot}`} /> : null}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-app">{value}</div>
    </div>
  );
}

function SortableHeader({
  column,
  label,
  current,
  dir,
  windowKey,
  align,
}: {
  column: SortColumn;
  label: string;
  current: SortColumn;
  dir: SortDir;
  windowKey: WindowKey;
  align: "left" | "right";
}) {
  const isActive = current === column;
  const nextDir: SortDir = isActive && dir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams();
  params.set("window", windowKey);
  params.set("sort", column);
  params.set("dir", nextDir);
  const arrow = isActive ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th
      className={`px-3 py-2 font-normal ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <Link
        href={`/admin/insights/latency?${params.toString()}`}
        className={`inline-flex items-center gap-1 ${
          isActive ? "text-app" : "text-muted"
        } hover:text-tool-accent`}
      >
        {label}
        <span className="text-[9px]">{arrow}</span>
      </Link>
    </th>
  );
}
