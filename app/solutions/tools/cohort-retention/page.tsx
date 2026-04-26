"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Industry = "b2b_saas" | "consumer_sub" | "prosumer" | "ecomm" | "marketplace";

// Retention benchmarks — Mixpanel Product Benchmarks 2024 + OpenView 2024.
const RETENTION_BENCH: Record<
  Industry,
  { label: string; m1: number; m3: number; m6: number; m12: number; goodNrr: number }
> = {
  b2b_saas: { label: "B2B SaaS", m1: 85, m3: 75, m6: 65, m12: 55, goodNrr: 110 },
  consumer_sub: { label: "Consumer subscription", m1: 45, m3: 30, m6: 22, m12: 15, goodNrr: 95 },
  prosumer: { label: "Prosumer / SMB", m1: 65, m3: 55, m6: 45, m12: 38, goodNrr: 105 },
  ecomm: { label: "E-commerce", m1: 25, m3: 15, m6: 10, m12: 8, goodNrr: 100 },
  marketplace: { label: "Marketplace", m1: 40, m3: 28, m6: 22, m12: 18, goodNrr: 100 },
};

const SAMPLE_CSV = `user_id,signup_date,last_active_date
1,2025-01-05,2025-01-06
2,2025-01-10,2025-06-12
3,2025-01-18,2025-02-01
4,2025-01-22,2025-11-30
5,2025-02-02,2025-02-14
6,2025-02-10,2025-09-20
7,2025-02-18,2025-08-05
8,2025-03-01,2025-03-15
9,2025-03-08,2025-10-22
10,2025-03-14,2025-11-30
11,2025-04-02,2025-04-20
12,2025-04-09,2025-11-28
13,2025-04-18,2025-07-01
14,2025-05-05,2025-05-20
15,2025-05-12,2025-11-30
16,2025-06-01,2025-06-15
17,2025-06-09,2025-11-20
18,2025-07-03,2025-09-15
19,2025-07-14,2025-11-28
20,2025-08-05,2025-11-30
21,2025-08-20,2025-10-12
22,2025-09-06,2025-11-29
23,2025-10-01,2025-11-30
24,2025-11-04,2025-11-28`;

type Row = { userId: string; signup: Date; lastActive: Date };

