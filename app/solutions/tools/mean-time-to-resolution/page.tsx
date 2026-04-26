"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import { MTTR_BENCHMARKS } from "../../_lib/supportData";

interface Incident {
  id: string;
  opened: Date;
  closed: Date;
  severity: string;
  hours: number;
  cause?: string;
}

const LS_KEY = "solutions:mttr:v1";

const SAMPLE_CSV = `id,opened,closed,severity,cause
INC-001,2026-01-03 14:02,2026-01-03 15:40,SEV2,deploy-regression
INC-002,2026-01-09 09:11,2026-01-09 09:49,SEV3,config-drift
INC-003,2026-01-18 22:50,2026-01-19 02:20,SEV1,database-failure
INC-004,2026-02-02 10:00,2026-02-02 10:35,SEV3,config-drift
INC-005,2026-02-14 03:40,2026-02-14 05:05,SEV2,third-party-outage
INC-006,2026-02-27 18:15,2026-02-27 19:00,SEV3,deploy-regression
INC-007,2026-03-05 11:00,2026-03-05 14:00,SEV1,database-failure
INC-008,2026-03-18 16:30,2026-03-18 17:00,SEV3,capacity-exhaustion
INC-009,2026-03-26 07:45,2026-03-26 09:10,SEV2,deploy-regression`;

