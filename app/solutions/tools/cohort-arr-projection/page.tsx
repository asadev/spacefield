"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// Retention-curve presets. Aggressive = enterprise best-case (Snowflake-ish
// logo retention). Base = median public SaaS. Conservative = PLG/SMB with
// meaningful logo churn.
const CURVES: Record<"aggressive" | "base" | "conservative", number[]> = {
  aggressive: [100, 99, 98, 97, 96, 95, 94, 94, 93, 93, 92, 92, 91, 91, 90, 90, 90, 89, 89, 89, 88, 88, 88, 87],
  base: [100, 98, 96, 94, 92, 90, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71],
  conservative: [100, 95, 90, 85, 80, 76, 72, 68, 65, 62, 59, 56, 53, 50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30],
};

const LS_KEY = "solutions:cohort-arr-projection:v1";
const MONTHS = 24;

interface State {
  acv: string;
  newPerMonth: string; // comma-separated 24 values
  retentionCurve: string; // comma-separated 24 values (%)
}

const defaultState: State = {
  acv: "12000",
  newPerMonth: Array(MONTHS).fill(10).join(","),
  retentionCurve: [
    100, 98, 96, 94, 92, 90, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76,
    75, 74, 73, 72, 71,
  ].join(","),
};

function parseArr(s: string, n: number): number[] {
  const parts = s
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parseFloat(p))
    .map((p) => (isFinite(p) ? p : 0));
  const out = parts.slice(0, n);
  while (out.length < n) out.push(0);
  return out;
}

// Local field input — finance ledger feel. tabular-nums for column alignment.
const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

