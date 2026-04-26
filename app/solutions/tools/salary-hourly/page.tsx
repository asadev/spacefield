"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// BLS OEWS May 2024 national median wages (annual, USD) by broad
// occupation group. Shown as reference bands to calibrate user input.
const BLS_MEDIANS: { role: string; annual: number }[] = [
  { role: "All occupations", annual: 48060 },
  { role: "Management", annual: 115250 },
  { role: "Software devs", annual: 130160 },
  { role: "Financial analysts", annual: 99890 },
  { role: "Registered nurses", annual: 86070 },
  { role: "Marketing managers", annual: 157620 },
  { role: "Sales managers", annual: 138060 },
  { role: "Teachers (K-12)", annual: 63930 },
  { role: "Retail salespersons", annual: 33900 },
  { role: "Food service", annual: 31500 },
];

type Mode = "annual" | "monthly" | "hourly";
type Direction = "salary-to-hourly" | "hourly-to-salary";

interface Inputs {
  mode: Mode;
  value: string;
  hoursPerWeek: string;
  weeksOff: string;
  overtimeHours: string; // per week
  overtimeMultiplier: string; // 1.5 default
  taxPct: string; // rough blended
}

const DEFAULTS: Inputs = {
  mode: "annual",
  value: "75000",
  hoursPerWeek: "40",
  weeksOff: "4",
  overtimeHours: "0",
  overtimeMultiplier: "1.5",
  taxPct: "22",
};

