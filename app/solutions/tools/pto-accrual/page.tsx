"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Period = "weekly" | "biweekly" | "semimonthly" | "monthly";

interface Balance {
  id: string;
  label: string;
  accrualRate: string; // hours per pay period
  period: Period;
  startDate: string;
  usedHours: string;
  maxCap: string;
}

const PERIOD_PER_YEAR: Record<Period, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

const PERIOD_LABEL: Record<Period, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  semimonthly: "Semi-monthly",
  monthly: "Monthly",
};

function periodsBetween(start: Date, end: Date, period: Period): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  const days = ms / (1000 * 60 * 60 * 24);
  switch (period) {
    case "weekly":
      return days / 7;
    case "biweekly":
      return days / 14;
    case "semimonthly":
      return days / 15.2184;
    case "monthly":
      return days / 30.4375;
  }
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearEndISO(): string {
  return `${new Date().getFullYear()}-12-31`;
}

function computeBalance(b: Balance, asOf: Date) {
  const rate = parseFloat(b.accrualRate) || 0;
  const cap = parseFloat(b.maxCap) || 0;
  const used = parseFloat(b.usedHours) || 0;
  const start = b.startDate ? new Date(b.startDate) : new Date();
  const perYear = PERIOD_PER_YEAR[b.period];

  const periodsToDate = Math.max(0, periodsBetween(start, asOf, b.period));
  const accruedRaw = periodsToDate * rate;
  const currentRaw = accruedRaw - used;
  const current = cap > 0 ? Math.min(currentRaw, cap) : currentRaw;

  const yearEnd = new Date(yearEndISO());
  const periodsToYE = Math.max(0, periodsBetween(start, yearEnd, b.period));
  const yeRaw = periodsToYE * rate - used;
  const yearEndBalance = cap > 0 ? Math.min(yeRaw, cap) : yeRaw;

  // Forfeit estimate: raw projected - capped projected
  const forfeit = cap > 0 ? Math.max(0, yeRaw - cap) : 0;

  // Date when cap is hit
  let capHitDate: Date | null = null;
  if (cap > 0 && rate > 0 && currentRaw < cap) {
    const hoursToCap = cap - currentRaw;
    const periodsToCap = hoursToCap / rate;
    const daysPerPeriod =
      b.period === "weekly" ? 7 : b.period === "biweekly" ? 14 : b.period === "semimonthly" ? 15.2184 : 30.4375;
    capHitDate = addDays(asOf, periodsToCap * daysPerPeriod);
  } else if (cap > 0 && currentRaw >= cap) {
    capHitDate = asOf;
  }

  return {
    current: Math.max(0, current),
    yearEndBalance: Math.max(0, yearEndBalance),
    annualAccrual: rate * perYear,
    forfeit,
    capHitDate,
    atCap: cap > 0 && currentRaw >= cap,
  };
}

// Country-default presets: annual vacation days (statutory minimums / common
// market defaults), converted to biweekly accrual hours at 8 hrs/day.
//   US: ~10–15 paid vacation days (no federal minimum; SHRM avg 11 after 1yr)
//   UK: 28 working days incl. bank holidays (statutory)
//   EU: 20–30 (EU Working Time Directive minimum 20; common DE/FR 25–30)
//   JP: 10 after 6 months → 20 max (Labor Standards Act)
//   UAE: 22 working days (UAE Labour Law 2022)
// Sources: SHRM 2024 paid leave benchmark, UK.gov holiday entitlement,
// EU Working Time Directive 2003/88/EC, Japan Labor Standards Act Art. 39,
// UAE Federal Decree-Law No. 33 of 2021 Art. 29.
interface CountryPreset {
  key: string;
  label: string;
  vacationDays: number;
  sickDays: number;
  biweeklyRate: number;
  note: string;
}

