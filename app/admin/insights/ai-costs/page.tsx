import Link from "next/link";

import AICostBudget from "@/components/AICostBudget";
import { fetchAiCostSummary, type AiCostSummaryRow } from "@/lib/ai/cost";

export const dynamic = "force-dynamic";

/**
 * /admin/insights/ai-costs — per-agent AI spend in the last hour and
 * last 24 hours. Backed by the `ai_cost_summary` RPC.
 *
 * The summary RPC groups by (agent_id, model) so a single agent can
 * appear across multiple models. We render two side-by-side tables
 * (1h / 24h) plus the user-facing AICostBudget widget for parity
 * with the marketing-side hookup.
 *
 * Sort: defaults to cost desc. Honors `?sort=<col>&dir=<asc|desc>` on
 * the 24h table; the 1h table stays in RPC default order.
 */

type SortColumn =
  | "agent_id"
  | "model"
  | "calls"
  | "input_tokens"
  | "output_tokens"
  | "cost_usd";
type SortDir = "asc" | "desc";

const SORT_COLUMNS: Record<SortColumn, string> = {
  agent_id: "Agent",
  model: "Model",
  calls: "Calls",
  input_tokens: "Input",
  output_tokens: "Output",
  cost_usd: "Cost",
};

function parseSort(value: string | undefined): SortColumn {
  if (value && (value as SortColumn) in SORT_COLUMNS) return value as SortColumn;
  return "cost_usd";
}

function parseDir(value: string | undefined): SortDir {
  return value === "asc" ? "asc" : "desc";
}

export default async function AdminAiCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);

  const [hourRows, dayRows] = await Promise.all([
    fetchAiCostSummary(60),
    fetchAiCostSummary(1440),
  ]);

  const sortedDay = sortRows(dayRows, sort, dir);

  const totalCostHour = hourRows.reduce(
    (acc, r) => acc + Number(r.cost_usd ?? 0),
    0
  );
  const totalCostDay = dayRows.reduce(
    (acc, r) => acc + Number(r.cost_usd ?? 0),
    0
  );
  const totalCallsDay = dayRows.reduce(
    (acc, r) => acc + Number(r.calls ?? 0),
    0
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Observability
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">AI costs</h1>
          <p className="mt-0.5 text-xs text-muted">
            Per-agent token spend by model. Backed by the{" "}
            <code className="font-mono text-[10px]">ai_calls</code> ledger
            (`recordAiCall` writes one row per call).
          </p>
        </div>
      </header>

      {/* Top stat cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Cost · last 1h"
          value={formatUsd(totalCostHour)}
          sub={`${hourRows.length.toLocaleString()} agent×model rows`}
          accent="#a855f7"
        />
        <StatCard
          label="Cost · last 24h"
          value={formatUsd(totalCostDay)}
          sub={`${dayRows.length.toLocaleString()} agent×model rows`}
          accent="#3b82f6"
        />
        <StatCard
          label="Calls · last 24h"
          value={totalCallsDay.toLocaleString()}
          sub="across all agents"
          accent="#10b981"
        />
        <StatCard
          label="Avg $/call · 24h"
          value={
            totalCallsDay > 0
              ? formatUsd(totalCostDay / totalCallsDay)
              : "$0.0000"
          }
          sub="rough — distorted by big calls"
          accent="#f97316"
        />
      </section>

      {/* User-facing budget widget — same component the marketing pages
          will reuse later. Mounted here so admins can preview it. */}
      <section>
        <AICostBudget title="Platform AI spend · last 30 days" />
      </section>

      {/* Last hour, RPC-default order */}
      <section className="rounded-xl border border-app bg-app-elevated">
        <header className="flex items-baseline justify-between border-b border-app px-3 py-2">
          <h2 className="text-sm font-semibold text-app">Last hour</h2>
          <span className="text-[11px] text-faint">
            {hourRows.length.toLocaleString()} rows
          </span>
        </header>
        <CostTable rows={hourRows} />
      </section>

      {/* Last 24h, sortable via querystring */}
      <section className="rounded-xl border border-app bg-app-elevated">
        <header className="flex items-baseline justify-between border-b border-app px-3 py-2">
          <h2 className="text-sm font-semibold text-app">Last 24 hours</h2>
          <span className="text-[11px] text-faint">
            sorted by {SORT_COLUMNS[sort]} {dir}
          </span>
        </header>
        <CostTable rows={sortedDay} sort={sort} dir={dir} sortable />
      </section>
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

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

function CostTable({
  rows,
  sort,
  dir,
  sortable,
}: {
  rows: AiCostSummaryRow[];
  sort?: SortColumn;
  dir?: SortDir;
  sortable?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            {(Object.keys(SORT_COLUMNS) as SortColumn[]).map((col) => (
              <th
                key={col}
                className={`px-3 py-2 font-normal ${
                  col === "calls" ||
                  col === "input_tokens" ||
                  col === "output_tokens" ||
                  col === "cost_usd"
                    ? "text-right"
                    : "text-left"
                }`}
              >
                {sortable ? (
                  <SortLink col={col} sort={sort!} dir={dir!} />
                ) : (
                  SORT_COLUMNS[col]
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-faint">
                No AI calls in window.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr
                key={`${r.agent_id ?? "global"}-${r.model}-${i}`}
                className="border-b border-app last:border-b-0 hover:bg-app/40"
              >
                <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-app">
                  {r.agent_id ? (
                    <Link
                      href={`/admin/agents/${r.agent_id}`}
                      className="hover:text-tool-accent"
                      title={r.agent_id}
                    >
                      {r.agent_id.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="rounded-full bg-app px-2 py-0.5 text-[10px] font-medium text-secondary">
                    {r.model}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                  {Number(r.calls ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                  {Number(r.input_tokens ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                  {Number(r.output_tokens ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                  {formatUsd(Number(r.cost_usd ?? 0))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortLink({
  col,
  sort,
  dir,
}: {
  col: SortColumn;
  sort: SortColumn;
  dir: SortDir;
}) {
  const isActive = sort === col;
  const nextDir: SortDir = isActive && dir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams();
  params.set("sort", col);
  params.set("dir", nextDir);
  const arrow = isActive ? (dir === "desc" ? "↓" : "↑") : "";
  return (
    <Link
      href={`/admin/insights/ai-costs?${params.toString()}`}
      className={`transition-colors ${
        isActive ? "text-app" : "hover:text-secondary"
      }`}
    >
      {SORT_COLUMNS[col]}
      {arrow ? <span className="ml-1">{arrow}</span> : null}
    </Link>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function sortRows(
  rows: AiCostSummaryRow[],
  sort: SortColumn,
  dir: SortDir
): AiCostSummaryRow[] {
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const as = String(av ?? "");
    const bs = String(bv ?? "");
    return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
  });
  return sorted;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  if (Math.abs(value) >= 100) {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}