function FinanceField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {hint && (
          <span className="text-[0.55rem] italic text-faint">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}

export default function CohortArrProjectionPage() {
  const [state, setState] = useState<State>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
    } catch {}
    const shared = readShareState<State>();
    if (shared) setState({ ...defaultState, ...shared });
    setHydrated(true);
  }, []);

  const applyCurve = (kind: keyof typeof CURVES) => {
    setState((s) => ({ ...s, retentionCurve: CURVES[kind].join(",") }));
  };

  // Derive which preset (if any) is currently active by exact-string compare.
  const activeCurve: keyof typeof CURVES | null = useMemo(() => {
    for (const k of ["aggressive", "base", "conservative"] as const) {
      if (CURVES[k].join(",") === state.retentionCurve) return k;
    }
    return null;
  }, [state.retentionCurve]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const { trajectory, steadyArr, effChurn, totalNew, retentionPct, newArrParsed } = useMemo(() => {
    const acv = parseFloat(state.acv) || 0;
    const newArr = parseArr(state.newPerMonth, MONTHS);
    const retention = parseArr(state.retentionCurve, MONTHS).map(
      (r) => Math.max(0, Math.min(100, r)) / 100
    );

    // At month m, active customers = sum over k<=m of newArr[k] * retention[m-k]
    const trajectory: { month: number; customers: number; arr: number }[] = [];
    for (let m = 0; m < MONTHS; m++) {
      let customers = 0;
      for (let k = 0; k <= m; k++) {
        const age = m - k;
        customers += (newArr[k] || 0) * (retention[age] ?? retention[retention.length - 1] ?? 0);
      }
      trajectory.push({ month: m + 1, customers, arr: customers * acv });
    }

    // Steady-state: if newCustomers/month is constant N, and retention curve applied,
    // steady-state active customers ≈ N * sum(retention)
    const avgNew =
      newArr.reduce((a, b) => a + b, 0) / (newArr.length || 1);
    const sumRet = retention.reduce((a, b) => a + b, 0);
    const steady = avgNew * sumRet * acv;

    // Effective annual churn = 1 - retention[12]
    const effChurn =
      1 - (retention[11] ?? retention[retention.length - 1] ?? 0);

    return {
      trajectory,
      steadyArr: steady,
      effChurn,
      totalNew: newArr.reduce((a, b) => a + b, 0),
      retentionPct: retention,
      newArrParsed: newArr,
    };
  }, [state]);

  const peakArrValue = Math.max(...trajectory.map((t) => t.arr), 1);
  const peakArr = peakArrValue;

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  // Cohort waterfall — for each origin month k, compute its surviving ARR at every later month m.
  // cell[k][m] = newArr[k] * retention[m-k] * acv  (only when m >= k)
  const acvNum = parseFloat(state.acv) || 0;
  const cohortMatrix: number[][] = useMemo(() => {
    const rows: number[][] = [];
    for (let k = 0; k < MONTHS; k++) {
      const row: number[] = [];
      for (let m = 0; m < MONTHS; m++) {
        if (m < k) {
          row.push(0);
        } else {
          const age = m - k;
          const r = retentionPct[age] ?? retentionPct[retentionPct.length - 1] ?? 0;
          row.push((newArrParsed[k] || 0) * r * acvNum);
        }
      }
      rows.push(row);
    }
    return rows;
  }, [retentionPct, newArrParsed, acvNum]);

  const maxCell = Math.max(1, ...cohortMatrix.flat());

  // ARR projection sparkline path — for the hero chart
  const chartH = 180;
  const chartW = 800;
  const arrPath = useMemo(() => {
    if (trajectory.length === 0) return "";
    const stepX = chartW / (MONTHS - 1);
    const pts = trajectory.map((t, i) => {
      const x = i * stepX;
      const y = chartH - (t.arr / peakArr) * (chartH - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return "M " + pts.join(" L ");
  }, [trajectory, peakArr]);

  const arrAreaPath = useMemo(() => {
    if (trajectory.length === 0) return "";
    const stepX = chartW / (MONTHS - 1);
    const pts = trajectory.map((t, i) => {
      const x = i * stepX;
      const y = chartH - (t.arr / peakArr) * (chartH - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M 0,${chartH} L ` + pts.join(" L ") + ` L ${chartW},${chartH} Z`;
  }, [trajectory, peakArr]);

  // Retention sparkline
  const retentionPath = useMemo(() => {
    const stepX = chartW / (MONTHS - 1);
    const pts = retentionPct.map((r, i) => {
      const x = i * stepX;
      const y = chartH - r * (chartH - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return "M " + pts.join(" L ");
  }, [retentionPct]);

  // Ending ARR / NRR / GRR.
  // GRR (gross retention) = retention at M12 (logo-only, no expansion).
  // NRR (net retention) is approximated equal to GRR here since this model
  // doesn't include expansion ARR; we surface it for completeness with a note.
  const endingArr = trajectory[trajectory.length - 1]?.arr || 0;
  const grr = retentionPct[11] ?? retentionPct[retentionPct.length - 1] ?? 0;
  const nrr = grr; // no expansion modeled

  // Heatmap color via tool-accent alpha. Empty cells are very faint surface.
  const cellBg = (v: number) => {
    if (v <= 0) return "transparent";
    const alpha = Math.max(0.06, Math.min(0.95, v / maxCell));
    return `color-mix(in srgb, var(--tool-accent) ${(alpha * 100).toFixed(1)}%, transparent)`;
  };

  // Scenario projections at M24 ARR.
  const scenarios = (["aggressive", "base", "conservative"] as const).map((k) => {
    const curve = CURVES[k].map((r) => r / 100);
    let customers = 0;
    for (let j = 0; j <= MONTHS - 1; j++) {
      const age = MONTHS - 1 - j;
      customers +=
        (newArrParsed[j] || 0) *
        (curve[age] ?? curve[curve.length - 1] ?? 0);
    }
    return { k, customers, arr: customers * acvNum };
  });
  const scenarioMax = Math.max(1, ...scenarios.map((s) => s.arr));

  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  return (
    <ToolShell
      category="Finance"
      title="Cohort ARR Projection"
      description="Project ARR across 24 months from monthly new-customer cohorts and a retention curve."
    >
      <div
        data-tool-theme="finance"
        data-tool="cohort-arr-projection"
        className="space-y-6 text-app"
      >
        {/* Hero: ARR projection line chart with summary stats */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-6 shadow-card">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Cohort ARR
              </div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-app">
                24-month ARR trajectory
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Each month of new logos compounds against your retention curve. Watch the build.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              As of {asOfStamp}
            </div>
          </div>

          {/* Summary stat strip */}
          <div className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:grid-cols-4">
            <div className="bg-app-elevated p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Ending ARR · M24
              </div>
              <div className="mt-1 text-lg tabular-nums text-tool-accent">
                {fmt(endingArr)}
              </div>
            </div>
            <div className="bg-app-elevated p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Steady-state ARR
              </div>
              <div className="mt-1 tabular-nums text-app">{fmt(steadyArr)}</div>
            </div>
            <div className="bg-app-elevated p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                NRR · M12
              </div>
              <div className="mt-1 tabular-nums text-app">
                {(nrr * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-app-elevated p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                GRR · M12
              </div>
              <div className="mt-1 tabular-nums text-app">
                {(grr * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Hero ARR projection line chart */}
          <div className="relative mt-5 overflow-hidden rounded-xl border border-app bg-app-elevated p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                ARR projection
              </div>
              <div className="font-mono text-[0.6rem] tabular-nums text-faint">
                Peak {fmt(peakArr)}
              </div>
            </div>
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="none"
              className="h-44 w-full"
              aria-label="ARR projection line chart"
            >
              <defs>
                <linearGradient id="arr-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* horizontal grid */}
              {[0.25, 0.5, 0.75].map((g) => (
                <line
                  key={g}
                  x1={0}
                  x2={chartW}
                  y1={chartH * g}
                  y2={chartH * g}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="3 3"
                />
              ))}
              <path d={arrAreaPath} fill="url(#arr-fill)" />
              <path
                d={arrPath}
                fill="none"
                stroke="var(--tool-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {trajectory.map((t, i) => {
                const stepX = chartW / (MONTHS - 1);
                const x = i * stepX;
                const y = chartH - (t.arr / peakArr) * (chartH - 12) - 6;
                return (
                  <circle
                    key={t.month}
                    cx={x}
                    cy={y}
                    r="2"
                    fill="var(--tool-accent)"
                  >
                    <title>{`M${t.month}: ${fmt(t.arr)}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="mt-1 flex justify-between font-mono text-[0.55rem] tabular-nums text-faint">
              <span>M1</span>
              <span>M6</span>
              <span>M12</span>
              <span>M18</span>
              <span>M24</span>
            </div>
          </div>
        </header>

        {/* Inputs + Retention curve panel */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Inputs */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Cohorts & ACV
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Inputs · USD
              </span>
            </div>
            <div className="space-y-4">
              <FinanceField label="Average contract value" hint="$/year">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
                    $
                  </span>
                  <input
                    type="number"
                    value={state.acv}
                    onChange={(e) => setState((s) => ({ ...s, acv: e.target.value }))}
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="100"
                  />
                </div>
              </FinanceField>
              <FinanceField
                label="New customers per month"
                hint="24 comma-separated values"
              >
                <textarea
                  value={state.newPerMonth}
                  onChange={(e) =>
                    setState((s) => ({ ...s, newPerMonth: e.target.value }))
                  }
                  className={fieldInput + " text-xs"}
                  rows={3}
                />
              </FinanceField>
              <FinanceField
                label="Logo retention curve %"
                hint="24 values: M0, M1, M2…"
              >
                <textarea
                  value={state.retentionCurve}
                  onChange={(e) =>
                    setState((s) => ({ ...s, retentionCurve: e.target.value }))
                  }
                  className={fieldInput + " text-xs"}
                  rows={4}
                />
              </FinanceField>
              <div>
                <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Curve preset
                </div>
                {/* Sub-tabs as state buttons — active vs idle */}
                <div className="flex gap-2" role="tablist" aria-label="Retention curve preset">
                  {(["aggressive", "base", "conservative"] as const).map((k) => {
                    const active = activeCurve === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => applyCurve(k)}
                        className={
                          "flex-1 rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors " +
                          (active
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app bg-app-elevated text-secondary hover:border-tool-accent/50 hover:text-tool-accent")
                        }
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Retention curve panel */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Retention curve
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                Annual churn {(effChurn * 100).toFixed(1)}%
              </span>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated p-3">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                preserveAspectRatio="none"
                className="h-36 w-full"
                aria-label="Retention curve"
              >
                {[0.25, 0.5, 0.75].map((g) => (
                  <line
                    key={g}
                    x1={0}
                    x2={chartW}
                    y1={chartH * g}
                    y2={chartH * g}
                    stroke="currentColor"
                    strokeOpacity="0.08"
                    strokeDasharray="3 3"
                  />
                ))}
                <path
                  d={retentionPath}
                  fill="none"
                  stroke="var(--tool-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="mt-1 flex justify-between font-mono text-[0.55rem] tabular-nums text-faint">
                <span>M0 · {(retentionPct[0] * 100).toFixed(0)}%</span>
                <span>M12 · {((retentionPct[11] ?? 0) * 100).toFixed(0)}%</span>
                <span>M24 · {((retentionPct[23] ?? 0) * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Scenario side-by-side */}
            <div className="mt-4">
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Scenario · ARR @ M24
              </div>
              <div className="space-y-2">
                {scenarios.map((s) => (
                  <div key={s.k} className="flex items-center gap-3">
                    <span className="w-24 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                      {s.k}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-app-elevated">
                      <div
                        className="h-full rounded bg-tool-accent/70"
                        style={{ width: `${(s.arr / scenarioMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono text-xs tabular-nums text-app">
                      {fmt(s.arr)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Cohort waterfall heatmap */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Cohort waterfall
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Each row is a starting cohort. Each column is a calendar month. Cell shading is surviving ARR.
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 bg-tool-accent/30" /> Low
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 bg-tool-accent/70" /> Mid
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 bg-tool-accent" /> High
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-app bg-app-elevated">
            <table className="w-full border-collapse font-mono text-[0.6rem] tabular-nums">
              <thead>
                <tr className="text-faint">
                  <th className="sticky left-0 z-10 bg-app-elevated px-2 py-1.5 text-left font-medium uppercase tracking-[0.15em]">
                    Cohort
                  </th>
                  {Array.from({ length: MONTHS }, (_, m) => (
                    <th key={m} className="px-1 py-1.5 text-center font-medium">
                      M{m + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortMatrix.map((row, k) => (
                  <tr key={k} className="border-t border-app">
                    <td className="sticky left-0 z-10 bg-app-elevated px-2 py-1 text-muted">
                      C{k + 1}
                    </td>
                    {row.map((v, m) => (
                      <td
                        key={m}
                        className="h-6 w-6 border-l border-app text-center align-middle"
                        style={{ backgroundColor: cellBg(v) }}
                        title={
                          v > 0
                            ? `Cohort ${k + 1} → M${m + 1}: ${fmt(v)}`
                            : undefined
                        }
                      >
                        <span className="sr-only">{v.toFixed(0)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom: monthly trajectory table + supplementary stats */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Monthly trajectory
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                24 rows
              </span>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-app">
              <table className="w-full font-mono text-xs tabular-nums">
                <thead className="sticky top-0 bg-app-elevated text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.18em] font-medium">
                      Month
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.18em] font-medium">
                      Customers
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.18em] font-medium">
                      ARR
                    </th>
                    <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.18em] font-medium">
                      Build
                    </th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {trajectory.map((t) => (
                    <tr key={t.month} className="border-t border-app">
                      <td className="px-3 py-1.5 text-muted">
                        M{t.month.toString().padStart(2, "0")}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {t.customers.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-app">
                        {fmt(t.arr)}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="h-1.5 w-full overflow-hidden rounded bg-app-elevated">
                          <div
                            className="h-full rounded bg-tool-accent/70"
                            style={{ width: `${(t.arr / peakArr) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Summary stats
              </h2>
            </div>
            <ul className="divide-y divide-app font-mono text-xs">
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">Peak ARR</span>
                <span className="tabular-nums text-tool-accent">{fmt(peakArr)}</span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">Ending ARR · M24</span>
                <span className="tabular-nums text-app">{fmt(endingArr)}</span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">Steady-state ARR</span>
                <span className="tabular-nums text-app">{fmt(steadyArr)}</span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">Active customers · M24</span>
                <span className="tabular-nums text-app">
                  {(trajectory[trajectory.length - 1]?.customers || 0).toFixed(0)}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">Total new customers</span>
                <span className="tabular-nums text-app">{totalNew.toFixed(0)}</span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">NRR · M12</span>
                <span className="tabular-nums text-app">
                  {(nrr * 100).toFixed(1)}%
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">GRR · M12</span>
                <span className="tabular-nums text-app">
                  {(grr * 100).toFixed(1)}%
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-secondary">Effective annual churn</span>
                <span className="tabular-nums text-app">
                  {(effChurn * 100).toFixed(1)}%
                </span>
              </li>
            </ul>
            <p className="mt-3 text-[0.6rem] leading-relaxed text-faint">
              NRR equals GRR here — the model has no expansion ARR. Add upsell/cross-sell to differentiate.
            </p>
          </div>
        </section>
      </div>

      <ScenarioBar<State>
        slug="cohort-arr-projection"
        state={state}
        onLoad={(d) => setState({ ...defaultState, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Month", "Customers", "ARR"],
              ...trajectory.map((t) => [
                t.month,
                t.customers.toFixed(2),
                t.arr.toFixed(0),
              ]),
            ]),
          json: () => ({ state, trajectory, steadyArr, effChurn }),
          markdown: () =>
            `# Cohort ARR\n\n- Peak ARR: ${fmt(Math.max(...trajectory.map((t) => t.arr)))}\n- Steady-state ARR: ${fmt(steadyArr)}\n- M24 ARR: ${fmt(trajectory[trajectory.length - 1]?.arr || 0)}\n- Effective annual churn: ${(effChurn * 100).toFixed(1)}%\n`,
        }}
      />
    </ToolShell>
  );
}