function parseCsv(raw: string): Row[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  // Auto-detect header
  const first = lines[0].toLowerCase();
  const startIdx = /user.?id|signup|date/.test(first) ? 1 : 0;
  const out: Row[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [userId, signup, last] = parts;
    const sd = new Date(signup);
    const ld = new Date(last);
    if (!isFinite(sd.getTime()) || !isFinite(ld.getTime())) continue;
    out.push({ userId, signup: sd, lastActive: ld });
  }
  return out;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

type Cohort = {
  key: string;
  label: string;
  size: number;
  retained: number[]; // index 0 = month 0 (signup month), up to 12
};

const STORAGE = "solutions:cohort-retention:v1";

// Equity-research field input — foundation tokens, finance precision.
const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-muted focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

function ResearchField({
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
          <span className="text-[0.55rem] italic text-muted">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

// Sub-tab "state buttons" for switching heatmap views.
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function CohortRetentionPage() {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [industry, setIndustry] = useState<Industry>("b2b_saas");
  const [expansionPct, setExpansionPct] = useState("8");
  const [viewMode, setViewMode] = useState<"retention" | "size">("retention");
  const maxMonths = 12;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.csv) setCsv(p.csv);
      if (p.industry) setIndustry(p.industry);
      if (p.expansionPct) setExpansionPct(p.expansionPct);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ csv, industry, expansionPct }));
    } catch {}
  }, [csv, industry, expansionPct]);

  const { cohorts, totalUsers, avgRetention } = useMemo(() => {
    const rows = parseCsv(csv);
    const byCohort = new Map<string, Row[]>();
    for (const r of rows) {
      const k = monthKey(r.signup);
      if (!byCohort.has(k)) byCohort.set(k, []);
      byCohort.get(k)!.push(r);
    }
    const keys = Array.from(byCohort.keys()).sort();
    const cohorts: Cohort[] = keys.map((k) => {
      const group = byCohort.get(k)!;
      const retained = new Array(maxMonths + 1).fill(0);
      for (const r of group) {
        const m = Math.min(maxMonths, Math.max(0, monthsBetween(r.signup, r.lastActive)));
        // User is retained in month `m` (their last active month). For a proper retention table,
        // a user active in month m is also active in months 0..m (they had to exist).
        for (let j = 0; j <= m; j++) retained[j]++;
      }
      const [year, month] = k.split("-").map(Number);
      const d = new Date(year, month - 1, 1);
      const label = d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
      return { key: k, label, size: group.length, retained };
    });

    // Avg retention per month-offset across cohorts that have at least m months of maturity.
    const avg = new Array(maxMonths + 1).fill(0);
    const count = new Array(maxMonths + 1).fill(0);
    const now = new Date();
    for (const c of cohorts) {
      const [year, month] = c.key.split("-").map(Number);
      const cohortDate = new Date(year, month - 1, 1);
      const maturity = Math.min(maxMonths, monthsBetween(cohortDate, now));
      for (let m = 0; m <= maturity; m++) {
        if (c.size > 0) {
          avg[m] += c.retained[m] / c.size;
          count[m]++;
        }
      }
    }
    const avgRetention = avg.map((v, i) => (count[i] > 0 ? (v / count[i]) * 100 : null));

    return {
      cohorts,
      totalUsers: rows.length,
      avgRetention,
    };
  }, [csv]);

  // Triangular gradient — tool-accent intensity scales with retention %.
  const cellTextClass = (pct: number | null) => {
    if (pct == null) return "text-muted";
    if (pct >= 40) return "text-white";
    if (pct >= 20) return "text-app";
    return "text-secondary";
  };

  const cellBgStyle = (pct: number | null): React.CSSProperties => {
    if (pct == null) return {};
    const intensity = Math.max(0, Math.min(1, pct / 100));
    return {
      backgroundColor: `color-mix(in srgb, var(--tool-accent) ${(intensity * 80).toFixed(1)}%, transparent)`,
    };
  };

  const sizeCellTextClass = (count: number, max: number) => {
    if (max === 0 || count === 0) return "text-muted";
    const ratio = count / max;
    if (ratio >= 0.4) return "text-white";
    if (ratio >= 0.2) return "text-app";
    return "text-secondary";
  };

  const sizeCellBgStyle = (count: number, max: number): React.CSSProperties => {
    if (max === 0 || count === 0) return {};
    const ratio = count / max;
    return {
      backgroundColor: `color-mix(in srgb, var(--tool-accent) ${(ratio * 75).toFixed(1)}%, transparent)`,
    };
  };

  const bench = RETENTION_BENCH[industry];
  const avgM1 = avgRetention[1];
  const avgM3 = avgRetention[3];
  const avgM6 = avgRetention[6];
  const avgM12 = avgRetention[12];

  // NRR estimate: retention + expansion
  const nrrM12 = avgM12 != null ? avgM12 + (parseFloat(expansionPct) || 0) : null;
  const maxCohortSize = Math.max(...cohorts.map((c) => c.size), 1);

  // Day-30/60/90 stat chips (approximated as M1, M2, M3).
  const day30 = avgRetention[1];
  const day60 = avgRetention[2];
  const day90 = avgRetention[3];

  // Retention curve overlay — average vs benchmark line at M1/M3/M6/M12.
  const benchPoints: Record<number, number> = {
    0: 100,
    1: bench.m1,
    3: bench.m3,
    6: bench.m6,
    12: bench.m12,
  };
  const interpBench = (m: number) => {
    if (benchPoints[m] != null) return benchPoints[m];
    const keys = [0, 1, 3, 6, 12];
    let lo = 0;
    let hi = 12;
    for (let i = 0; i < keys.length - 1; i++) {
      if (m >= keys[i] && m <= keys[i + 1]) {
        lo = keys[i];
        hi = keys[i + 1];
        break;
      }
    }
    const t = (m - lo) / (hi - lo || 1);
    return benchPoints[lo] + t * (benchPoints[hi] - benchPoints[lo]);
  };

  // Weakest cohorts: pick cohorts with at least 3 months of maturity and lowest M3 retention.
  const weakest = useMemo(() => {
    const now = new Date();
    const candidates = cohorts
      .map((c) => {
        const [year, month] = c.key.split("-").map(Number);
        const cohortDate = new Date(year, month - 1, 1);
        const maturity = Math.min(maxMonths, monthsBetween(cohortDate, now));
        const m3pct = maturity >= 3 && c.size > 0 ? (c.retained[3] / c.size) * 100 : null;
        const m1pct = maturity >= 1 && c.size > 0 ? (c.retained[1] / c.size) * 100 : null;
        return { cohort: c, maturity, m3pct, m1pct };
      })
      .filter((x) => x.m3pct != null) as {
      cohort: Cohort;
      maturity: number;
      m3pct: number;
      m1pct: number | null;
    }[];
    candidates.sort((a, b) => a.m3pct - b.m3pct);
    return candidates.slice(0, 3);
  }, [cohorts]);

  const chartHeight = 140;
  const chartWidth = 100; // percentage-driven, scales

  // Build curve points for actual avg and benchmark across M0..M12.
  const curvePoints = (vals: (number | null)[]) => {
    const pts: { x: number; y: number }[] = [];
    for (let m = 0; m <= maxMonths; m++) {
      const v = vals[m];
      if (v == null) continue;
      pts.push({
        x: (m / maxMonths) * chartWidth,
        y: chartHeight - (v / 100) * chartHeight,
      });
    }
    return pts;
  };

  const benchVals = Array.from({ length: maxMonths + 1 }, (_, m) => interpBench(m));
  const actualPoints = curvePoints(avgRetention);
  const benchPointsArr = curvePoints(benchVals);

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.length === 0
      ? ""
      : pts.reduce(
          (acc, p, i) => acc + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`),
          ""
        );

  const dateStamp = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  // Verdict for masthead — vs benchmark M3.
  const verdict =
    avgM3 == null
      ? { label: "Insufficient data", tone: "neutral" as const }
      : avgM3 >= bench.m3
        ? { label: "Above benchmark", tone: "good" as const }
        : avgM3 >= bench.m3 * 0.8
          ? { label: "Near benchmark", tone: "caution" as const }
          : { label: "Below benchmark", tone: "alarm" as const };

  const verdictChip =
    verdict.tone === "alarm"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
      : verdict.tone === "caution"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : verdict.tone === "good"
          ? "border-tool-accent/40 bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-muted";

  const statChip = (
    label: string,
    value: number | null,
    benchValue: number,
    sublabel: string
  ) => {
    const tone =
      value == null
        ? "neutral"
        : value >= benchValue
          ? "good"
          : value >= benchValue * 0.8
            ? "caution"
            : "alarm";
    const valueClr =
      tone === "good"
        ? "text-emerald-500"
        : tone === "caution"
          ? "text-amber-500"
          : tone === "alarm"
            ? "text-rose-500"
            : "text-muted";
    return (
      <div className="rounded-xl border border-app bg-app-elevated px-4 py-3">
        <div className="text-[0.55rem] font-medium uppercase tracking-[0.2em] text-muted">
          {label}
        </div>
        <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${valueClr}`}>
          {value == null ? "—" : `${value.toFixed(0)}%`}
        </div>
        <div className="mt-0.5 text-[0.6rem] text-muted">
          {sublabel} · bench {benchValue}%
        </div>
      </div>
    );
  };

  return (
    <ToolShell
      category="Marketing"
      title="Cohort Retention Analyzer"
      description="Paste a CSV of user_id, signup_date, last_active_date. We bucket users by signup month and render retention for up to 12 months since signup."
    >
      <div
        data-tool-theme="finance"
        data-tool="cohort-retention"
        className="space-y-6 text-app"
      >
        {/* Equity-research masthead */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface px-6 py-5 shadow-sm">
          <span className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l border-t border-tool-accent/40" />
          <span className="pointer-events-none absolute right-0 bottom-0 h-6 w-6 border-r border-b border-tool-accent/30" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Cohort Analysis · Retention Curve
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Cohort Retention Analyzer
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Bucket users by signup month. Read the flattening curve, not the absolute number.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold tracking-[0.15em] ${verdictChip}`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                {verdict.label}
              </span>
              <span className="rounded-md border border-app bg-app-elevated px-2.5 py-1.5">
                {totalUsers.toLocaleString()} users · {cohorts.length} cohort
                {cohorts.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-md border border-app bg-app-elevated px-2.5 py-1.5">
                Run · {dateStamp}
              </span>
            </div>
          </div>
        </header>

        {/* Day 30 / 60 / 90 stat chips */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {statChip("Day 30", day30, bench.m1, "Avg M1 retention")}
          {statChip("Day 60", day60, (bench.m1 + bench.m3) / 2, "Avg M2 retention")}
          {statChip("Day 90", day90, bench.m3, "Avg M3 retention")}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.8fr]">
          {/* Left column: CSV input + benchmark panel */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-app bg-app-elevated p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Source data
                  </div>
                  <h2 className="font-tool-heading text-base font-semibold tracking-tight text-app">
                    CSV input
                  </h2>
                </div>
                <button
                  onClick={() => setCsv(SAMPLE_CSV)}
                  className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.18em] text-secondary transition hover:border-tool-accent/50 hover:text-tool-accent"
                >
                  Reset sample
                </button>
              </div>

              <ResearchField
                label="Paste your CSV"
                hint="user_id, signup_date, last_active_date · YYYY-MM-DD"
              >
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  className={`${fieldInput} min-h-[300px] text-[0.7rem] leading-snug`}
                  spellCheck={false}
                />
              </ResearchField>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <ResearchField label="Industry">
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value as Industry)}
                    className={fieldInput}
                  >
                    {(Object.keys(RETENTION_BENCH) as Industry[]).map((k) => (
                      <option key={k} value={k}>
                        {RETENTION_BENCH[k].label}
                      </option>
                    ))}
                  </select>
                </ResearchField>
                <ResearchField label="Expansion % / month" hint="for NRR">
                  <input
                    type="number"
                    value={expansionPct}
                    onChange={(e) => setExpansionPct(e.target.value)}
                    className={fieldInput}
                    step="0.5"
                  />
                </ResearchField>
              </div>
            </section>

            <section className="rounded-2xl border border-tool-accent/25 bg-tool-accent-soft p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  Benchmark · {bench.label}
                </div>
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent/70">
                  Mixpanel · OpenView 2024
                </span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  { label: "M1", you: avgM1, bench: bench.m1 },
                  { label: "M3", you: avgM3, bench: bench.m3 },
                  { label: "M6", you: avgM6, bench: bench.m6 },
                  { label: "M12", you: avgM12, bench: bench.m12 },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="w-10 text-tool-accent/70">{r.label}</span>
                    <div className="flex-1">
                      <div className="relative h-1.5 overflow-hidden rounded-full bg-app-elevated">
                        <div
                          className="absolute inset-y-0 left-0 bg-tool-accent/60"
                          style={{
                            width: `${r.you == null ? 0 : Math.min(100, r.you)}%`,
                          }}
                        />
                        <div
                          aria-hidden
                          className="absolute inset-y-0 w-px bg-app"
                          style={{ left: `${Math.min(100, r.bench)}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-14 text-right text-muted">
                      bench {r.bench}%
                    </span>
                    <span
                      className={`w-12 text-right font-semibold tabular-nums ${
                        r.you == null
                          ? "text-muted"
                          : r.you >= r.bench
                            ? "text-emerald-500"
                            : r.you >= r.bench * 0.8
                              ? "text-amber-500"
                              : "text-rose-500"
                      }`}
                    >
                      {r.you == null ? "—" : `${r.you.toFixed(0)}%`}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-tool-accent/20 pt-2">
                  <span className="w-10 text-tool-accent/70">NRR</span>
                  <span className="flex-1 text-muted">
                    M12 retention + expansion %
                  </span>
                  <span className="w-14 text-right text-muted">
                    bench {bench.goodNrr}%
                  </span>
                  <span
                    className={`w-12 text-right font-semibold tabular-nums ${
                      nrrM12 == null
                        ? "text-muted"
                        : nrrM12 >= bench.goodNrr
                          ? "text-emerald-500"
                          : "text-amber-500"
                    }`}
                  >
                    {nrrM12 == null ? "—" : `${nrrM12.toFixed(0)}%`}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[0.6rem] text-muted">
                NRR ≈ M12 retention + expansion %. Source: Mixpanel Product Benchmarks 2024,
                OpenView 2024.
              </p>
            </section>

            {/* Weakest cohort callouts */}
            {weakest.length > 0 && (
              <section className="rounded-2xl border border-app bg-app-elevated p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Weakest cohorts · M3
                </div>
                <ul className="space-y-2">
                  {weakest.map(({ cohort, m3pct, m1pct }, i) => (
                    <li
                      key={cohort.key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                          #{i + 1}
                        </span>
                        <div>
                          <div className="font-mono text-xs font-semibold text-app">
                            {cohort.label}
                          </div>
                          <div className="text-[0.6rem] text-muted">
                            {cohort.size} user{cohort.size === 1 ? "" : "s"}
                            {m1pct != null ? ` · M1 ${m1pct.toFixed(0)}%` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-base font-semibold tabular-nums text-rose-500">
                          {m3pct.toFixed(0)}%
                        </div>
                        <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                          M3
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Right column: chart + heatmap */}
          <div className="space-y-5">
            {/* Retention curve overlay chart */}
            <section className="rounded-2xl border border-app bg-app-elevated p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Retention curve
                  </div>
                  <h2 className="font-tool-heading text-base font-semibold tracking-tight text-app">
                    Average vs benchmark
                  </h2>
                </div>
                <div className="flex items-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.18em]">
                  <span className="inline-flex items-center gap-1.5 text-tool-accent">
                    <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" />
                    You
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="inline-block h-0 w-3 border-t-2 border-dashed border-current" />
                    Benchmark
                  </span>
                </div>
              </div>

              <div className="relative">
                {/* y-axis labels */}
                <div className="absolute left-0 top-0 flex h-[140px] flex-col justify-between font-mono text-[0.55rem] tabular-nums text-muted">
                  <span>100%</span>
                  <span>50%</span>
                  <span>0%</span>
                </div>
                <div className="ml-7">
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    preserveAspectRatio="none"
                    className="h-[140px] w-full"
                  >
                    {/* gridlines */}
                    {[0, 25, 50, 75, 100].map((g) => (
                      <line
                        key={g}
                        x1={0}
                        x2={chartWidth}
                        y1={chartHeight - (g / 100) * chartHeight}
                        y2={chartHeight - (g / 100) * chartHeight}
                        stroke="currentColor"
                        strokeWidth={0.2}
                        className="text-muted opacity-30"
                      />
                    ))}
                    {/* benchmark area */}
                    {benchPointsArr.length > 1 && (
                      <path
                        d={
                          toPath(benchPointsArr) +
                          ` L${benchPointsArr[benchPointsArr.length - 1].x},${chartHeight} L${benchPointsArr[0].x},${chartHeight} Z`
                        }
                        fill="currentColor"
                        className="text-muted opacity-15"
                      />
                    )}
                    {/* benchmark line — dashed */}
                    {benchPointsArr.length > 1 && (
                      <path
                        d={toPath(benchPointsArr)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={0.7}
                        strokeDasharray="1.5,1.2"
                        className="text-muted"
                      />
                    )}
                    {/* actual area */}
                    {actualPoints.length > 1 && (
                      <path
                        d={
                          toPath(actualPoints) +
                          ` L${actualPoints[actualPoints.length - 1].x},${chartHeight} L${actualPoints[0].x},${chartHeight} Z`
                        }
                        fill="var(--tool-accent)"
                        opacity={0.18}
                      />
                    )}
                    {/* actual line */}
                    {actualPoints.length > 1 && (
                      <path
                        d={toPath(actualPoints)}
                        fill="none"
                        stroke="var(--tool-accent)"
                        strokeWidth={1}
                      />
                    )}
                    {/* actual points */}
                    {actualPoints.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={0.9}
                        fill="var(--tool-accent)"
                      />
                    ))}
                  </svg>
                  {/* x-axis labels */}
                  <div className="mt-1 flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                    {[0, 3, 6, 9, 12].map((m) => (
                      <span key={m}>M{m}</span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[0.6rem] text-muted">
                A flattening curve matters more than absolute numbers. Compare slope, not endpoints.
              </p>
            </section>

            {/* Triangular cohort heatmap */}
            <section className="rounded-2xl border border-app bg-app-elevated p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    {viewMode === "retention" ? "Retention heatmap" : "Cohort-size heatmap"}
                  </div>
                  <h2 className="font-tool-heading text-base font-semibold tracking-tight text-app">
                    {viewMode === "retention"
                      ? "% retained by month-since-signup"
                      : "Users still active by cohort × month"}
                  </h2>
                </div>
                <div className="flex gap-1.5">
                  {(["retention", "size"] as const).map((m) => (
                    <TabButton
                      key={m}
                      active={viewMode === m}
                      onClick={() => setViewMode(m)}
                    >
                      {m === "retention" ? "% retention" : "Cohort size"}
                    </TabButton>
                  ))}
                </div>
              </div>

              {cohorts.length === 0 ? (
                <div className="rounded-lg border border-app bg-app p-6 text-center text-sm text-muted">
                  No parseable rows. Check that dates are YYYY-MM-DD.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse font-mono text-[0.65rem] tabular-nums">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-2 pr-3 text-left text-[0.55rem] uppercase tracking-[0.18em]">
                          Cohort
                        </th>
                        <th className="py-2 pr-3 text-right text-[0.55rem] uppercase tracking-[0.18em]">
                          Size
                        </th>
                        {Array.from({ length: maxMonths + 1 }, (_, i) => (
                          <th
                            key={i}
                            className="px-1 py-2 text-center text-[0.55rem] uppercase tracking-[0.18em]"
                          >
                            M{i}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cohorts.map((c) => {
                        const [year, month] = c.key.split("-").map(Number);
                        const cohortDate = new Date(year, month - 1, 1);
                        const maturity = Math.min(
                          maxMonths,
                          monthsBetween(cohortDate, new Date())
                        );
                        return (
                          <tr
                            key={c.key}
                            className="border-t border-app"
                          >
                            <td className="py-1.5 pr-3 text-secondary">
                              {c.label}
                            </td>
                            <td className="py-1.5 pr-3 text-right text-muted">
                              {c.size}
                            </td>
                            {Array.from({ length: maxMonths + 1 }, (_, m) => {
                              if (viewMode === "size") {
                                const count = m <= maturity ? c.retained[m] : 0;
                                const show = m <= maturity;
                                return (
                                  <td key={m} className="p-0.5">
                                    <div
                                      className={`rounded-sm px-1 py-1.5 text-center text-[0.62rem] ${
                                        show
                                          ? sizeCellTextClass(count, maxCohortSize)
                                          : "text-muted"
                                      }`}
                                      style={
                                        show
                                          ? sizeCellBgStyle(count, maxCohortSize)
                                          : undefined
                                      }
                                    >
                                      {show ? count : "—"}
                                    </div>
                                  </td>
                                );
                              }
                              const pct =
                                m <= maturity && c.size > 0
                                  ? (c.retained[m] / c.size) * 100
                                  : null;
                              return (
                                <td key={m} className="p-0.5">
                                  <div
                                    className={`rounded-sm px-1 py-1.5 text-center text-[0.62rem] ${cellTextClass(pct)}`}
                                    style={cellBgStyle(pct)}
                                  >
                                    {pct == null ? "—" : `${pct.toFixed(0)}`}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {viewMode === "retention" && (
                        <tr className="border-t-2 border-tool-accent/30">
                          <td className="py-1.5 pr-3 text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                            Average
                          </td>
                          <td />
                          {avgRetention.map((pct, m) => (
                            <td key={m} className="p-0.5">
                              <div
                                className={`rounded-sm px-1 py-1.5 text-center text-[0.62rem] font-semibold ${cellTextClass(pct)}`}
                                style={cellBgStyle(pct)}
                              >
                                {pct == null ? "—" : `${pct.toFixed(0)}`}
                              </div>
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Intensity legend */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-app pt-3">
                <div className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <span>0%</span>
                  <span
                    className="h-2 w-32 rounded-full"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, color-mix(in srgb, var(--tool-accent) 0%, transparent), color-mix(in srgb, var(--tool-accent) 80%, transparent))",
                    }}
                  />
                  <span>100%</span>
                </div>
                <p className="text-[0.6rem] text-muted">
                  Source: Mixpanel Product Benchmarks 2024, OpenView 2024.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