export default function SalaryHourlyPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setInputs({ ...DEFAULTS, ...shared });
  }, []);

  const direction: Direction =
    inputs.mode === "hourly" ? "hourly-to-salary" : "salary-to-hourly";

  const result = useMemo(() => {
    const v = parseFloat(inputs.value) || 0;
    const hpw = parseFloat(inputs.hoursPerWeek) || 0;
    const off = parseFloat(inputs.weeksOff) || 0;
    const otH = parseFloat(inputs.overtimeHours) || 0;
    const otM = parseFloat(inputs.overtimeMultiplier) || 1.5;
    const tax = (parseFloat(inputs.taxPct) || 0) / 100;
    const weeksWorked = Math.max(0, 52 - off);
    const annualHours = weeksWorked * hpw;

    let ann: number;
    if (inputs.mode === "annual") ann = v;
    else if (inputs.mode === "monthly") ann = v * 12;
    else ann = v * annualHours;

    const hourly = annualHours > 0 ? ann / annualHours : 0;
    const otPayPerWeek = otH * hourly * otM;
    const otAnnual = otPayPerWeek * weeksWorked;
    const withOt = ann + otAnnual;
    const netAnnual = withOt * (1 - tax);
    const daily = withOt / (weeksWorked * 5 || 1);

    return {
      annual: ann,
      withOt,
      netAnnual,
      monthly: withOt / 12,
      weekly: withOt / 52,
      daily,
      hourly,
      effectiveWeeks: weeksWorked,
      annualHours,
      otAnnual,
    };
  }, [inputs]);

  const fmt = (n: number, digits = 0) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: digits,
    });

  const setDirection = (d: Direction) =>
    setInputs((s) => {
      if (d === "hourly-to-salary") {
        return { ...s, mode: "hourly", value: result.hourly.toFixed(2) };
      }
      // default salary-to-hourly: prefer annual mode
      if (s.mode === "hourly") {
        return { ...s, mode: "annual", value: Math.round(result.withOt).toString() };
      }
      return s;
    });

  // hero displays the "result" side of the conversion
  const heroValue =
    direction === "salary-to-hourly" ? result.hourly : result.withOt;
  const heroUnit = direction === "salary-to-hourly" ? "/ hour" : "/ year";
  const heroDigits = direction === "salary-to-hourly" ? 2 : 0;
  const heroLabel =
    direction === "salary-to-hourly" ? "Hourly equivalent" : "Annual equivalent";

  return (
    <div data-tool-theme="finance" data-tool="salary-hourly">
      <ToolShell
        category="Finance"
        title="Salary to Hourly Converter"
        description="Annual, monthly, hourly equivalents. Handles PTO, overtime at 1.5x, and rough take-home. BLS reference wages for calibration."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — direction + hours chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {direction === "salary-to-hourly" ? "salary → hourly" : "hourly → salary"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {inputs.hoursPerWeek || 0}h / wk
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {result.effectiveWeeks}w / yr
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              salary.convert
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {result.annualHours.toLocaleString()}h.run
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">USD</div>
          </div>

          <div className="relative p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  {heroLabel}
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-app md:text-5xl">
                    {fmt(heroValue, heroDigits)}
                  </span>
                  <span className="rounded-md bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                    {heroUnit}
                  </span>
                </div>

                <div className="mt-2 font-mono text-[0.7rem] text-muted">
                  gross · {result.annualHours.toLocaleString()} hrs / yr
                  {result.otAnnual > 0
                    ? ` · OT +${fmt(result.otAnnual)}`
                    : ""}
                </div>
              </div>

              {/* after-tax tile */}
              <div className="rounded-xl border border-app bg-app px-3 py-2">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  After-tax · ~{inputs.taxPct || 0}%
                </div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-app">
                  {fmt(result.netAnnual)}
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  net / yr
                </div>
              </div>
            </div>
          </div>

          {/* segmented direction pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "salary-to-hourly", label: "Salary → Hourly" },
                  { k: "hourly-to-salary", label: "Hourly → Salary" },
                ] as { k: Direction; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setDirection(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    direction === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {result.effectiveWeeks} working weeks · {result.annualHours.toLocaleString()} hrs
            </span>
          </div>
        </section>

        {/* =========== EQUIVALENT BREAKDOWN =========== */}
        <ToolCard
          title="Equivalent breakdown"
          subtitle="Same pay, different cadences"
          className="mb-6"
        >
          <div className="overflow-hidden rounded-lg border border-app">
            {(
              [
                { label: "Annual (gross)", value: result.withOt, digits: 0, accent: true },
                { label: "Monthly", value: result.monthly, digits: 0 },
                { label: "Weekly", value: result.weekly, digits: 0 },
                { label: "Daily", value: result.daily, digits: 0 },
                { label: "Hourly", value: result.hourly, digits: 2 },
                { label: `After-tax annual (~${inputs.taxPct || 0}%)`, value: result.netAnnual, digits: 0 },
              ] as { label: string; value: number; digits: number; accent?: boolean }[]
            ).map((row, i, arr) => (
              <div
                key={row.label}
                className={`flex items-baseline justify-between gap-3 bg-app-elevated px-4 py-2.5 ${
                  i < arr.length - 1 ? "border-b border-app" : ""
                }`}
              >
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {row.label}
                </span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    row.accent ? "text-tool-accent" : "text-app"
                  }`}
                >
                  {fmt(row.value, row.digits)}
                </span>
              </div>
            ))}
          </div>

          {result.otAnnual > 0 && (
            <p className="mt-3 font-mono text-[0.65rem] text-tool-accent">
              Overtime adds {fmt(result.otAnnual)} / year at{" "}
              {inputs.overtimeMultiplier}x base.
            </p>
          )}
        </ToolCard>

        {/* =========== INPUTS =========== */}
        <ToolCard
          title="Assumptions"
          subtitle="Hours, time off, overtime, tax"
          className="mb-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Editing">
              <select
                value={inputs.mode}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, mode: e.target.value as Mode }))
                }
                className={inputCls()}
              >
                <option value="annual">Annual salary</option>
                <option value="monthly">Monthly salary</option>
                <option value="hourly">Hourly rate</option>
              </select>
            </Field>
            <Field
              label={
                inputs.mode === "hourly"
                  ? "Hourly rate ($)"
                  : inputs.mode === "monthly"
                  ? "Monthly pay ($)"
                  : "Annual salary ($)"
              }
            >
              <input
                type="number"
                value={inputs.value}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, value: e.target.value }))
                }
                className={inputCls()}
                min="0"
                step="100"
              />
            </Field>
            <Field label="Hours per week">
              <input
                type="number"
                value={inputs.hoursPerWeek}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, hoursPerWeek: e.target.value }))
                }
                className={inputCls()}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="Weeks off / yr" hint="Vacation + holidays">
              <input
                type="number"
                value={inputs.weeksOff}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, weeksOff: e.target.value }))
                }
                className={inputCls()}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="OT hours / wk">
              <input
                type="number"
                value={inputs.overtimeHours}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, overtimeHours: e.target.value }))
                }
                className={inputCls()}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="OT multiplier">
              <input
                type="number"
                value={inputs.overtimeMultiplier}
                onChange={(e) =>
                  setInputs((s) => ({
                    ...s,
                    overtimeMultiplier: e.target.value,
                  }))
                }
                className={inputCls()}
                min="1"
                step="0.1"
              />
            </Field>
            <Field label="Blended tax %" hint="Rough take-home">
              <input
                type="number"
                value={inputs.taxPct}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, taxPct: e.target.value }))
                }
                className={inputCls()}
                min="0"
                step="0.5"
              />
            </Field>
          </div>
        </ToolCard>

        {/* =========== BLS REFERENCE =========== */}
        <ToolCard
          title="BLS median wages"
          subtitle="May 2024 OEWS · vs your annual"
          className="mb-6"
        >
          <ul className="overflow-hidden rounded-lg border border-app">
            {BLS_MEDIANS.map((b, i) => {
              const diff = result.withOt - b.annual;
              const sign = diff >= 0 ? "+" : "−";
              return (
                <li
                  key={b.role}
                  className={`flex items-baseline justify-between gap-3 bg-app-elevated px-4 py-2 text-xs ${
                    i < BLS_MEDIANS.length - 1 ? "border-b border-app" : ""
                  }`}
                >
                  <span className="text-secondary">{b.role}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono tabular-nums text-app">
                      {fmt(b.annual)}
                    </span>
                    <span
                      className={`min-w-[5.5rem] text-right font-mono text-[0.65rem] tabular-nums ${
                        diff >= 0 ? "text-tool-accent" : "text-rose-500"
                      }`}
                    >
                      {sign}
                      {fmt(Math.abs(diff))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 font-mono text-[0.6rem] text-faint">
            US BLS Occupational Employment and Wage Statistics, May 2024.
            National medians for the broad occupation group.
          </p>
        </ToolCard>

        <ScenarioBar<Inputs>
          slug="salary-hourly"
          state={inputs}
          onLoad={(d) => setInputs({ ...DEFAULTS, ...d })}
          exports={{
            csv: () =>
              toCsv([
                ["Cadence", "Amount"],
                ["Annual", result.withOt.toFixed(0)],
                ["Monthly", result.monthly.toFixed(0)],
                ["Weekly", result.weekly.toFixed(0)],
                ["Daily", result.daily.toFixed(0)],
                ["Hourly", result.hourly.toFixed(2)],
                ["After-tax annual", result.netAnnual.toFixed(0)],
              ]),
            json: () => ({ inputs, result }),
            markdown: () =>
              `# Salary equivalents\n\n- Annual (gross): ${fmt(result.withOt)}\n- Monthly: ${fmt(result.monthly)}\n- Weekly: ${fmt(result.weekly)}\n- Hourly: ${fmt(result.hourly, 2)}\n- After-tax annual (~${inputs.taxPct}%): ${fmt(result.netAnnual)}\n`,
          }}
        />
      </ToolShell>
    </div>
  );
}
