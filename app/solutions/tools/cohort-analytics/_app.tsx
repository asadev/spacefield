"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Cohort & Retention — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Consolidates three growth-analytics tools into one sidebar-driven app:
     • Retention Heatmap   (CSV → cohort-retention grid, M0–M12)
     • ARR Projection      (24-month cohort ARR with retention curve)
     • Pirate Metrics      (AARRR funnel, monthly entries, conversions)

   Logic ported verbatim from:
     app/solutions/tools/cohort-retention/page.tsx
     app/solutions/tools/cohort-arr-projection/page.tsx
     app/solutions/tools/pirate-metrics-tracker/page.tsx

   Marketing chrome (ToolShell, hero, breadcrumbs, /pricing CTAs, ScenarioBar)
   has been dropped. The Pirate Metrics pane retains its team-shared Supabase
   data layer via useWorkspace + loadWorkspaceDataClient + saveWorkspaceData.
   Foundation tokens only.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

/* ───────────────────────── Shared mini primitives ───────────────────────── */

const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-muted focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

const inputClsBase =
  "w-full rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-xs tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent";

function inputCls(extra = "") {
  return `${inputClsBase} ${extra}`.trim();
}

function Section({ label, meta, children }: { label: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">{label}</div>
        {meta && <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">{meta}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ResearchField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">{label}</span>
        {hint && <span className="text-[0.55rem] italic text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function StageStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-tool-accent bg-tool-accent-soft" : "border-app bg-app-elevated"}`}>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold tabular-nums ${accent ? "text-tool-accent" : "text-app"}`}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANE 1 · Retention Heatmap
   Source: app/solutions/tools/cohort-retention/page.tsx
═══════════════════════════════════════════════════════════════════════════ */

type Industry = "b2b_saas" | "consumer_sub" | "prosumer" | "ecomm" | "marketplace";

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

const SAMPLE_RETENTION_CSV = `user_id,signup_date,last_active_date
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

type RetentionRow = { userId: string; signup: Date; lastActive: Date };

function parseRetentionCsv(raw: string): RetentionRow[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const first = lines[0].toLowerCase();
  const startIdx = /user.?id|signup|date/.test(first) ? 1 : 0;
  const out: RetentionRow[] = [];
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
  retained: number[];
};

const RETENTION_LS = "solutions:cohort-retention:v1";

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

function RetentionHeatmapPane() {
  const [csv, setCsv] = useState(SAMPLE_RETENTION_CSV);
  const [industry, setIndustry] = useState<Industry>("b2b_saas");
  const [expansionPct, setExpansionPct] = useState("8");
  const [viewMode, setViewMode] = useState<"retention" | "size">("retention");
  const maxMonths = 12;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RETENTION_LS);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.csv) setCsv(p.csv);
      if (p.industry) setIndustry(p.industry);
      if (p.expansionPct) setExpansionPct(p.expansionPct);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        RETENTION_LS,
        JSON.stringify({ csv, industry, expansionPct })
      );
    } catch {}
  }, [csv, industry, expansionPct]);

  const { cohorts, totalUsers, avgRetention } = useMemo(() => {
    const rows = parseRetentionCsv(csv);
    const byCohort = new Map<string, RetentionRow[]>();
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
        for (let j = 0; j <= m; j++) retained[j]++;
      }
      const [year, month] = k.split("-").map(Number);
      const d = new Date(year, month - 1, 1);
      const label = d.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
      return { key: k, label, size: group.length, retained };
    });

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
    const avgRetention = avg.map((v, i) =>
      count[i] > 0 ? (v / count[i]) * 100 : null
    );

    return {
      cohorts,
      totalUsers: rows.length,
      avgRetention,
    };
  }, [csv]);

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

  const sizeCellBgStyle = (
    count: number,
    max: number
  ): React.CSSProperties => {
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

  const nrrM12 = avgM12 != null ? avgM12 + (parseFloat(expansionPct) || 0) : null;
  const maxCohortSize = Math.max(...cohorts.map((c) => c.size), 1);

  const day30 = avgRetention[1];
  const day60 = avgRetention[2];
  const day90 = avgRetention[3];

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

  const weakest = useMemo(() => {
    const now = new Date();
    const candidates = cohorts
      .map((c) => {
        const [year, month] = c.key.split("-").map(Number);
        const cohortDate = new Date(year, month - 1, 1);
        const maturity = Math.min(maxMonths, monthsBetween(cohortDate, now));
        const m3pct =
          maturity >= 3 && c.size > 0 ? (c.retained[3] / c.size) * 100 : null;
        const m1pct =
          maturity >= 1 && c.size > 0 ? (c.retained[1] / c.size) * 100 : null;
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
  const chartWidth = 100;

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

  const benchVals = Array.from({ length: maxMonths + 1 }, (_, m) =>
    interpBench(m)
  );
  const actualPoints = curvePoints(avgRetention);
  const benchPointsArr = curvePoints(benchVals);

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.length === 0
      ? ""
      : pts.reduce(
          (acc, p, i) =>
            acc + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`),
          ""
        );

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
        <div
          className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${valueClr}`}
        >
          {value == null ? "—" : `${value.toFixed(0)}%`}
        </div>
        <div className="mt-0.5 text-[0.6rem] text-muted">
          {sublabel} · bench {benchValue}%
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Verdict + summary chips */}
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
      </div>

      {/* Day 30 / 60 / 90 stat chips */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {statChip("Day 30", day30, bench.m1, "Avg M1 retention")}
        {statChip("Day 60", day60, (bench.m1 + bench.m3) / 2, "Avg M2 retention")}
        {statChip("Day 90", day90, bench.m3, "Avg M3 retention")}
      </section>

      {/* CSV input + benchmark panel */}
      <Section label="source data" meta="user_id, signup_date, last_active_date">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-secondary">
            CSV bucket users by signup month, render retention up to M12.
          </div>
          <button
            onClick={() => setCsv(SAMPLE_RETENTION_CSV)}
            className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.18em] text-secondary transition hover:border-tool-accent/50 hover:text-tool-accent"
          >
            Reset sample
          </button>
        </div>

        <ResearchField label="Paste your CSV" hint="dates as YYYY-MM-DD">
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            className={`${fieldInput} min-h-[200px] text-[0.7rem] leading-snug`}
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
      </Section>

      <Section label={`benchmark · ${bench.label}`} meta="Mixpanel · OpenView 2024">
        <div className="space-y-1.5 font-mono text-xs">
          {[
            { label: "M1", you: avgM1, bench: bench.m1 },
            { label: "M3", you: avgM3, bench: bench.m3 },
            { label: "M6", you: avgM6, bench: bench.m6 },
            { label: "M12", you: avgM12, bench: bench.m12 },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span className="w-10 text-tool-accent/70">{r.label}</span>
              <div className="flex-1">
                <div className="relative h-1.5 overflow-hidden rounded-full bg-app-elevated">
                  <div className="absolute inset-y-0 left-0 bg-tool-accent/60" style={{ width: `${r.you == null ? 0 : Math.min(100, r.you)}%` }} />
                  <div aria-hidden className="absolute inset-y-0 w-px bg-app" style={{ left: `${Math.min(100, r.bench)}%` }} />
                </div>
              </div>
              <span className="w-14 text-right text-muted">bench {r.bench}%</span>
              <span className={`w-12 text-right font-semibold tabular-nums ${r.you == null ? "text-muted" : r.you >= r.bench ? "text-emerald-500" : r.you >= r.bench * 0.8 ? "text-amber-500" : "text-rose-500"}`}>
                {r.you == null ? "—" : `${r.you.toFixed(0)}%`}
              </span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-tool-accent/20 pt-2">
            <span className="w-10 text-tool-accent/70">NRR</span>
            <span className="flex-1 text-muted">M12 retention + expansion %</span>
            <span className="w-14 text-right text-muted">bench {bench.goodNrr}%</span>
            <span className={`w-12 text-right font-semibold tabular-nums ${nrrM12 == null ? "text-muted" : nrrM12 >= bench.goodNrr ? "text-emerald-500" : "text-amber-500"}`}>
              {nrrM12 == null ? "—" : `${nrrM12.toFixed(0)}%`}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[0.6rem] text-muted">
          NRR ≈ M12 retention + expansion %. Source: Mixpanel Product Benchmarks 2024, OpenView 2024.
        </p>
      </Section>

      {/* Weakest cohort callouts */}
      {weakest.length > 0 && (
        <Section label="weakest cohorts · M3" meta="">
          <ul className="space-y-2">
            {weakest.map(({ cohort, m3pct, m1pct }, i) => (
              <li key={cohort.key} className="flex items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">#{i + 1}</span>
                  <div>
                    <div className="font-mono text-xs font-semibold text-app">{cohort.label}</div>
                    <div className="text-[0.6rem] text-muted">
                      {cohort.size} user{cohort.size === 1 ? "" : "s"}
                      {m1pct != null ? ` · M1 ${m1pct.toFixed(0)}%` : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-semibold tabular-nums text-rose-500">{m3pct.toFixed(0)}%</div>
                  <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">M3</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Retention curve overlay chart */}
      <Section label="retention curve · average vs benchmark" meta="M0 → M12">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3 font-mono text-[0.6rem] uppercase tracking-[0.18em]">
          <span className="inline-flex items-center gap-1.5 text-tool-accent">
            <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" /> You
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="inline-block h-0 w-3 border-t-2 border-dashed border-current" /> Benchmark
          </span>
        </div>

        <div className="relative">
          <div className="absolute left-0 top-0 flex h-[140px] flex-col justify-between font-mono text-[0.55rem] tabular-nums text-muted">
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>
          <div className="ml-7">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="h-[140px] w-full">
              {[0, 25, 50, 75, 100].map((g) => (
                <line key={g} x1={0} x2={chartWidth} y1={chartHeight - (g / 100) * chartHeight} y2={chartHeight - (g / 100) * chartHeight} stroke="currentColor" strokeWidth={0.2} className="text-muted opacity-30" />
              ))}
              {benchPointsArr.length > 1 && (
                <path d={toPath(benchPointsArr) + ` L${benchPointsArr[benchPointsArr.length - 1].x},${chartHeight} L${benchPointsArr[0].x},${chartHeight} Z`} fill="currentColor" className="text-muted opacity-15" />
              )}
              {benchPointsArr.length > 1 && (
                <path d={toPath(benchPointsArr)} fill="none" stroke="currentColor" strokeWidth={0.7} strokeDasharray="1.5,1.2" className="text-muted" />
              )}
              {actualPoints.length > 1 && (
                <path d={toPath(actualPoints) + ` L${actualPoints[actualPoints.length - 1].x},${chartHeight} L${actualPoints[0].x},${chartHeight} Z`} fill="var(--tool-accent)" opacity={0.18} />
              )}
              {actualPoints.length > 1 && (
                <path d={toPath(actualPoints)} fill="none" stroke="var(--tool-accent)" strokeWidth={1} />
              )}
              {actualPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={0.9} fill="var(--tool-accent)" />
              ))}
            </svg>
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
      </Section>

      {/* Triangular cohort heatmap */}
      <Section
        label={
          viewMode === "retention"
            ? "retention heatmap · % retained by month-since-signup"
            : "cohort-size heatmap · users still active by cohort × month"
        }
        meta=""
      >
        <div className="mb-4 flex justify-end gap-1.5">
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

        {cohorts.length === 0 ? (
          <div className="rounded-lg border border-app bg-app p-6 text-center text-sm text-muted">
            No parseable rows. Check that dates are YYYY-MM-DD.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse font-mono text-[0.65rem] tabular-nums">
              <thead>
                <tr className="text-muted">
                  <th className="py-2 pr-3 text-left text-[0.55rem] uppercase tracking-[0.18em]">Cohort</th>
                  <th className="py-2 pr-3 text-right text-[0.55rem] uppercase tracking-[0.18em]">Size</th>
                  {Array.from({ length: maxMonths + 1 }, (_, i) => (
                    <th key={i} className="px-1 py-2 text-center text-[0.55rem] uppercase tracking-[0.18em]">M{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => {
                  const [year, month] = c.key.split("-").map(Number);
                  const cohortDate = new Date(year, month - 1, 1);
                  const maturity = Math.min(maxMonths, monthsBetween(cohortDate, new Date()));
                  return (
                    <tr key={c.key} className="border-t border-app">
                      <td className="py-1.5 pr-3 text-secondary">{c.label}</td>
                      <td className="py-1.5 pr-3 text-right text-muted">{c.size}</td>
                      {Array.from({ length: maxMonths + 1 }, (_, m) => {
                        if (viewMode === "size") {
                          const count = m <= maturity ? c.retained[m] : 0;
                          const show = m <= maturity;
                          return (
                            <td key={m} className="p-0.5">
                              <div
                                className={`rounded-sm px-1 py-1.5 text-center text-[0.62rem] ${show ? sizeCellTextClass(count, maxCohortSize) : "text-muted"}`}
                                style={show ? sizeCellBgStyle(count, maxCohortSize) : undefined}
                              >
                                {show ? count : "—"}
                              </div>
                            </td>
                          );
                        }
                        const pct = m <= maturity && c.size > 0 ? (c.retained[m] / c.size) * 100 : null;
                        return (
                          <td key={m} className="p-0.5">
                            <div className={`rounded-sm px-1 py-1.5 text-center text-[0.62rem] ${cellTextClass(pct)}`} style={cellBgStyle(pct)}>
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
                    <td className="py-1.5 pr-3 text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">Average</td>
                    <td />
                    {avgRetention.map((pct, m) => (
                      <td key={m} className="p-0.5">
                        <div className={`rounded-sm px-1 py-1.5 text-center text-[0.62rem] font-semibold ${cellTextClass(pct)}`} style={cellBgStyle(pct)}>
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
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANE 2 · ARR Projection
   Source: app/solutions/tools/cohort-arr-projection/page.tsx
═══════════════════════════════════════════════════════════════════════════ */

const CURVES: Record<"aggressive" | "base" | "conservative", number[]> = {
  aggressive: [
    100, 99, 98, 97, 96, 95, 94, 94, 93, 93, 92, 92, 91, 91, 90, 90, 90, 89,
    89, 89, 88, 88, 88, 87,
  ],
  base: [
    100, 98, 96, 94, 92, 90, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77,
    76, 75, 74, 73, 72, 71,
  ],
  conservative: [
    100, 95, 90, 85, 80, 76, 72, 68, 65, 62, 59, 56, 53, 50, 48, 46, 44, 42,
    40, 38, 36, 34, 32, 30,
  ],
};

const ARR_LS = "solutions:cohort-arr-projection:v1";
const MONTHS = 24;

interface ArrState {
  acv: string;
  newPerMonth: string;
  retentionCurve: string;
}

const arrDefaultState: ArrState = {
  acv: "12000",
  newPerMonth: Array(MONTHS).fill(10).join(","),
  retentionCurve: [
    100, 98, 96, 94, 92, 90, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77,
    76, 75, 74, 73, 72, 71,
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

function ArrProjectionPane() {
  const [state, setState] = useState<ArrState>(arrDefaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARR_LS);
      if (raw) setState({ ...arrDefaultState, ...JSON.parse(raw) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(ARR_LS, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const applyCurve = (kind: keyof typeof CURVES) => {
    setState((s) => ({ ...s, retentionCurve: CURVES[kind].join(",") }));
  };

  const activeCurve: keyof typeof CURVES | null = useMemo(() => {
    for (const k of ["aggressive", "base", "conservative"] as const) {
      if (CURVES[k].join(",") === state.retentionCurve) return k;
    }
    return null;
  }, [state.retentionCurve]);

  const {
    trajectory,
    steadyArr,
    effChurn,
    totalNew,
    retentionPct,
    newArrParsed,
  } = useMemo(() => {
    const acv = parseFloat(state.acv) || 0;
    const newArr = parseArr(state.newPerMonth, MONTHS);
    const retention = parseArr(state.retentionCurve, MONTHS).map(
      (r) => Math.max(0, Math.min(100, r)) / 100
    );

    const trajectory: { month: number; customers: number; arr: number }[] = [];
    for (let m = 0; m < MONTHS; m++) {
      let customers = 0;
      for (let k = 0; k <= m; k++) {
        const age = m - k;
        customers +=
          (newArr[k] || 0) *
          (retention[age] ?? retention[retention.length - 1] ?? 0);
      }
      trajectory.push({ month: m + 1, customers, arr: customers * acv });
    }

    const avgNew =
      newArr.reduce((a, b) => a + b, 0) / (newArr.length || 1);
    const sumRet = retention.reduce((a, b) => a + b, 0);
    const steady = avgNew * sumRet * acv;

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
          const r =
            retentionPct[age] ?? retentionPct[retentionPct.length - 1] ?? 0;
          row.push((newArrParsed[k] || 0) * r * acvNum);
        }
      }
      rows.push(row);
    }
    return rows;
  }, [retentionPct, newArrParsed, acvNum]);

  const maxCell = Math.max(1, ...cohortMatrix.flat());

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

  const retentionPath = useMemo(() => {
    const stepX = chartW / (MONTHS - 1);
    const pts = retentionPct.map((r, i) => {
      const x = i * stepX;
      const y = chartH - r * (chartH - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return "M " + pts.join(" L ");
  }, [retentionPct]);

  const endingArr = trajectory[trajectory.length - 1]?.arr || 0;
  const grr = retentionPct[11] ?? retentionPct[retentionPct.length - 1] ?? 0;
  const nrr = grr;

  const cellBg = (v: number) => {
    if (v <= 0) return "transparent";
    const alpha = Math.max(0.06, Math.min(0.95, v / maxCell));
    return `color-mix(in srgb, var(--tool-accent) ${(alpha * 100).toFixed(1)}%, transparent)`;
  };

  const scenarios = (["aggressive", "base", "conservative"] as const).map(
    (k) => {
      const curve = CURVES[k].map((r) => r / 100);
      let customers = 0;
      for (let j = 0; j <= MONTHS - 1; j++) {
        const age = MONTHS - 1 - j;
        customers +=
          (newArrParsed[j] || 0) *
          (curve[age] ?? curve[curve.length - 1] ?? 0);
      }
      return { k, customers, arr: customers * acvNum };
    }
  );
  const scenarioMax = Math.max(1, ...scenarios.map((s) => s.arr));

  const heroStats: { label: string; value: string; accent?: boolean }[] = [
    { label: "Ending ARR · M24", value: fmt(endingArr), accent: true },
    { label: "Steady-state ARR", value: fmt(steadyArr) },
    { label: "NRR · M12", value: `${(nrr * 100).toFixed(1)}%` },
    { label: "GRR · M12", value: `${(grr * 100).toFixed(1)}%` },
  ];

  return (
    <div className="space-y-5">
      {/* Summary stat strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:grid-cols-4">
        {heroStats.map((h) => (
          <div key={h.label} className="bg-app-elevated p-3">
            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">{h.label}</div>
            <div className={`mt-1 tabular-nums ${h.accent ? "text-lg text-tool-accent" : "text-app"}`}>{h.value}</div>
          </div>
        ))}
      </div>

      {/* ARR projection chart */}
      <Section label="ARR projection" meta={`Peak ${fmt(peakArr)}`}>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" className="h-44 w-full" aria-label="ARR projection line chart">
          <defs>
            <linearGradient id="arr-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} x2={chartW} y1={chartH * g} y2={chartH * g} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
          ))}
          <path d={arrAreaPath} fill="url(#arr-fill)" />
          <path d={arrPath} fill="none" stroke="var(--tool-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {trajectory.map((t, i) => {
            const stepX = chartW / (MONTHS - 1);
            const x = i * stepX;
            const y = chartH - (t.arr / peakArr) * (chartH - 12) - 6;
            return (
              <circle key={t.month} cx={x} cy={y} r="2" fill="var(--tool-accent)">
                <title>{`M${t.month}: ${fmt(t.arr)}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[0.55rem] tabular-nums text-muted">
          <span>M1</span><span>M6</span><span>M12</span><span>M18</span><span>M24</span>
        </div>
      </Section>

      {/* Inputs */}
      <Section label="cohorts & ACV" meta="inputs · USD">
        <div className="space-y-4">
          <ResearchField label="Average contract value" hint="$/year">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">$</span>
              <input type="number" value={state.acv} onChange={(e) => setState((s) => ({ ...s, acv: e.target.value }))} className={fieldInput + " pl-7"} min="0" step="100" />
            </div>
          </ResearchField>
          <ResearchField label="New customers per month" hint="24 comma-separated values">
            <textarea value={state.newPerMonth} onChange={(e) => setState((s) => ({ ...s, newPerMonth: e.target.value }))} className={fieldInput + " text-xs"} rows={3} />
          </ResearchField>
          <ResearchField label="Logo retention curve %" hint="24 values: M0, M1, M2…">
            <textarea value={state.retentionCurve} onChange={(e) => setState((s) => ({ ...s, retentionCurve: e.target.value }))} className={fieldInput + " text-xs"} rows={4} />
          </ResearchField>
          <div>
            <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Curve preset</div>
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
                    className={"flex-1 rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors " + (active ? "border-tool-accent bg-tool-accent-soft text-tool-accent" : "border-app bg-app-elevated text-secondary hover:border-tool-accent/50 hover:text-tool-accent")}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Retention curve panel */}
      <Section label="retention curve" meta={`Annual churn ${(effChurn * 100).toFixed(1)}%`}>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" className="h-36 w-full" aria-label="Retention curve">
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} x2={chartW} y1={chartH * g} y2={chartH * g} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
          ))}
          <path d={retentionPath} fill="none" stroke="var(--tool-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[0.55rem] tabular-nums text-muted">
          <span>M0 · {(retentionPct[0] * 100).toFixed(0)}%</span>
          <span>M12 · {((retentionPct[11] ?? 0) * 100).toFixed(0)}%</span>
          <span>M24 · {((retentionPct[23] ?? 0) * 100).toFixed(0)}%</span>
        </div>

        <div className="mt-4">
          <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Scenario · ARR @ M24</div>
          <div className="space-y-2">
            {scenarios.map((s) => (
              <div key={s.k} className="flex items-center gap-3">
                <span className="w-24 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">{s.k}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-app-elevated">
                  <div className="h-full rounded bg-tool-accent/70" style={{ width: `${(s.arr / scenarioMax) * 100}%` }} />
                </div>
                <span className="w-24 text-right font-mono text-xs tabular-nums text-app">{fmt(s.arr)}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Cohort waterfall heatmap */}
      <Section label="cohort waterfall" meta="row = origin cohort · col = month">
        <div className="mb-3 flex items-center justify-end gap-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
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

        <div className="overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full border-collapse font-mono text-[0.6rem] tabular-nums">
            <thead>
              <tr className="text-muted">
                <th className="sticky left-0 z-10 bg-app-elevated px-2 py-1.5 text-left font-medium uppercase tracking-[0.15em]">Cohort</th>
                {Array.from({ length: MONTHS }, (_, m) => (
                  <th key={m} className="px-1 py-1.5 text-center font-medium">M{m + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortMatrix.map((row, k) => (
                <tr key={k} className="border-t border-app">
                  <td className="sticky left-0 z-10 bg-app-elevated px-2 py-1 text-muted">C{k + 1}</td>
                  {row.map((v, m) => (
                    <td
                      key={m}
                      className="h-6 w-6 border-l border-app text-center align-middle"
                      style={{ backgroundColor: cellBg(v) }}
                      title={v > 0 ? `Cohort ${k + 1} → M${m + 1}: ${fmt(v)}` : undefined}
                    >
                      <span className="sr-only">{v.toFixed(0)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Monthly trajectory + summary stats */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section label="monthly trajectory" meta="24 rows">
          <div className="max-h-72 overflow-auto rounded-lg border border-app">
            <table className="w-full font-mono text-xs tabular-nums">
              <thead className="sticky top-0 bg-app-elevated text-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.18em] font-medium">Month</th>
                  <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.18em] font-medium">Customers</th>
                  <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.18em] font-medium">ARR</th>
                  <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.18em] font-medium">Build</th>
                </tr>
              </thead>
              <tbody className="text-secondary">
                {trajectory.map((t) => (
                  <tr key={t.month} className="border-t border-app">
                    <td className="px-3 py-1.5 text-muted">M{t.month.toString().padStart(2, "0")}</td>
                    <td className="px-3 py-1.5 text-right">{t.customers.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-right text-app">{fmt(t.arr)}</td>
                    <td className="px-3 py-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded bg-app-elevated">
                        <div className="h-full rounded bg-tool-accent/70" style={{ width: `${(t.arr / peakArr) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section label="summary stats" meta="">
          <ul className="divide-y divide-app font-mono text-xs">
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">Peak ARR</span><span className="tabular-nums text-tool-accent">{fmt(peakArr)}</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">Ending ARR · M24</span><span className="tabular-nums text-app">{fmt(endingArr)}</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">Steady-state ARR</span><span className="tabular-nums text-app">{fmt(steadyArr)}</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">Active customers · M24</span><span className="tabular-nums text-app">{(trajectory[trajectory.length - 1]?.customers || 0).toFixed(0)}</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">Total new customers</span><span className="tabular-nums text-app">{totalNew.toFixed(0)}</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">NRR · M12</span><span className="tabular-nums text-app">{(nrr * 100).toFixed(1)}%</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">GRR · M12</span><span className="tabular-nums text-app">{(grr * 100).toFixed(1)}%</span></li>
            <li className="flex items-center justify-between py-2.5"><span className="text-secondary">Effective annual churn</span><span className="tabular-nums text-app">{(effChurn * 100).toFixed(1)}%</span></li>
          </ul>
          <p className="mt-3 text-[0.6rem] leading-relaxed text-muted">
            NRR equals GRR here — the model has no expansion ARR. Add upsell/cross-sell to differentiate.
          </p>
        </Section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANE 3 · Pirate Metrics (AARRR)
   Source: app/solutions/tools/pirate-metrics-tracker/page.tsx
   Team-shared via useWorkspace + Supabase workspace_data table.
═══════════════════════════════════════════════════════════════════════════ */

const PIRATE_LS = "solutions:pirate-metrics-tracker:v1";
const PIRATE_NAMESPACE = "pirate-metrics";
const PIRATE_DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

type Stage = "acquisition" | "activation" | "retention" | "referral" | "revenue";
type ViewKey = "funnel" | "cohorts" | "trends";

const STAGES: { key: Stage; label: string; letter: string; hint: string }[] = [
  { key: "acquisition", label: "Acquisition", letter: "A", hint: "Visitors, signups" },
  { key: "activation", label: "Activation", letter: "A", hint: "First valuable action" },
  { key: "retention", label: "Retention", letter: "R", hint: "Came back W2+" },
  { key: "referral", label: "Referral", letter: "R", hint: "Invited >=1 friend" },
  { key: "revenue", label: "Revenue", letter: "R", hint: "Paid customers" },
];

const CONVERSION_BENCH: Record<
  string,
  { range: string; median: number; great: number }
> = {
  "Visitor -> Signup": { range: "2-5%", median: 3, great: 5 },
  "Signup -> Activation": { range: "20-40%", median: 30, great: 40 },
  "Activation -> Retention": { range: "60-85%", median: 72, great: 85 },
  "Activation -> Referral": { range: "10-20%", median: 15, great: 20 },
  "Free -> Paid": { range: "2-5%", median: 3, great: 5 },
};

interface MonthEntry {
  id: string;
  month: string;
  values: Record<Stage, number>;
}

interface PirateState {
  entries: MonthEntry[];
  goals?: Record<Stage, number>;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pirateDefaultState(): PirateState {
  return {
    entries: [
      {
        id: uid(),
        month: currentMonth(),
        values: {
          acquisition: 10000,
          activation: 3500,
          retention: 1800,
          referral: 400,
          revenue: 600,
        },
      },
    ],
  };
}

function rate(num: number, denom: number): number {
  if (!denom) return 0;
  return num / denom;
}

function nextMonthStr(m: string): string {
  const [y, mo] = m.split("-").map((x) => parseInt(x, 10));
  const d = new Date(y, (mo || 1) - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PirateMetricsPane() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<PirateState>(pirateDefaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("funnel");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<PirateState>(
          current.id,
          PIRATE_NAMESPACE,
          PIRATE_DATA_KEY
        );
        if (cancelled) return;
        if (data && Array.isArray(data.entries)) setState(data);
        else setState(pirateDefaultState());
      } else {
        try {
          const raw = localStorage.getItem(PIRATE_LS);
          if (raw) {
            const parsed = JSON.parse(raw) as PirateState;
            if (parsed && Array.isArray(parsed.entries)) setState(parsed);
            else setState(pirateDefaultState());
          } else setState(pirateDefaultState());
        } catch {
          setState(pirateDefaultState());
        }
      }
      lastSig.current = null;
      setHydrated(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (current.kind === "team") {
        setSyncing(true);
        const res = await saveWorkspaceData(
          current.id,
          PIRATE_NAMESPACE,
          PIRATE_DATA_KEY,
          state
        );
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(PIRATE_LS, sig);
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {}
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  const addMonth = () => {
    const last = state.entries[state.entries.length - 1];
    setState((s) => ({
      ...s,
      entries: [
        ...s.entries,
        {
          id: uid(),
          month: nextMonthStr(last?.month ?? currentMonth()),
          values: last
            ? { ...last.values }
            : {
                acquisition: 0,
                activation: 0,
                retention: 0,
                referral: 0,
                revenue: 0,
              },
        },
      ],
    }));
  };

  const updateEntry = (id: string, patch: Partial<MonthEntry>) =>
    setState((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));

  const updateValue = (id: string, stage: Stage, v: number) =>
    setState((s) => ({
      ...s,
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, values: { ...e.values, [stage]: v } } : e
      ),
    }));

  const removeEntry = (id: string) =>
    setState((s) => ({
      ...s,
      entries: s.entries.filter((e) => e.id !== id),
    }));

  const sorted = useMemo(
    () => [...state.entries].sort((a, b) => a.month.localeCompare(b.month)),
    [state.entries]
  );

  const latest = sorted[sorted.length - 1];

  const conversions = useMemo(() => {
    if (!latest) return [];
    const v = latest.values;
    return [
      { label: "Acq -> Act", rate: rate(v.activation, v.acquisition) },
      { label: "Act -> Ret", rate: rate(v.retention, v.activation) },
      { label: "Ret -> Ref", rate: rate(v.referral, v.retention) },
      { label: "Ret -> Rev", rate: rate(v.revenue, v.retention) },
    ];
  }, [latest]);

  const trend = (stage: Stage) => {
    if (sorted.length < 2) return 0;
    const last = sorted[sorted.length - 1].values[stage];
    const prev = sorted[sorted.length - 2].values[stage];
    return rate(last - prev, prev);
  };

  const maxByStage = (stage: Stage) =>
    Math.max(1, ...sorted.map((e) => e.values[stage]));

  const funnelRows = STAGES.map((s, i) => {
    const v = latest?.values[s.key] ?? 0;
    const top = latest?.values.acquisition || 1;
    const prevKey = i > 0 ? STAGES[i - 1].key : null;
    const prev = prevKey ? latest?.values[prevKey] ?? 0 : v;
    const widthPct = Math.max(6, Math.min(100, (v / top) * 100));
    const stageConv = i === 0 ? 1 : prev > 0 ? v / prev : 0;
    const opacity = 0.35 + i * 0.13;
    return { stage: s, value: v, widthPct, stageConv, opacity };
  });

  const totalRevenue = latest?.values.revenue ?? 0;
  const activationPct = latest
    ? rate(latest.values.activation, latest.values.acquisition) * 100
    : 0;
  const overallDropoff =
    latest && latest.values.acquisition > 0
      ? ((latest.values.acquisition - latest.values.revenue) /
          latest.values.acquisition) *
        100
      : 0;

  return (
    <div className="space-y-5">
      {/* Header strip — sync status + view switcher + add month */}
      <div className="flex flex-wrap items-center gap-2 border-b border-app pb-3">
        <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
          AARRR
        </span>
        <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
          {sorted.length} mo
        </span>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          {latest?.month ?? "—"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[0.6rem] text-muted">
            {syncing
              ? "saving..."
              : syncedAt
                ? `saved ${syncedAt}`
                : current.kind === "team"
                  ? "team"
                  : "personal"}
          </span>
          <button
            onClick={addMonth}
            className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + Month
          </button>
        </div>
      </div>

      {/* Headline number + activation chip */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-app bg-app-elevated p-4">
        <div>
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            Pirate metrics · Dave McClure
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold tabular-nums text-app">
              {latest ? totalRevenue.toLocaleString() : "0"}
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              revenue {latest?.month ?? ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
          <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
              Activation
            </div>
            <div className="font-mono text-lg font-bold tabular-nums text-tool-accent">
              {activationPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Drop-off
            </div>
            <div className="text-sm font-semibold text-app">
              {overallDropoff.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* View pill switcher */}
      <div className="flex gap-1.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
          {(
            [
              { k: "funnel", label: "Funnel" },
              { k: "cohorts", label: "Cohorts" },
              { k: "trends", label: "Trends" },
            ] as { k: ViewKey; label: string }[]
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setView(t.k)}
              className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                view === t.k
                  ? "bg-tool-accent text-app-elevated"
                  : "text-secondary hover:text-app"
              }`}
              style={view === t.k ? { color: "var(--bg)" } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stage stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAGES.map((s) => (
          <StageStat
            key={s.key}
            label={s.label}
            value={latest ? latest.values[s.key].toLocaleString() : "0"}
            accent={s.key === "revenue"}
          />
        ))}
      </div>

      {/* Funnel view */}
      {view === "funnel" && latest && (
        <Section label={`funnel · ${latest.month}`} meta="tapered ribbon">
          <div className="mx-auto max-w-3xl space-y-1">
            {funnelRows.map((row, i) => (
              <div key={row.stage.key}>
                {i > 0 && (
                  <div className="relative my-1 flex items-center justify-center">
                    <div className="flex items-center gap-2 rounded-full border border-tool-accent bg-tool-accent-soft px-2.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      <span className="text-[0.65rem] font-semibold tabular-nums">{(row.stageConv * 100).toFixed(1)}%</span>
                      <span aria-hidden>↓</span>
                    </div>
                  </div>
                )}

                <div className="mx-auto flex items-center justify-center" style={{ width: `${row.widthPct}%`, minWidth: "10rem" }}>
                  <div
                    className="relative flex h-12 w-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-tool-accent px-4"
                    style={{ backgroundColor: "var(--tool-accent)", opacity: row.opacity }}
                    title={`${row.stage.label}: ${row.value.toLocaleString()}`}
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-tool-accent" style={{ opacity: 1 }} />
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-base font-black" style={{ color: "var(--bg)" }}>{row.stage.letter}</span>
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em]" style={{ color: "var(--bg)" }}>{row.stage.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className="rounded-full bg-app px-2 py-0.5 font-mono text-[0.65rem] font-semibold tabular-nums text-tool-accent">{row.widthPct.toFixed(0)}%</span>
                      <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: "var(--bg)" }}>{row.value.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {conversions.map((c) => (
              <div key={c.label} className="rounded-lg border border-app bg-app p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">{c.label}</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-tool-accent">{(c.rate * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Cohorts / monthly entries */}
      {view === "cohorts" && (
        <div className="space-y-3">
          {sorted.map((e) => (
            <div key={e.id} className="rounded-xl border border-app bg-app-elevated p-4">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <input type="month" value={e.month} onChange={(ev) => updateEntry(e.id, { month: ev.target.value })} className={inputCls("w-40")} />
                <button
                  onClick={() => removeEntry(e.id)}
                  className="rounded-md border border-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                >
                  Delete
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STAGES.map((s) => (
                  <label key={s.key} className="block">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">{s.label}</span>
                      <span className="text-[0.55rem] italic text-muted">{s.hint}</span>
                    </div>
                    <input type="number" value={e.values[s.key]} onChange={(ev) => updateValue(e.id, s.key, Number(ev.target.value) || 0)} className={inputCls()} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trends view */}
      {view === "trends" && (
        <>
          {sorted.length >= 2 ? (
            <>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Stage-over-stage trend (latest vs previous)
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STAGES.map((s) => {
                  const t = trend(s.key);
                  return (
                    <div key={s.key} className="rounded-lg border border-app bg-app-elevated p-3">
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">{s.label}</div>
                      <div className={`mt-1 font-mono text-sm font-semibold tabular-nums ${t > 0 ? "text-emerald-500" : t < 0 ? "text-rose-500" : "text-app"}`}>
                        {t > 0 ? "+" : ""}{(t * 100).toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>

              <Section label="12-month time-series · all stages" meta="">
                <div className="space-y-2">
                  {STAGES.map((s) => {
                    const max = maxByStage(s.key);
                    return (
                      <div key={s.key}>
                        <div className="mb-0.5 flex justify-between font-mono text-[0.6rem] text-secondary">
                          <span>{s.label}</span>
                          <span className="tabular-nums">{latest?.values[s.key].toLocaleString()}</span>
                        </div>
                        <div className="flex h-8 items-end gap-1">
                          {sorted.slice(-12).map((e) => (
                            <div
                              key={e.id}
                              className="flex-1 rounded-t bg-tool-accent"
                              style={{ height: `${(e.values[s.key] / max) * 100}%`, opacity: s.key === "revenue" ? 0.85 : 0.5 }}
                              title={`${e.month}: ${e.values[s.key].toLocaleString()}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
              Add at least two months to see trends.
            </div>
          )}
        </>
      )}

      {/* Benchmarks + goals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section label="SaaS benchmarks" meta="your conversion vs median">
          <div className="space-y-2">
            {Object.entries(CONVERSION_BENCH).map(([label, b]) => {
              const v = latest?.values;
              let you = 0;
              if (v) {
                if (label.startsWith("Visitor")) you = rate(v.activation, v.acquisition) * 100;
                else if (label.startsWith("Signup")) you = rate(v.activation, v.acquisition) * 100;
                else if (label.startsWith("Activation -> Retention")) you = rate(v.retention, v.activation) * 100;
                else if (label.startsWith("Activation -> Referral")) you = rate(v.referral, v.activation) * 100;
                else if (label.startsWith("Free")) you = rate(v.revenue, v.activation) * 100;
              }
              return (
                <div key={label} className="rounded-lg border border-app bg-app p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-secondary">{label}</span>
                    <span className={`font-mono font-semibold tabular-nums ${you >= b.median ? "text-emerald-500" : you >= b.median * 0.7 ? "text-amber-500" : "text-rose-500"}`}>
                      {you.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[0.6rem] text-muted">
                    <span>bench {b.range}</span>
                    <div className="relative h-1 flex-1 overflow-hidden rounded bg-app-elevated">
                      <div className="absolute inset-y-0 bg-tool-accent-soft" style={{ width: `${(b.median / b.great) * 100}%` }} />
                      <div className="absolute -top-0.5 h-2 w-0.5 bg-tool-accent" style={{ left: `${Math.min(100, (you / b.great) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[0.6rem] text-muted">
            Source: Mixpanel Product Benchmarks 2024, OpenView SaaS 2024.
          </p>
        </Section>

        <Section label="goals per stage" meta="set targets, track progress">
          <div className="space-y-2">
            {STAGES.map((s) => {
              const goal = state.goals?.[s.key] ?? 0;
              const actual = latest?.values[s.key] ?? 0;
              const pct = goal > 0 ? (actual / goal) * 100 : 0;
              return (
                <div key={s.key} className="rounded-lg border border-app bg-app p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-24 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-secondary">{s.label}</span>
                    <input
                      type="number"
                      value={goal || ""}
                      placeholder="Goal"
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        setState((st) => ({
                          ...st,
                          goals: {
                            ...(st.goals ?? { acquisition: 0, activation: 0, retention: 0, referral: 0, revenue: 0 }),
                            [s.key]: v,
                          },
                        }));
                      }}
                      className={inputCls("!py-1 text-xs")}
                    />
                    <span className={`w-14 text-right font-mono text-xs font-semibold tabular-nums ${pct >= 100 ? "text-emerald-500" : pct >= 70 ? "text-amber-500" : "text-muted"}`}>
                      {goal > 0 ? `${pct.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  {goal > 0 && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-app-elevated">
                      <div className="h-full bg-tool-accent" style={{ width: `${Math.min(100, pct)}%`, opacity: pct >= 100 ? 1 : 0.7 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar + main shell
═══════════════════════════════════════════════════════════════════════════ */

type Pane = "retention" | "arr" | "pirate";

const PANES: {
  k: Pane;
  name: string;
  icon: string;
  hint: string;
}[] = [
  { k: "retention", name: "Retention Heatmap", icon: "▦", hint: "cohort grid" },
  { k: "arr", name: "ARR Projection", icon: "$", hint: "24-mo cohort ARR" },
  { k: "pirate", name: "Pirate Metrics (AARRR)", icon: "⚑", hint: "funnel · team" },
];

export default function CohortAnalyticsApp(_props: NativeAppProps) {
  const [active, setActive] = useState<Pane>("retention");
  const narrow = (_props.width ?? 0) < 640;

  return (
    <div
      data-tool-theme="growth"
      data-tool="cohort-analytics"
      className="flex h-full w-full overflow-hidden bg-app text-app"
      style={{ height: _props.height ?? "100%" }}
    >
      <aside className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-app bg-app-elevated p-2" style={{ width: narrow ? 96 : 220 }}>
        <div className="mb-1 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          {narrow ? "cohort" : "cohort & retention"}
        </div>
        {PANES.map((c) => {
          const isActive = active === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setActive(c.k)}
              className={`group flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${isActive ? "border-tool-accent bg-tool-accent-soft text-tool-accent" : "border-transparent bg-transparent text-secondary hover:border-app hover:bg-app hover:text-app"}`}
              title={c.name}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[0.6rem] font-semibold ${isActive ? "border-tool-accent bg-tool-accent text-app-elevated" : "border-app bg-app text-secondary group-hover:border-tool-accent group-hover:text-tool-accent"}`}
                style={isActive ? { color: "var(--bg)" } : undefined}
              >
                {c.icon}
              </span>
              {!narrow && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{c.name}</div>
                  <div className="truncate font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">{c.hint}</div>
                </div>
              )}
            </button>
          );
        })}
      </aside>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-[920px]">
          {active === "retention" && <RetentionHeatmapPane />}
          {active === "arr" && <ArrProjectionPane />}
          {active === "pirate" && <PirateMetricsPane />}
        </div>
      </main>
    </div>
  );
}
