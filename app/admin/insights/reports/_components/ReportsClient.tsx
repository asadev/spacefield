"use client";

import { useEffect, useMemo, useState } from "react";

import { runAggregate } from "./_actions";

export interface ReportTableSpec {
  /** Display label e.g. "Tasks". */
  label: string;
  /** Postgres table name we read from via the report API. */
  table: string;
  /** Fields the user can group by. */
  groupBy: { name: string; label: string }[];
  /** Numeric fields available for sum/avg. count works on any table. */
  numeric: { name: string; label: string }[];
}

export interface ReportPoint {
  label: string;
  value: number;
}

interface Props {
  specs: ReportTableSpec[];
}

type AggOp = "count" | "sum" | "avg";

const OPS: { value: AggOp; label: string }[] = [
  { value: "count", label: "Count rows" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
];

export default function ReportsClient({ specs }: Props) {
  const [tableIdx, setTableIdx] = useState<number>(0);
  const spec = specs[tableIdx] ?? specs[0];
  const [groupBy, setGroupBy] = useState<string>(spec?.groupBy[0]?.name ?? "");
  const [op, setOp] = useState<AggOp>("count");
  const [field, setField] = useState<string>(spec?.numeric[0]?.name ?? "");
  const [points, setPoints] = useState<ReportPoint[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset group/field when the table changes so we don't carry over
  // a column that doesn't exist on the new table.
  useEffect(() => {
    if (!spec) return;
    setGroupBy(spec.groupBy[0]?.name ?? "");
    setField(spec.numeric[0]?.name ?? "");
    setPoints([]);
    setError(null);
  }, [tableIdx, spec]);

  async function runReport() {
    if (!spec) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await runAggregate({
        table: spec.table,
        group_by: groupBy,
        op,
        field: op === "count" ? undefined : field,
      });
      if (!payload.ok) throw new Error(payload.error);
      setPoints(payload.points);
    } catch (err) {
      setError(err instanceof Error ? err.message : "report failed");
      setPoints([]);
    } finally {
      setBusy(false);
    }
  }

  const maxValue = useMemo(() => {
    return points.reduce((m, p) => (p.value > m ? p.value : m), 0);
  }, [points]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-app bg-app-elevated p-4 md:grid-cols-4">
        <Field label="Table">
          <select
            value={tableIdx}
            onChange={(e) => setTableIdx(Number(e.target.value))}
            className="input"
          >
            {specs.map((s, i) => (
              <option key={s.table} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group by">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="input"
          >
            {spec?.groupBy.map((g) => (
              <option key={g.name} value={g.name}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Aggregation">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as AggOp)}
            className="input"
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {op !== "count" && (
          <Field label="Field">
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="input"
            >
              {spec?.numeric.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex items-end md:col-span-4">
          <button
            type="button"
            onClick={runReport}
            disabled={busy || !groupBy || (op !== "count" && !field)}
            className="rounded-md bg-tool-accent px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Running…" : "Run report"}
          </button>
          {error && (
            <span className="ml-3 text-[11px] text-rose-400">{error}</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Result
        </div>
        {points.length === 0 ? (
          <p className="mt-2 text-xs text-faint">
            {busy ? "Loading…" : "Run a report to see a chart."}
          </p>
        ) : (
          <BarChart points={points} max={maxValue} />
        )}
      </div>

      <style jsx>{`
        :global(.input) {
          height: 2.25rem;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border-app, rgba(148, 163, 184, 0.2));
          background: var(--bg-app, transparent);
          padding: 0.375rem 0.625rem;
          font-size: 0.8125rem;
          color: inherit;
          outline: none;
        }
        :global(.input:focus) {
          border-color: var(--tool-accent, #6366f1);
        }
      `}</style>
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
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted">
      {label}
      {children}
    </label>
  );
}

/* ──────────────── tiny SVG bar chart, no deps ──────────────── */
function BarChart({ points, max }: { points: ReportPoint[]; max: number }) {
  const width = 720;
  const barHeight = 22;
  const gap = 6;
  const labelCol = 180;
  const valueCol = 60;
  const chartCol = Math.max(120, width - labelCol - valueCol - 16);
  const height = points.length * (barHeight + gap);
  const denom = max > 0 ? max : 1;

  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        width={width}
        height={height + 8}
        viewBox={`0 0 ${width} ${height + 8}`}
        className="block"
      >
        {points.map((p, i) => {
          const y = i * (barHeight + gap);
          const w = Math.max(2, (p.value / denom) * chartCol);
          return (
            <g key={`${p.label}-${i}`} transform={`translate(0,${y})`}>
              <text
                x={labelCol - 8}
                y={barHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="11"
                fill="currentColor"
                className="text-secondary"
              >
                {truncate(p.label, 28)}
              </text>
              <rect
                x={labelCol}
                y={0}
                width={w}
                height={barHeight}
                rx={4}
                className="fill-tool-accent"
                opacity={0.85}
              />
              <text
                x={labelCol + w + 6}
                y={barHeight / 2}
                dominantBaseline="middle"
                fontSize="11"
                fill="currentColor"
                className="text-app"
              >
                {formatNumber(p.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "(empty)";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
