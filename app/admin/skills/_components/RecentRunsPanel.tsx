import Link from "next/link";

import { formatDateTime } from "../../_lib";
import type { AiAgentRunRow } from "../../_types";

/**
 * Server component. Caller passes the runs already loaded — best-effort
 * matched against the skill id (metadata->>'skill_id' OR substring on
 * input_excerpt). We render a per-day grouping with success rate and a
 * collapsible table of the latest entries.
 */

export type RecentRunsPanelProps = {
  skillId: string;
  runs: Pick<
    AiAgentRunRow,
    | "id"
    | "agent_id"
    | "channel"
    | "status"
    | "input_excerpt"
    | "output_excerpt"
    | "duration_ms"
    | "model"
    | "created_at"
  >[];
};

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-500",
  error: "bg-rose-500/15 text-rose-500",
  denied: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export default function RecentRunsPanel({
  skillId,
  runs,
}: RecentRunsPanelProps) {
  if (runs.length === 0) {
    return (
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Recent runs</h2>
          <p className="mt-0.5 text-xs text-muted">
            No runs found for skill{" "}
            <code className="font-mono text-app">{skillId}</code>. The
            runtime tags runs via{" "}
            <code className="font-mono">metadata.skill_id</code>; matches
            also fall back to a substring search of the input excerpt.
          </p>
        </header>
      </section>
    );
  }

  // Group by day for the success-rate strip.
  type Group = { day: string; total: number; ok: number };
  const byDay = new Map<string, Group>();
  for (const r of runs) {
    const day = String(r.created_at).slice(0, 10);
    const g = byDay.get(day) ?? { day, total: 0, ok: 0 };
    g.total += 1;
    if (r.status === "success") g.ok += 1;
    byDay.set(day, g);
  }
  const days = Array.from(byDay.values()).sort((a, b) =>
    a.day < b.day ? 1 : -1
  );
  const totalOk = runs.filter((r) => r.status === "success").length;
  const overallRate = runs.length === 0 ? 0 : (totalOk / runs.length) * 100;

  return (
    <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app">Recent runs</h2>
          <p className="mt-0.5 text-xs text-muted">
            Last {runs.length} matches for this skill (best-effort tag +
            substring match on agent runs).
          </p>
        </div>
        <div className="text-right text-xs">
          <div className="text-app">
            <span className="font-mono text-base font-semibold">
              {overallRate.toFixed(1)}%
            </span>{" "}
            <span className="text-faint">success</span>
          </div>
          <div className="text-faint">
            {totalOk} ok / {runs.length} total
          </div>
        </div>
      </header>

      {/* Per-day strip */}
      <div className="grid gap-1.5 md:grid-cols-7">
        {days.slice(0, 14).map((g) => {
          const rate = g.total === 0 ? 0 : g.ok / g.total;
          const hue = rate >= 0.9 ? "emerald" : rate >= 0.6 ? "amber" : "rose";
          const fill: Record<string, string> = {
            emerald: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
            amber:
              "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
            rose: "bg-rose-500/15 text-rose-500 border-rose-500/30",
          };
          return (
            <div
              key={g.day}
              className={`rounded-lg border ${fill[hue]} px-2 py-2 text-[11px]`}
            >
              <div className="font-mono text-app">{g.day.slice(5)}</div>
              <div className="mt-0.5 font-mono">
                {g.ok}/{g.total}
              </div>
              <div className="text-[10px] opacity-80">
                {(rate * 100).toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-app">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">When</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Agent</th>
              <th className="px-3 py-2 text-left font-normal">Channel</th>
              <th className="px-3 py-2 text-left font-normal">Input excerpt</th>
              <th className="px-3 py-2 text-right font-normal">ms</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 50).map((r) => (
              <tr
                key={r.id}
                className="border-b border-app last:border-b-0 hover:bg-app/40"
              >
                <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      STATUS_STYLES[r.status] ??
                      "bg-app text-faint border border-app"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.agent_id ? (
                    <Link
                      href={`/admin/agents/${encodeURIComponent(r.agent_id)}`}
                      className="font-mono text-secondary transition-colors hover:text-tool-accent"
                    >
                      {r.agent_id}
                    </Link>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-secondary">
                  {r.channel ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="line-clamp-2 max-w-md text-[11px] text-secondary">
                    {r.input_excerpt ?? "—"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums text-secondary">
                  {r.duration_ms != null ? r.duration_ms : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