function parseCsv(csv: string): Incident[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const idx = {
    id: header.indexOf("id"),
    opened: header.indexOf("opened"),
    closed: header.indexOf("closed"),
    severity: header.indexOf("severity"),
    cause: header.indexOf("cause"),
  };
  const out: Incident[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((s) => s.trim());
    const opened = new Date(cols[idx.opened]);
    const closed = new Date(cols[idx.closed]);
    if (isNaN(opened.getTime()) || isNaN(closed.getTime())) continue;
    const hours = (closed.getTime() - opened.getTime()) / 3600000;
    if (hours < 0) continue;
    out.push({
      id: cols[idx.id] || `#${i}`,
      opened,
      closed,
      severity: (cols[idx.severity] || "SEV?").toUpperCase(),
      hours,
      cause: idx.cause >= 0 ? cols[idx.cause] || undefined : undefined,
    });
  }
  return out;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

// Map SEV → priority label (display only)
const SEV_PRIORITY: Record<string, { p: string; label: string; tone: string }> = {
  SEV1: { p: "P0", label: "Critical", tone: "rose" },
  SEV2: { p: "P1", label: "High", tone: "orange" },
  SEV3: { p: "P2", label: "Medium", tone: "amber" },
  SEV4: { p: "P3", label: "Low", tone: "emerald" },
};

const TONE_BAR: Record<string, string> = {
  rose: "bg-tool-accent",
  orange: "bg-tool-accent",
  amber: "bg-tool-accent",
  emerald: "bg-tool-accent",
  lime: "bg-tool-accent",
};

export default function MttrPage() {
  const [csv, setCsv] = useState<string>(SAMPLE_CSV);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCsv(raw);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, csv);
    } catch {}
  }, [csv]);

  const incidents = useMemo(() => parseCsv(csv), [csv]);

  const overall = useMemo(
    () => mean(incidents.map((i) => i.hours)),
    [incidents]
  );

  const bySev = useMemo(() => {
    const g = new Map<string, number[]>();
    incidents.forEach((i) => {
      const arr = g.get(i.severity) || [];
      arr.push(i.hours);
      g.set(i.severity, arr);
    });
    return Array.from(g.entries())
      .map(([sev, hrs]) => ({
        severity: sev,
        count: hrs.length,
        mttr: mean(hrs),
      }))
      .sort((a, b) => a.severity.localeCompare(b.severity));
  }, [incidents]);

  const mtbf = useMemo(() => {
    if (incidents.length < 2) return 0;
    const sorted = [...incidents].sort(
      (a, b) => a.opened.getTime() - b.opened.getTime()
    );
    let gap = 0;
    for (let i = 1; i < sorted.length; i++) {
      gap +=
        (sorted[i].opened.getTime() - sorted[i - 1].closed.getTime()) / 3600000;
    }
    return gap / (sorted.length - 1);
  }, [incidents]);

  const frequency = useMemo(() => {
    if (incidents.length === 0) return 0;
    const sorted = [...incidents].sort(
      (a, b) => a.opened.getTime() - b.opened.getTime()
    );
    const spanDays =
      (sorted[sorted.length - 1].opened.getTime() -
        sorted[0].opened.getTime()) /
      (3600 * 24 * 1000);
    const months = Math.max(1, spanDays / 30);
    return incidents.length / months;
  }, [incidents]);

  const byMonth = useMemo(() => {
    const g = new Map<string, Incident[]>();
    incidents.forEach((i) => {
      const k = monthKey(i.opened);
      const arr = g.get(k) || [];
      arr.push(i);
      g.set(k, arr);
    });
    return Array.from(g.entries())
      .map(([m, arr]) => ({
        month: m,
        count: arr.length,
        mttr: mean(arr.map((x) => x.hours)),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [incidents]);

  const outliers = useMemo(() => {
    if (incidents.length === 0) return [] as Incident[];
    const avg = overall;
    const threshold = avg * 2.5;
    return incidents.filter((i) => i.hours > threshold);
  }, [incidents, overall]);

  const sev1Pareto = useMemo(() => {
    const sev1 = incidents.filter((i) => i.severity === "SEV1");
    const counts = new Map<string, number>();
    sev1.forEach((i) => {
      const cause = i.cause || "unknown";
      counts.set(cause, (counts.get(cause) || 0) + 1);
    });
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const total = sev1.length;
    let cum = 0;
    return sorted.map(([cause, count]) => {
      cum += count;
      return {
        cause,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
        cumulativePct: total > 0 ? (cum / total) * 100 : 0,
      };
    });
  }, [incidents]);

  // Display-only derived: by-category (cause) for the list-with-mini-bars panel
  const byCategory = useMemo(() => {
    const g = new Map<string, number[]>();
    incidents.forEach((i) => {
      const k = i.cause || "uncategorized";
      const arr = g.get(k) || [];
      arr.push(i.hours);
      g.set(k, arr);
    });
    const rows = Array.from(g.entries()).map(([cause, hrs]) => ({
      cause,
      count: hrs.length,
      mttr: mean(hrs),
    }));
    rows.sort((a, b) => b.count - a.count);
    const max = rows.reduce((m, r) => Math.max(m, r.mttr), 0);
    return { rows, max };
  }, [incidents]);

  // Display-only derived: percentile distribution
  const percentiles = useMemo(() => {
    const hrs = incidents.map((i) => i.hours).sort((a, b) => a - b);
    const points = [50, 75, 90, 95, 99];
    return points.map((p) => ({ p, value: percentile(hrs, p) }));
  }, [incidents]);

  // Trend (display-only): last 2 monthly MTTR values for hero arrow
  const trend = useMemo(() => {
    if (byMonth.length < 2) return { delta: 0, direction: "flat" as const };
    const last = byMonth[byMonth.length - 1].mttr;
    const prev = byMonth[byMonth.length - 2].mttr;
    if (prev === 0) return { delta: 0, direction: "flat" as const };
    const d = ((last - prev) / prev) * 100;
    return {
      delta: d,
      direction: d > 1 ? ("up" as const) : d < -1 ? ("down" as const) : ("flat" as const),
    };
  }, [byMonth]);

  // Hero dial (overall MTTR shown vs SEV1 benchmark as a rough yardstick)
  const dialPct = useMemo(() => {
    if (overall === 0) return 0;
    // Lower is better — invert: 100 if at or below median, 0 if 3x median
    const ref = MTTR_BENCHMARKS.SEV2?.medianHours || 4;
    const ratio = overall / ref;
    if (ratio <= 1) return 100;
    if (ratio >= 3) return 0;
    return Math.round((1 - (ratio - 1) / 2) * 100);
  }, [overall]);

  const sev1Count = incidents.filter((i) => i.severity === "SEV1").length;

  return (
    <div
      data-tool-theme="support"
      data-tool="mean-time-to-resolution"
      className="min-h-full"
    >
      <ToolShell
        category="Support & Ops"
        title="Mean Time to Resolution"
        description="Paste an incident CSV. MTTR per severity, MTBF, monthly trend, and outliers."
      >
        {/* Console chrome + hero */}
        <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
          {/* macOS chrome */}
          <div className="flex items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-tool-accent-soft" />
            <span className="h-3 w-3 rounded-full bg-tool-accent-soft" />
            <span className="h-3 w-3 rounded-full bg-tool-accent" />
            <div className="ml-3 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-secondary">
              <span className="text-tool-accent">●</span>
              mttr.console
              <span className="text-muted">/</span>
              <span>{incidents.length} incidents</span>
            </div>
            <div className="ml-auto font-mono text-[0.65rem] text-muted">
              {new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          {/* Hero — MTTR dial */}
          <div className="tool-hero relative grid gap-6 px-6 py-7 md:grid-cols-[auto_1fr_auto]">
            <MttrDial pct={dialPct} hours={overall} />

            <div className="flex flex-col justify-center">
              <div className="text-[0.6rem] uppercase tracking-[0.25em] text-secondary">
                Mean time to resolution
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-semibold text-app">
                  {overall.toFixed(2)}
                </span>
                <span className="text-lg font-medium text-tool-accent">h</span>
                <TrendArrow trend={trend} />
              </div>
              <p className="mt-2 max-w-md text-xs text-secondary">
                Across {incidents.length} incidents
                {byMonth.length > 0 && (
                  <>
                    {" "}
                    spanning {byMonth.length} month{byMonth.length === 1 ? "" : "s"}
                  </>
                )}
                . Lower is better — benchmark P1 median is{" "}
                <span className="text-tool-accent">
                  {MTTR_BENCHMARKS.SEV2?.medianHours || 4}h
                </span>
                .
              </p>
            </div>

            {/* KPI mini-stack */}
            <div className="grid grid-cols-2 gap-2 self-center md:grid-cols-1 md:gap-2">
              <Kpi label="MTBF" value={`${mtbf.toFixed(1)}h`} />
              <Kpi
                label="Rate"
                value={`${frequency.toFixed(1)}/mo`}
              />
              <Kpi label="SEV1" value={String(sev1Count)} />
              <Kpi
                label="Outliers"
                value={String(outliers.length)}
              />
            </div>
          </div>
        </div>

        {/* CSV input + by-priority bars */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* Input panel */}
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent tool-pulse" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Incident CSV
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                id, opened, closed, severity, cause
              </span>
            </div>
            <div className="p-5">
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={14}
                spellCheck={false}
                className="w-full resize-y rounded-lg border border-app bg-app p-3 font-mono text-xs leading-relaxed text-app focus:border-tool-accent focus:outline-none focus:ring-1 focus:ring-tool-accent"
              />
              <p className="mt-3 text-xs text-secondary">
                Timestamps: ISO or{" "}
                <code className="rounded bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.7rem] text-tool-accent">
                  YYYY-MM-DD HH:mm
                </code>
                . MTTR = mean(closed − opened). MTBF = mean gap between a close
                and the next open.
              </p>
            </div>
          </section>

          {/* By priority bars */}
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  By priority
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                MTTR vs benchmark
              </span>
            </div>
            <div className="space-y-3 p-5">
              {bySev.length === 0 && (
                <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-xs text-secondary">
                  No incidents parsed.
                </div>
              )}
              {bySev.map((r) => {
                const meta =
                  SEV_PRIORITY[r.severity] || {
                    p: r.severity,
                    label: r.severity,
                    tone: "lime",
                  };
                const bench =
                  MTTR_BENCHMARKS[r.severity as keyof typeof MTTR_BENCHMARKS];
                const max = Math.max(
                  r.mttr,
                  bench?.medianHours || 0,
                  ...bySev.map((x) => x.mttr)
                );
                const pct = max > 0 ? (r.mttr / max) * 100 : 0;
                const benchPct =
                  bench && max > 0 ? (bench.medianHours / max) * 100 : null;
                const delta = bench
                  ? ((r.mttr - bench.medianHours) / bench.medianHours) * 100
                  : null;
                return (
                  <div key={r.severity} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 min-w-[2.4rem] items-center justify-center rounded-md border border-tool-accent bg-tool-accent-soft px-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-tool-accent">
                          {meta.p}
                        </span>
                        <span className="font-medium text-app">
                          {r.severity}
                        </span>
                        <span className="text-[0.65rem] text-muted">
                          · {meta.label} · {r.count}
                        </span>
                      </div>
                      <span className="font-mono text-tool-accent">
                        {r.mttr.toFixed(2)}h
                      </span>
                    </div>
                    <div className="relative h-3 overflow-hidden rounded-full bg-app">
                      <div
                        className={`h-full rounded-full ${TONE_BAR[meta.tone]}`}
                        style={{ width: `${pct}%` }}
                      />
                      {benchPct !== null && (
                        <div
                          className="absolute inset-y-0 w-px bg-app shadow-[0_0_6px_rgba(0,0,0,0.25)]"
                          style={{ left: `${benchPct}%` }}
                          title={`Industry median ${bench?.medianHours}h`}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[0.65rem]">
                      <span className="text-muted">
                        median {bench ? `${bench.medianHours}h` : "—"}
                      </span>
                      {delta !== null && (
                        <span
                          className={
                            delta <= 0 ? "text-tool-accent" : "text-secondary"
                          }
                        >
                          {delta <= 0
                            ? `${Math.abs(delta).toFixed(0)}% better`
                            : `${delta.toFixed(0)}% slower`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="pt-2 text-[0.65rem] text-muted">
                Marker = industry median (Atlassian + PagerDuty 2024).
              </p>
            </div>
          </section>
        </div>

        {/* By category + percentile distribution */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* By category */}
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  By category
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                root cause · mttr
              </span>
            </div>
            <div className="space-y-2.5 p-5">
              {byCategory.rows.length === 0 && (
                <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-xs text-secondary">
                  No data.
                </div>
              )}
              {byCategory.rows.map((r) => {
                const pct =
                  byCategory.max > 0 ? (r.mttr / byCategory.max) * 100 : 0;
                return (
                  <div
                    key={r.cause}
                    className="grid grid-cols-[1fr_2fr_auto] items-center gap-3 text-xs"
                  >
                    <span className="truncate font-mono text-app">
                      {r.cause}
                    </span>
                    <div className="relative h-2 overflow-hidden rounded-full bg-app">
                      <div
                        className="h-full rounded-full bg-tool-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-baseline gap-2 font-mono">
                      <span className="text-tool-accent">
                        {r.mttr.toFixed(1)}h
                      </span>
                      <span className="text-[0.65rem] text-muted">
                        ×{r.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Percentile distribution */}
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent tool-pulse" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Percentile distribution
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                p50 → p99
              </span>
            </div>
            <div className="p-5">
              <PercentileChart points={percentiles} />
              <div className="mt-4 grid grid-cols-5 gap-2">
                {percentiles.map((p) => (
                  <div
                    key={p.p}
                    className="rounded-lg border border-app bg-app px-2 py-2 text-center"
                  >
                    <div className="text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                      p{p.p}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-tool-accent">
                      {p.value.toFixed(1)}h
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[0.65rem] text-muted">
                p99 is the tail you negotiate SLAs against. If p99 ≫ p50, fix
                outlier classes first.
              </p>
            </div>
          </section>
        </div>

        {/* Monthly trend + outliers */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Monthly trend
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                volume · mttr
              </span>
            </div>
            <div className="p-5">
              {byMonth.length === 0 ? (
                <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-xs text-secondary">
                  No monthly data.
                </div>
              ) : (
                <div className="space-y-2">
                  {byMonth.map((r, idx) => {
                    const prev = idx > 0 ? byMonth[idx - 1] : null;
                    const delta =
                      prev && prev.mttr > 0
                        ? ((r.mttr - prev.mttr) / prev.mttr) * 100
                        : null;
                    const max = byMonth.reduce(
                      (m, x) => Math.max(m, x.mttr),
                      0
                    );
                    const pct = max > 0 ? (r.mttr / max) * 100 : 0;
                    return (
                      <div
                        key={r.month}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs"
                      >
                        <span className="font-mono text-app">
                          {r.month}
                        </span>
                        <div className="relative h-2 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full rounded-full bg-tool-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-baseline gap-2 font-mono">
                          <span className="text-tool-accent">
                            {r.mttr.toFixed(2)}h
                          </span>
                          {delta !== null && (
                            <span
                              className={`text-[0.65rem] ${
                                delta > 0 ? "text-secondary" : "text-tool-accent"
                              }`}
                            >
                              {delta > 0 ? "↑" : "↓"}
                              {Math.abs(delta).toFixed(0)}%
                            </span>
                          )}
                          <span className="text-[0.65rem] text-muted">
                            ×{r.count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent tool-pulse" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Outliers
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                &gt; {(overall * 2.5).toFixed(1)}h
              </span>
            </div>
            <div className="p-5">
              {outliers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center">
                  <div className="mx-auto mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                    ✓
                  </div>
                  <p className="text-xs text-secondary">
                    No outliers detected.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {outliers.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between rounded-lg border border-app bg-app px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent">
                          {SEV_PRIORITY[i.severity]?.p || "?"}
                        </span>
                        <span className="text-app">
                          {i.id}
                        </span>
                        {i.cause && (
                          <span className="text-[0.65rem] text-muted">
                            · {i.cause}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-tool-accent">
                        {i.hours.toFixed(1)}h
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* SEV1 Pareto */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-app px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                P0 (SEV1) Pareto
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {sev1Count} critical · root causes
            </span>
          </div>
          <div className="p-5">
            {sev1Pareto.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-xs text-secondary">
                No P0 incidents with a `cause` column. Add a `cause` column to
                your CSV to unlock this view.
              </div>
            ) : (
              <div className="space-y-2">
                {sev1Pareto.map((p) => (
                  <div
                    key={p.cause}
                    className="grid items-center gap-2 md:grid-cols-[1.4fr_3fr_auto]"
                  >
                    <span className="text-sm text-app">
                      {p.cause}
                    </span>
                    <div className="relative h-3 overflow-hidden rounded-full bg-app">
                      <div
                        className="h-full bg-tool-accent"
                        style={{ width: `${p.pct}%` }}
                      />
                      <div
                        className="absolute inset-y-0 w-px bg-app shadow-[0_0_6px_rgba(0,0,0,0.25)]"
                        style={{ left: `${p.cumulativePct}%` }}
                        title={`Cumulative ${p.cumulativePct.toFixed(0)}%`}
                      />
                    </div>
                    <span className="font-mono text-xs tabular-nums text-secondary">
                      {p.count} · {p.pct.toFixed(0)}% (cum{" "}
                      {p.cumulativePct.toFixed(0)}%)
                    </span>
                  </div>
                ))}
                <p className="pt-2 text-[0.65rem] text-muted">
                  Marker = cumulative %. Causes that cross 80% are your
                  highest-leverage fixes.
                </p>
              </div>
            )}
          </div>
        </section>
      </ToolShell>
    </div>
  );
}

// ---- Visual helpers ----

function MttrDial({ pct, hours }: { pct: number; hours: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  return (
    <div className="relative h-[140px] w-[140px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="9"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold text-app">
          {hours.toFixed(1)}
        </span>
        <span className="-mt-0.5 text-[0.55rem] uppercase tracking-[0.22em] text-secondary">
          hours
        </span>
        <span className="mt-1 font-mono text-[0.6rem] text-tool-accent">
          {clamped}/100
        </span>
      </div>
    </div>
  );
}

function TrendArrow({
  trend,
}: {
  trend: { delta: number; direction: "up" | "down" | "flat" };
}) {
  if (trend.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[0.65rem] text-secondary">
        → flat
      </span>
    );
  }
  if (trend.direction === "up") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-app bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.65rem] text-secondary">
        ↑ {trend.delta.toFixed(0)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.65rem] text-tool-accent">
      ↓ {Math.abs(trend.delta).toFixed(0)}%
    </span>
  );
}

function Kpi({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-app bg-app px-3 py-1.5 text-right text-tool-accent">
      <div className="text-[0.55rem] uppercase tracking-[0.2em] text-secondary">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function PercentileChart({
  points,
}: {
  points: { p: number; value: number }[];
}) {
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);
  const w = 100;
  const h = 60;
  if (max === 0 || points.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-app bg-app text-xs text-muted">
        No distribution yet.
      </div>
    );
  }
  const xs = points.map((_, i) => (i / (points.length - 1 || 1)) * w);
  const ys = points.map((p) => h - (p.value / max) * h);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`)
    .join(" ");
  const area = `${path} L ${xs[xs.length - 1].toFixed(2)} ${h} L 0 ${h} Z`;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-[120px] w-full"
      >
        <defs>
          <linearGradient id="mttrPctFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={w}
            y1={h * g}
            y2={h * g}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="1 2"
          />
        ))}
        <path d={area} fill="url(#mttrPctFill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={p.p}
            cx={xs[i]}
            cy={ys[i]}
            r="1.4"
            fill="var(--tool-accent)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
