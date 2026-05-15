import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * /admin/insights/slow-queries — top 50 slow queries from
 * pg_stat_statements (via the slow_queries_top_50 view). Read via the
 * admin_slow_queries RPC which gates on admin_caller_is_admin().
 *
 * If pg_stat_statements isn't installed the RPC returns 0 rows; we
 * surface that as a friendly empty state rather than an error.
 */

type SlowQueryRow = {
  query: string;
  calls: number;
  mean_exec_time: number;
  total_exec_time: number;
  rows: number;
};

const QUERY_PREVIEW_LEN = 120;

export default async function AdminSlowQueriesPage() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_slow_queries", {
    limit_n: 50,
  });

  const rows = ((data ?? []) as SlowQueryRow[]).slice();
  rows.sort((a, b) => Number(b.mean_exec_time) - Number(a.mean_exec_time));

  const totalCalls = rows.reduce((acc, r) => acc + Number(r.calls ?? 0), 0);
  const totalExec = rows.reduce(
    (acc, r) => acc + Number(r.total_exec_time ?? 0),
    0
  );
  const worstMean = rows.reduce(
    (acc, r) => (Number(r.mean_exec_time) > acc ? Number(r.mean_exec_time) : acc),
    0
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Database
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Slow queries</h1>
          <p className="mt-0.5 text-xs text-muted">
            Top 50 slowest queries by mean exec time, sourced from{" "}
            <code className="rounded bg-app px-1 text-[11px]">
              pg_stat_statements
            </code>{" "}
            via the{" "}
            <code className="rounded bg-app px-1 text-[11px]">
              slow_queries_top_50
            </code>{" "}
            view. Use these to spot missing indexes.
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Queries" value={rows.length.toLocaleString()} />
        <StatCard label="Total calls" value={totalCalls.toLocaleString()} />
        <StatCard
          label="Worst mean"
          value={`${formatMs(worstMean)}`}
          accent={worstMean > 500 ? "rose" : worstMean > 100 ? "amber" : "emerald"}
        />
        <StatCard label="Total exec" value={formatMs(totalExec)} />
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
              <th className="px-3 py-2 text-left font-normal">Query</th>
              <th className="px-3 py-2 text-right font-normal">Calls</th>
              <th className="px-3 py-2 text-right font-normal">Mean</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
              <th className="px-3 py-2 text-right font-normal">Rows</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-faint">
                  No slow-query data. Either{" "}
                  <code className="rounded bg-app px-1 text-[11px]">
                    pg_stat_statements
                  </code>{" "}
                  isn&apos;t installed (run{" "}
                  <code className="rounded bg-app px-1 text-[11px]">
                    create extension pg_stat_statements
                  </code>{" "}
                  in Supabase), the{" "}
                  <code className="rounded bg-app px-1 text-[11px]">
                    slow_queries_top_50
                  </code>{" "}
                  view is missing, or the DB has been quiet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const mean = Number(r.mean_exec_time ?? 0);
                const total = Number(r.total_exec_time ?? 0);
                const preview = truncate(r.query ?? "", QUERY_PREVIEW_LEN);
                return (
                  <tr
                    key={i}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-app">
                      <span
                        className="line-clamp-2 break-all"
                        title={r.query ?? ""}
                      >
                        {preview}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {Number(r.calls ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      <span className={meanClass(mean)}>{formatMs(mean)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {formatMs(total)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {Number(r.rows ?? 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-faint">
        See also{" "}
        <Link
          href="/admin/insights/latency"
          className="text-tool-accent hover:underline"
        >
          API latency
        </Link>{" "}
        for request-side hotspots.
      </p>
    </div>
  );
}

function meanClass(ms: number): string {
  if (ms >= 500) return "text-rose-500";
  if (ms >= 100) return "text-amber-500";
  if (ms >= 20) return "text-secondary";
  return "text-emerald-500";
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} s`;
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
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