const COUNTRY_PRESETS: CountryPreset[] = [
  { key: "us", label: "United States (SHRM avg)", vacationDays: 11, sickDays: 8, biweeklyRate: 3.38, note: "No federal mandate; SHRM avg 11d after 1yr, 15d after 5yr." },
  { key: "us_generous", label: "US — tech / generous", vacationDays: 20, sickDays: 10, biweeklyRate: 6.15, note: "Common at mature tech employers; 20 vacation + 10 sick." },
  { key: "uk", label: "United Kingdom", vacationDays: 28, sickDays: 0, biweeklyRate: 8.62, note: "28 working days incl. bank holidays (UK statutory)." },
  { key: "eu_min", label: "EU (Working Time Directive min)", vacationDays: 20, sickDays: 0, biweeklyRate: 6.15, note: "EU Directive 2003/88/EC minimum 20 working days." },
  { key: "de", label: "Germany / France (typical)", vacationDays: 25, sickDays: 0, biweeklyRate: 7.69, note: "Collective agreements commonly 25–30 days." },
  { key: "jp", label: "Japan (Labor Standards Act)", vacationDays: 10, sickDays: 0, biweeklyRate: 3.08, note: "Accrual starts at 10 days after 6 months, caps at 20." },
  { key: "ae", label: "UAE (Federal Decree-Law 33)", vacationDays: 22, sickDays: 15, biweeklyRate: 6.77, note: "22 working days after 1 year of service." },
];

const defaultBalances: Balance[] = [
  {
    id: "pto",
    label: "PTO / Vacation",
    accrualRate: "6.15",
    period: "biweekly",
    startDate: `${new Date().getFullYear()}-01-01`,
    usedHours: "40",
    maxCap: "240",
  },
  {
    id: "sick",
    label: "Sick",
    accrualRate: "2",
    period: "monthly",
    startDate: `${new Date().getFullYear()}-01-01`,
    usedHours: "8",
    maxCap: "80",
  },
  {
    id: "personal",
    label: "Personal",
    accrualRate: "1",
    period: "monthly",
    startDate: `${new Date().getFullYear()}-01-01`,
    usedHours: "0",
    maxCap: "24",
  },
];

// Days per period (visual helper)
function daysPerPeriod(p: Period): number {
  return p === "weekly" ? 7 : p === "biweekly" ? 14 : p === "semimonthly" ? 15.2184 : 30.4375;
}

// Generate accrual event dates (visual: when each accrual lands)
function accrualDatesInMonth(b: Balance, year: number, month: number): Set<string> {
  const set = new Set<string>();
  const start = b.startDate ? new Date(b.startDate) : new Date(`${year}-01-01`);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const dpp = daysPerPeriod(b.period);
  if (dpp <= 0) return set;
  // Find first accrual >= monthStart
  const msMs = monthStart.getTime();
  const startMs = start.getTime();
  let n = 0;
  if (msMs > startMs) {
    n = Math.ceil((msMs - startMs) / (dpp * 86400000));
  }
  for (let i = n; i < n + 12; i++) {
    const t = startMs + i * dpp * 86400000;
    if (t > monthEnd.getTime()) break;
    if (t >= msMs) {
      const d = new Date(t);
      set.add(fmtDate(d));
    }
  }
  return set;
}

// Build a synthetic history of accrual + use events
interface HistoryEvent {
  date: Date;
  type: "accrual" | "use";
  hours: number;
  label: string;
}

function buildHistory(b: Balance, asOf: Date): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const rate = parseFloat(b.accrualRate) || 0;
  const used = parseFloat(b.usedHours) || 0;
  const start = b.startDate ? new Date(b.startDate) : new Date();
  const dpp = daysPerPeriod(b.period);
  if (dpp <= 0 || rate <= 0) return events;
  // Accruals up to as-of
  for (let i = 1; i <= 12; i++) {
    const t = start.getTime() + i * dpp * 86400000;
    if (t > asOf.getTime()) break;
    events.push({
      date: new Date(t),
      type: "accrual",
      hours: rate,
      label: `${PERIOD_LABEL[b.period]} accrual`,
    });
  }
  // Use events: split into 2 chunks if used > 0
  if (used > 0) {
    const halfUsed = used / 2;
    const span = asOf.getTime() - start.getTime();
    if (span > 0) {
      events.push({
        date: new Date(start.getTime() + span * 0.35),
        type: "use",
        hours: halfUsed,
        label: "Time off taken",
      });
      events.push({
        date: new Date(start.getTime() + span * 0.7),
        type: "use",
        hours: used - halfUsed,
        label: "Time off taken",
      });
    }
  }
  events.sort((a, b) => b.date.getTime() - a.date.getTime());
  return events.slice(0, 8);
}

// Projected balance line chart points (start to year-end)
function projectedSeries(b: Balance): { x: number; y: number; date: Date }[] {
  const rate = parseFloat(b.accrualRate) || 0;
  const cap = parseFloat(b.maxCap) || 0;
  const used = parseFloat(b.usedHours) || 0;
  const start = b.startDate ? new Date(b.startDate) : new Date();
  const yearEnd = new Date(yearEndISO());
  const total = yearEnd.getTime() - start.getTime();
  if (total <= 0) return [];
  const points: { x: number; y: number; date: Date }[] = [];
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i++) {
    const t = start.getTime() + (i / STEPS) * total;
    const d = new Date(t);
    const periods = Math.max(0, periodsBetween(start, d, b.period));
    const usedAtT = used * Math.min(1, i / STEPS); // distribute used linearly
    const raw = periods * rate - usedAtT;
    const capped = cap > 0 ? Math.min(raw, cap) : raw;
    points.push({ x: i / STEPS, y: Math.max(0, capped), date: d });
  }
  return points;
}

export default function PtoAccrualPage() {
  const [asOf, setAsOf] = useState(todayISO());
  const [balances, setBalances] = useState<Balance[]>(defaultBalances);
  const [activeId, setActiveId] = useState<string>("pto");

  const update = (id: string, patch: Partial<Balance>) => {
    setBalances((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const addBalance = () => {
    const id = `b_${Date.now()}`;
    const next: Balance = {
      id,
      label: "New balance",
      accrualRate: "4",
      period: "biweekly",
      startDate: `${new Date().getFullYear()}-01-01`,
      usedHours: "0",
      maxCap: "160",
    };
    setBalances((prev) => [...prev, next]);
    setActiveId(id);
  };

  const removeBalance = (id: string) => {
    setBalances((prev) => prev.filter((b) => b.id !== id));
    if (activeId === id && balances.length > 1) {
      const remaining = balances.find((b) => b.id !== id);
      if (remaining) setActiveId(remaining.id);
    }
  };

  const asOfDate = useMemo(() => new Date(asOf), [asOf]);

  function applyPreset(key: string) {
    const p = COUNTRY_PRESETS.find((x) => x.key === key);
    if (!p) return;
    const sick = p.sickDays > 0
      ? [{
          id: "sick",
          label: "Sick",
          accrualRate: ((p.sickDays * 8) / 26).toFixed(2),
          period: "biweekly" as Period,
          startDate: `${new Date().getFullYear()}-01-01`,
          usedHours: "0",
          maxCap: String(p.sickDays * 8 * 2),
        }]
      : [];
    setBalances([
      {
        id: "pto",
        label: "PTO / Vacation",
        accrualRate: p.biweeklyRate.toFixed(2),
        period: "biweekly",
        startDate: `${new Date().getFullYear()}-01-01`,
        usedHours: "0",
        maxCap: String(p.vacationDays * 8 * 1.5),
      },
      ...sick,
    ]);
    setActiveId("pto");
  }

  const active = balances.find((b) => b.id === activeId) || balances[0];
  const calc = active ? computeBalance(active, asOfDate) : null;

  // Days available (8 hrs = 1 day)
  const daysAvailable = calc ? calc.current / 8 : 0;
  const daysProjectedYE = calc ? calc.yearEndBalance / 8 : 0;
  const daysAnnual = calc ? calc.annualAccrual / 8 : 0;

  // Calendar setup
  const calMonth = useMemo(() => asOfDate.getMonth(), [asOfDate]);
  const calYear = useMemo(() => asOfDate.getFullYear(), [asOfDate]);
  const accrualDays = useMemo(
    () => (active ? accrualDatesInMonth(active, calYear, calMonth) : new Set<string>()),
    [active, calYear, calMonth]
  );
  const calCells = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
    const offset = first.getDay();
    const cells: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < offset; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
    return cells;
  }, [calYear, calMonth]);

  const history = useMemo(
    () => (active ? buildHistory(active, asOfDate) : []),
    [active, asOfDate]
  );

  const series = useMemo(
    () => (active ? projectedSeries(active) : []),
    [active]
  );

  // Build SVG line chart geometry
  const CHART_W = 720;
  const CHART_H = 200;
  const CHART_PAD_L = 40;
  const CHART_PAD_R = 16;
  const CHART_PAD_T = 16;
  const CHART_PAD_B = 28;
  const innerW = CHART_W - CHART_PAD_L - CHART_PAD_R;
  const innerH = CHART_H - CHART_PAD_T - CHART_PAD_B;
  const yMax = useMemo(() => {
    const cap = active ? parseFloat(active.maxCap) || 0 : 0;
    const peak = series.reduce((m, p) => Math.max(m, p.y), 0);
    return Math.max(8, cap > 0 ? Math.max(cap, peak) : peak);
  }, [active, series]);
  const xFor = (x: number) => CHART_PAD_L + x * innerW;
  const yFor = (y: number) => CHART_PAD_T + (1 - y / yMax) * innerH;
  const pathD = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.x).toFixed(1)},${yFor(p.y).toFixed(1)}`)
    .join(" ");
  const areaD = series.length
    ? `${pathD} L${xFor(series[series.length - 1].x).toFixed(1)},${yFor(0).toFixed(1)} L${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} Z`
    : "";
  const cap = active ? parseFloat(active.maxCap) || 0 : 0;
  const capY = cap > 0 ? yFor(Math.min(cap, yMax)) : null;

  // Today marker on chart
  const todayX = useMemo(() => {
    if (!active || !series.length) return null;
    const start = new Date(active.startDate);
    const yearEnd = new Date(yearEndISO());
    const total = yearEnd.getTime() - start.getTime();
    if (total <= 0) return null;
    const f = Math.max(0, Math.min(1, (asOfDate.getTime() - start.getTime()) / total));
    return f;
  }, [active, asOfDate, series]);

  const monthName = new Date(calYear, calMonth, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const fmtHrs = (n: number) => `${n.toFixed(1)}h`;
  const fmtDays = (n: number) => n.toFixed(1);

  return (
    <ToolShell
      category="HR & People"
      title="PTO Accrual Tracker"
      description="Track PTO, sick, and personal leave balances. Project year-end totals and forfeiture risk."
    >
      <div data-tool-theme="hr" data-tool="pto-accrual" className="space-y-5">
        {/* Balance hero — big days-available number with accrual rate chip */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface shadow-[0_8px_40px_-18px_var(--tool-accent)] backdrop-blur-xl">
          {/* Sub-tabs as state buttons */}
          <div className="flex flex-wrap gap-1.5 border-b border-tool-accent-soft bg-tool-accent-soft px-4 py-2.5">
            {balances.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveId(b.id)}
                className={
                  "rounded-full px-3 py-1 text-[0.7rem] font-medium transition " +
                  (b.id === activeId
                    ? "bg-tool-accent text-white shadow-md"
                    : "border border-tool-accent-soft bg-white/70 text-zinc-700 hover:bg-white")
                }
              >
                {b.label}
              </button>
            ))}
            <button
              type="button"
              onClick={addBalance}
              className="rounded-full border border-dashed border-tool-accent bg-white/60 px-3 py-1 text-[0.7rem] font-medium text-tool-accent hover:bg-tool-accent-soft"
            >
              + Add
            </button>
          </div>

          {/* Hero — big days available number + accrual rate chip */}
          {active && calc && (
            <div className="tool-hero relative border-b border-tool-accent-soft px-6 py-7 sm:px-10 sm:py-9">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,var(--tool-accent-soft),transparent_55%)] pointer-events-none" />
              <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] lg:items-end">
                <div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-tool-accent">
                    Days available
                  </div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-mono text-6xl font-bold tabular-nums text-zinc-900 drop-shadow-sm sm:text-7xl">
                      {fmtDays(daysAvailable)}
                    </span>
                    <span className="text-lg font-medium text-zinc-500">days</span>
                  </div>
                  <div className="mt-1 font-mono text-xs tabular-nums text-zinc-500">
                    = {fmtHrs(calc.current)} · as of {asOf}
                  </div>
                </div>
                <div className="flex flex-wrap items-end justify-end gap-2">
                  <Chip icon="rate">
                    {active.accrualRate}h / {PERIOD_LABEL[active.period].toLowerCase()}
                  </Chip>
                  <Chip icon="annual">{daysAnnual.toFixed(1)} d/yr accrual</Chip>
                  <Chip icon="ye">YE: {fmtDays(daysProjectedYE)} d</Chip>
                  {calc.atCap && <Chip icon="cap" tone="warn">At cap</Chip>}
                  {calc.forfeit > 0 && (
                    <Chip icon="forfeit" tone="warn">
                      Forfeit {fmtHrs(calc.forfeit)}
                    </Chip>
                  )}
                </div>
              </div>

              {/* progress bar: current vs cap */}
              {parseFloat(active.maxCap) > 0 && (
                <div className="relative mt-6">
                  <div className="mb-1.5 flex items-baseline justify-between font-mono text-[0.65rem] tabular-nums text-zinc-500">
                    <span>0h</span>
                    <span className="text-tool-accent">cap {active.maxCap}h</span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-white/50 ring-1 ring-inset ring-tool-accent/20">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--tool-accent-soft)] to-tool-accent transition-all"
                      style={{
                        width: `${Math.min(100, (calc.current / (parseFloat(active.maxCap) || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inputs row */}
          {active && (
            <div className="bg-white/40 px-5 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <QueryField label="As-of date">
                  <input
                    type="date"
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                    className={fieldCls}
                  />
                </QueryField>
                <QueryField label="Country preset">
                  <select
                    onChange={(e) => {
                      if (e.target.value) applyPreset(e.target.value);
                      e.target.value = "";
                    }}
                    className={fieldCls}
                    defaultValue=""
                  >
                    <option value="">Apply a preset…</option>
                    {COUNTRY_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label} — {p.vacationDays} days
                      </option>
                    ))}
                  </select>
                </QueryField>
                <QueryField label="Label">
                  <input
                    value={active.label}
                    onChange={(e) => update(active.id, { label: e.target.value })}
                    className={fieldCls}
                  />
                </QueryField>
                <QueryField label="Pay period">
                  <select
                    value={active.period}
                    onChange={(e) => update(active.id, { period: e.target.value as Period })}
                    className={fieldCls}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="semimonthly">Semi-monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </QueryField>
                <QueryField label="Accrual rate (hrs/period)">
                  <input
                    type="number"
                    value={active.accrualRate}
                    onChange={(e) => update(active.id, { accrualRate: e.target.value })}
                    className={fieldCls}
                    min="0"
                    step="0.01"
                  />
                </QueryField>
                <QueryField label="Start date">
                  <input
                    type="date"
                    value={active.startDate}
                    onChange={(e) => update(active.id, { startDate: e.target.value })}
                    className={fieldCls}
                  />
                </QueryField>
                <QueryField label="Hours used YTD">
                  <input
                    type="number"
                    value={active.usedHours}
                    onChange={(e) => update(active.id, { usedHours: e.target.value })}
                    className={fieldCls}
                    min="0"
                    step="0.5"
                  />
                </QueryField>
                <QueryField label="Max cap (hrs)">
                  <input
                    type="number"
                    value={active.maxCap}
                    onChange={(e) => update(active.id, { maxCap: e.target.value })}
                    className={fieldCls}
                    min="0"
                    step="1"
                  />
                </QueryField>
              </div>

              {/* Stat cards */}
              {calc && (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label="Current" sub="hours" value={fmtHrs(calc.current)} emphasized />
                  <KpiCard label="Year-end" sub="projected" value={fmtHrs(calc.yearEndBalance)} />
                  <KpiCard label="Annual" sub="accrual rate" value={fmtHrs(calc.annualAccrual)} />
                  <KpiCard
                    label="Cap hit"
                    sub="ETA"
                    value={calc.capHitDate ? fmtDate(calc.capHitDate) : "—"}
                  />
                </div>
              )}

              {calc && calc.forfeit > 0 && (
                <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                  Forfeit warning: at current usage, {calc.forfeit.toFixed(1)} hrs will be lost
                  to the cap by year-end. {calc.atCap && "You are already at cap."}
                </div>
              )}

              {balances.length > 1 && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeBalance(active.id)}
                    className="text-[0.7rem] uppercase tracking-[0.15em] text-zinc-400 hover:text-rose-500"
                  >
                    Remove this balance
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Calendar grid + History list */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Calendar */}
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Calendar
                </div>
                <h3 className="text-sm font-semibold text-zinc-800">
                  Accrual days · {monthName}
                </h3>
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-zinc-500">
                {accrualDays.size} accrual{accrualDays.size === 1 ? "" : "s"}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="mb-2 grid grid-cols-7 gap-1 text-center font-mono text-[0.6rem] uppercase tracking-[0.15em] text-zinc-400">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div key={i}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calCells.map((c, i) => {
                  if (c.day === null) {
                    return <div key={i} className="aspect-square" />;
                  }
                  const isAccrual = c.iso ? accrualDays.has(c.iso) : false;
                  const isToday = c.iso === asOf;
                  return (
                    <div
                      key={i}
                      className={
                        "relative flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition " +
                        (isAccrual
                          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent"
                          : "bg-white/60 text-zinc-600 ring-1 ring-tool-accent-soft") +
                        (isToday ? " outline outline-2 outline-tool-accent" : "")
                      }
                    >
                      <span className="font-mono tabular-nums">{c.day}</span>
                      {isAccrual && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2">
                          <span className="block h-1 w-1 rounded-full bg-tool-accent" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.65rem] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded bg-tool-accent-soft ring-1 ring-tool-accent" />
                  Accrual lands
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded outline outline-2 outline-tool-accent" />
                  As-of date
                </span>
                {active && (
                  <span className="ml-auto font-mono tabular-nums">
                    +{active.accrualRate}h × {accrualDays.size}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* History list */}
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Activity
                </div>
                <h3 className="text-sm font-semibold text-zinc-800">
                  Recent accrual / use
                </h3>
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-zinc-500">
                {history.length} events
              </div>
            </div>
            {history.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-zinc-500">
                No events yet — set start date and accrual rate.
              </div>
            ) : (
              <div className="divide-y divide-tool-accent-soft">
                {history.map((e, i) => {
                  const isAccrual = e.type === "accrual";
                  return (
                    <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                      <div
                        className={
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                          (isAccrual
                            ? "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30"
                            : "bg-rose-500/15 text-rose-600 ring-1 ring-rose-500/30")
                        }
                      >
                        {isAccrual ? "+" : "−"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-800">
                          {e.label}
                        </div>
                        <div className="font-mono text-[0.65rem] tabular-nums text-zinc-500">
                          {fmtDate(e.date)}
                        </div>
                      </div>
                      <div
                        className={
                          "font-mono text-sm font-semibold tabular-nums " +
                          (isAccrual
                            ? "text-emerald-600"
                            : "text-rose-600")
                        }
                      >
                        {isAccrual ? "+" : "−"}
                        {e.hours.toFixed(1)}h
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Projected balance line chart */}
        {active && series.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Projection
                </div>
                <h3 className="text-sm font-semibold text-zinc-800">
                  Projected balance through year-end
                </h3>
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-zinc-500">
                start → {yearEndISO()}
              </div>
            </div>
            <div className="px-3 py-4 sm:px-5">
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="h-auto w-full"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="ptoArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* y-axis grid */}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <g key={f}>
                    <line
                      x1={CHART_PAD_L}
                      x2={CHART_W - CHART_PAD_R}
                      y1={CHART_PAD_T + (1 - f) * innerH}
                      y2={CHART_PAD_T + (1 - f) * innerH}
                      stroke="var(--tool-accent)"
                      strokeOpacity="0.15"
                      strokeWidth="1"
                    />
                    <text
                      x={CHART_PAD_L - 6}
                      y={CHART_PAD_T + (1 - f) * innerH + 4}
                      textAnchor="end"
                      className="fill-zinc-500"
                      style={{ fontSize: "10px", fontFamily: "ui-monospace, monospace" }}
                    >
                      {(yMax * f).toFixed(0)}h
                    </text>
                  </g>
                ))}

                {/* cap line */}
                {capY !== null && (
                  <g>
                    <line
                      x1={CHART_PAD_L}
                      x2={CHART_W - CHART_PAD_R}
                      y1={capY}
                      y2={capY}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth="1.2"
                    />
                    <text
                      x={CHART_W - CHART_PAD_R - 4}
                      y={capY - 4}
                      textAnchor="end"
                      className="fill-amber-500"
                      style={{ fontSize: "10px", fontFamily: "ui-monospace, monospace" }}
                    >
                      cap {cap}h
                    </text>
                  </g>
                )}

                {/* area + line */}
                {areaD && <path d={areaD} fill="url(#ptoArea)" />}
                <path
                  d={pathD}
                  fill="none"
                  stroke="var(--tool-accent)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* today marker */}
                {todayX !== null && (
                  <g>
                    <line
                      x1={xFor(todayX)}
                      x2={xFor(todayX)}
                      y1={CHART_PAD_T}
                      y2={CHART_H - CHART_PAD_B}
                      stroke="var(--tool-accent)"
                      strokeOpacity="0.45"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <circle
                      cx={xFor(todayX)}
                      cy={yFor(calc?.current || 0)}
                      r="5"
                      fill="var(--tool-accent)"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <text
                      x={xFor(todayX) + 8}
                      y={yFor(calc?.current || 0) - 8}
                      className="fill-tool-accent"
                      style={{ fontSize: "10px", fontFamily: "ui-monospace, monospace", fontWeight: 600 }}
                    >
                      now · {(calc?.current || 0).toFixed(1)}h
                    </text>
                  </g>
                )}

                {/* x-axis labels */}
                <text
                  x={CHART_PAD_L}
                  y={CHART_H - 8}
                  className="fill-zinc-500"
                  style={{ fontSize: "10px", fontFamily: "ui-monospace, monospace" }}
                >
                  {active.startDate}
                </text>
                <text
                  x={CHART_W - CHART_PAD_R}
                  y={CHART_H - 8}
                  textAnchor="end"
                  className="fill-zinc-500"
                  style={{ fontSize: "10px", fontFamily: "ui-monospace, monospace" }}
                >
                  {yearEndISO()}
                </text>
              </svg>

              <div className="mt-3 flex flex-wrap gap-3 text-[0.65rem] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-tool-accent" />
                  Projected balance
                </span>
                {capY !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-500" />
                    Cap
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-tool-accent ring-2 ring-white" />
                  As-of
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="rounded-2xl border border-tool-accent-soft bg-tool-surface p-5 text-xs text-zinc-600">
          <div className="mb-2 text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            Methodology
          </div>
          <p>
            Sources: SHRM 2024 paid leave benchmark; UK.gov holiday entitlement; EU Working Time Directive 2003/88/EC; Japan Labor Standards Act Art. 39; UAE Federal Decree-Law No. 33 of 2021 Art. 29. Days assume 8-hour workdays.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}

/* Sub-components */

const fieldCls =
  "w-full rounded-lg border border-tool-accent-soft bg-white/80 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-tool-accent focus:ring-2 focus:ring-tool-accent";

function QueryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Chip({
  children,
  icon,
  tone = "default",
}: {
  children: React.ReactNode;
  icon?: string;
  tone?: "default" | "warn";
}) {
  const glyph =
    icon === "rate"
      ? "⏱"
      : icon === "annual"
      ? "∑"
      : icon === "ye"
      ? "▣"
      : icon === "cap"
      ? "⚑"
      : icon === "forfeit"
      ? "!"
      : "·";
  const cls =
    tone === "warn"
      ? "border-amber-400/50 bg-amber-500/10 text-amber-700"
      : "border-tool-accent-soft bg-white/70 text-zinc-700";
  const glyphCls = tone === "warn" ? "text-amber-500" : "text-tool-accent";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium backdrop-blur " +
        cls
      }
    >
      <span className={glyphCls}>{glyph}</span>
      {children}
    </span>
  );
}

function KpiCard({
  label,
  sub,
  value,
  emphasized = false,
}: {
  label: string;
  sub: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 transition " +
        (emphasized
          ? "border-tool-accent bg-tool-accent-soft ring-tool-accent"
          : "border-tool-accent-soft bg-tool-surface")
      }
    >
      <div className="flex items-baseline justify-between">
        <span
          className={
            "text-[0.6rem] font-bold uppercase tracking-[0.2em] " +
            (emphasized ? "text-tool-accent" : "text-zinc-500")
          }
        >
          {label}
        </span>
        <span className="text-[0.6rem] text-zinc-400">{sub}</span>
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-xl font-bold text-tool-accent"
            : "text-lg font-semibold text-zinc-800")
        }
      >
        {value}
      </div>
    </div>
  );
}
