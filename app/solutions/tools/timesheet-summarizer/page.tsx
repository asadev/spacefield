"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  project: string;
  hours: string;
  notes: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const SAMPLE: Entry[] = [
  { id: uid(), date: todayOffset(-6), project: "Acme redesign", hours: "6", notes: "Homepage" },
  { id: uid(), date: todayOffset(-5), project: "Acme redesign", hours: "8", notes: "Hero section" },
  { id: uid(), date: todayOffset(-4), project: "Internal", hours: "2", notes: "Standup + review" },
  { id: uid(), date: todayOffset(-4), project: "Acme redesign", hours: "6", notes: "Nav" },
  { id: uid(), date: todayOffset(-3), project: "Beta discovery", hours: "4", notes: "Stakeholder" },
  { id: uid(), date: todayOffset(-3), project: "Acme redesign", hours: "5", notes: "Forms" },
  { id: uid(), date: todayOffset(-2), project: "Beta discovery", hours: "7", notes: "Mapping" },
  { id: uid(), date: todayOffset(-1), project: "Beta discovery", hours: "9", notes: "Deck" },
];

function todayOffset(delta: number) {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Day-of-week index (Mon=0..Sun=6) for a YYYY-MM-DD string. UTC-safe.
function dowIndex(date: string): number {
  const d = new Date(date + "T00:00:00Z");
  if (isNaN(d.getTime())) return -1;
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // Mon=0..Sun=6
}

type View = "grid" | "entries" | "invoice";

export default function TimesheetSummarizerPage() {
  const [entries, setEntries] = useState<Entry[]>(SAMPLE);
  const [csv, setCsv] = useState("");
  const [capacity, setCapacity] = useState("40");
  const [error, setError] = useState("");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [client, setClient] = useState("Client");
  const [contractor, setContractor] = useState("Your Co");
  const [invoiceNum, setInvoiceNum] = useState(`INV-${new Date().getFullYear()}-001`);
  const [view, setView] = useState<View>("grid");

  const update = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));
  const add = () =>
    setEntries((prev) => [
      ...prev,
      { id: uid(), date: todayOffset(0), project: "", hours: "", notes: "" },
    ]);

  const importCsv = () => {
    setError("");
    try {
      const lines = csv
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;
      // detect header
      const first = lines[0].toLowerCase();
      const start = first.includes("date") && first.includes("hour") ? 1 : 0;
      const out: Entry[] = [];
      for (let i = start; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        if (cells.length < 3) continue;
        out.push({
          id: uid(),
          date: cells[0],
          project: cells[1],
          hours: cells[2],
          notes: cells[3] || "",
        });
      }
      if (out.length === 0) {
        setError("No rows parsed. Expected: date,project,hours,notes");
        return;
      }
      setEntries(out);
      setCsv("");
    } catch (e) {
      setError("Failed to parse CSV.");
    }
  };

  const totals = useMemo(() => {
    const byProject: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    const byWeek: Record<string, number> = {};
    let total = 0;
    entries.forEach((e) => {
      const h = parseFloat(e.hours) || 0;
      total += h;
      if (e.project) byProject[e.project] = (byProject[e.project] || 0) + h;
      if (e.date) {
        byDay[e.date] = (byDay[e.date] || 0) + h;
        const wk = weekKey(e.date);
        if (wk) byWeek[wk] = (byWeek[wk] || 0) + h;
      }
    });
    const cap = parseFloat(capacity) || 0;
    const weekCount = Object.keys(byWeek).length;
    const expected = cap * weekCount;
    const utilization = expected > 0 ? (total / expected) * 100 : 0;
    const overtimeWeeks = Object.entries(byWeek).filter(([, h]) => h > 40);
    return { total, byProject, byDay, byWeek, utilization, weekCount, overtimeWeeks };
  }, [entries, capacity]);

  // Visual-only derivation: project x day-of-week grid. Pure UI, does not
  // alter the math in `totals` above.
  const grid = useMemo(() => {
    const projects = Object.keys(totals.byProject);
    // matrix[p][d] = hours
    const matrix: Record<string, number[]> = {};
    for (const p of projects) matrix[p] = [0, 0, 0, 0, 0, 0, 0];
    let cellMax = 0;
    for (const e of entries) {
      if (!e.project) continue;
      const di = dowIndex(e.date);
      if (di < 0) continue;
      const h = parseFloat(e.hours) || 0;
      matrix[e.project][di] += h;
      if (matrix[e.project][di] > cellMax) cellMax = matrix[e.project][di];
    }
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const p of projects) {
      for (let d = 0; d < 7; d++) dayTotals[d] += matrix[p][d];
    }
    const cap = parseFloat(capacity) || 0;
    const weeks = Math.max(1, totals.weekCount);
    return { projects, matrix, cellMax: Math.max(1, cellMax), dayTotals, cap, weeks };
  }, [entries, totals.byProject, totals.weekCount, capacity]);

  const exportInvoice = () => {
    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    lines.push(`INVOICE ${invoiceNum}`);
    lines.push(`From:  ${contractor}`);
    lines.push(`To:    ${client}`);
    lines.push(`Date:  ${today}`);
    lines.push("");
    lines.push("LINE ITEMS");
    lines.push("================================");
    let grandTotal = 0;
    Object.entries(totals.byProject)
      .sort((a, b) => b[1] - a[1])
      .forEach(([project, hours]) => {
        const rate = parseFloat(rates[project] || "0") || 0;
        const amount = rate * hours;
        grandTotal += amount;
        lines.push(
          `${project.padEnd(32)} ${hours.toFixed(2).padStart(8)}h  @ $${rate.toFixed(2).padStart(7)}/hr  =  $${amount.toFixed(2).padStart(10)}`
        );
      });
    lines.push("================================");
    lines.push(`TOTAL DUE: $${grandTotal.toFixed(2)}`);
    lines.push("");
    lines.push("Payment terms: Net 30 from invoice date.");
    lines.push("Thank you for your business.");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoiceNum}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSummary = () => {
    const lines: string[] = ["Timesheet Summary", ""];
    lines.push(`Total hours: ${totals.total.toFixed(1)}`);
    lines.push(`Weeks covered: ${totals.weekCount}`);
    lines.push(`Utilization: ${totals.utilization.toFixed(1)}% of ${capacity}h/wk capacity`);
    lines.push("", "By project:");
    Object.entries(totals.byProject)
      .sort((a, b) => b[1] - a[1])
      .forEach(([p, h]) => lines.push(`  - ${p}: ${h.toFixed(1)}h`));
    lines.push("", "By week:");
    Object.entries(totals.byWeek)
      .sort()
      .forEach(([w, h]) =>
        lines.push(`  - ${w}: ${h.toFixed(1)}h ${h > 40 ? "(overtime)" : ""}`)
      );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timesheet-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Per-row OT threshold + over/under target classification (UI only).
  const cap = parseFloat(capacity) || 0;
  const projectCount = grid.projects.length || 1;
  const targetPerProject = (cap * grid.weeks) / projectCount; // visual benchmark

  return (
    <ToolShell
      category="Productivity"
      title="Timesheet Summarizer"
      description="Paste a CSV or edit the table directly. Get totals by project, day, and week, plus utilization and overtime flags. All local."
    >
      <div data-tool-theme="hr" data-tool="timesheet-summarizer" className="space-y-5">
        {/* Workspace window */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface shadow-[0_8px_40px_-18px_var(--tool-accent)] backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-tool-accent-soft bg-tool-accent-soft px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-400/80 ring-1 ring-rose-500/30" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80 ring-1 ring-amber-500/30" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80 ring-1 ring-emerald-500/30" />
            </div>
            <div className="flex-1 text-center text-[0.7rem] font-medium tracking-wide text-muted">
              Timesheet Summarizer — Weekly Workload Grid
            </div>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
              v2026.Q2
            </div>
          </div>

          {/* Hero header — uses tool-hero foundation utility */}
          <div className="tool-hero relative border-b border-tool-accent-soft px-5 py-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,var(--tool-accent-soft),transparent_55%)] pointer-events-none" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Week-over-week
                </div>
                <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-app">
                  Hours by project · day grid
                </h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip icon="hours">{totals.total.toFixed(1)}h total</Chip>
                <Chip icon="util">{totals.utilization.toFixed(0)}% util</Chip>
                <Chip icon="ot">
                  {totals.overtimeWeeks.length} OT wk
                </Chip>
                <Chip icon="weeks">{totals.weekCount} wk span</Chip>
              </div>
            </div>

            {/* Sub-tabs as state buttons */}
            <div className="relative mt-4 inline-flex items-center gap-1 rounded-lg border border-tool-accent-soft bg-tool-surface p-1">
              {(["grid", "entries", "invoice"] as View[]).map((v) => {
                const active = view === v;
                const label = v === "grid" ? "Workload grid" : v === "entries" ? "Entries" : "Invoice";
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={
                      "rounded-md px-3 py-1.5 text-xs font-medium transition " +
                      (active
                        ? "bg-tool-accent text-white shadow-sm"
                        : "text-muted hover:bg-tool-accent-soft hover:text-app")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weekly grid: days × projects (rows) */}
          {view === "grid" && (
          <div className="bg-app-elevated/40 px-3 py-5 sm:px-5">
            <div className="mb-3 flex items-baseline justify-between px-2">
              <div className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted">
                Workload grid · projects × days
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                target {targetPerProject.toFixed(1)}h / row
              </div>
            </div>

            {grid.projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-tool-accent-soft bg-tool-accent-soft px-5 py-10 text-center text-xs text-muted">
                Add entries below to populate the workload grid.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div
                  className="grid min-w-[640px] gap-px rounded-xl bg-tool-accent-soft p-px"
                  style={{
                    gridTemplateColumns: `minmax(140px,1.4fr) repeat(7, minmax(64px,1fr)) minmax(72px,0.9fr) minmax(56px,0.7fr)`,
                  }}
                >
                  {/* Header row */}
                  <div className="bg-tool-accent-soft px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    Project
                  </div>
                  {DAY_LABELS.map((d) => (
                    <div
                      key={d}
                      className="bg-tool-accent-soft px-2 py-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent"
                    >
                      {d}
                    </div>
                  ))}
                  <div className="bg-tool-accent-soft px-2 py-2 text-right text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    Total
                  </div>
                  <div className="bg-tool-accent-soft px-2 py-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    OT
                  </div>

                  {/* Body rows */}
                  {grid.projects.map((p) => {
                    const rowTotal = totals.byProject[p] || 0;
                    const overTarget = targetPerProject > 0 && rowTotal > targetPerProject * 1.15;
                    const underTarget = targetPerProject > 0 && rowTotal < targetPerProject * 0.65;
                    const rowBg = overTarget
                      ? "bg-rose-500/10"
                      : underTarget
                      ? "bg-amber-500/10"
                      : "bg-surface";
                    const otHours = Math.max(0, rowTotal - 40 * grid.weeks);

                    return (
                      <RowFragment
                        key={p}
                        project={p}
                        cells={grid.matrix[p]}
                        cellMax={grid.cellMax}
                        rowTotal={rowTotal}
                        rowBg={rowBg}
                        overTarget={overTarget}
                        underTarget={underTarget}
                        otHours={otHours}
                      />
                    );
                  })}

                  {/* Totals row */}
                  <div className="border-t-2 border-tool-accent bg-tool-accent-soft px-3 py-2.5 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-tool-accent">
                    Day total
                  </div>
                  {grid.dayTotals.map((dt, i) => (
                    <div
                      key={i}
                      className="border-t-2 border-tool-accent bg-tool-accent-soft px-2 py-2.5 text-center font-mono text-xs font-semibold tabular-nums text-app"
                    >
                      {dt > 0 ? dt.toFixed(1) : "—"}
                    </div>
                  ))}
                  <div className="border-t-2 border-tool-accent bg-tool-accent px-2 py-2.5 text-right font-mono text-sm font-bold tabular-nums text-white">
                    {totals.total.toFixed(1)}
                  </div>
                  <div className="border-t-2 border-tool-accent bg-tool-accent-soft px-2 py-2.5 text-center font-mono text-[0.65rem] tabular-nums text-muted">
                    {totals.overtimeWeeks.length}w
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 px-2 text-[0.65rem] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/70" />
                Over target (&gt; 115%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/70" />
                On target
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-400/70" />
                Under target (&lt; 65%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-wide text-rose-500">
                  OT
                </span>
                Over 40h × weeks
              </span>
            </div>

            {/* Capacity input + export buttons */}
            <div className="mt-5 flex flex-wrap items-end gap-3 px-2">
              <QueryField label="Weekly capacity (hrs/wk)">
                <input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className={fieldCls + " w-28"}
                />
              </QueryField>
              <button
                type="button"
                onClick={add}
                className="inline-flex items-center gap-1.5 rounded-lg border border-tool-accent-soft bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent transition hover:brightness-110"
              >
                + Add entry
              </button>
              <button
                type="button"
                onClick={exportSummary}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-tool-accent-soft bg-surface px-3 py-1.5 text-xs font-medium text-app backdrop-blur transition hover:bg-tool-accent-soft"
              >
                ↓ Summary.txt
              </button>
            </div>
          </div>
          )}

          {/* Entries view */}
          {view === "entries" && (
            <div className="bg-app-elevated/40 px-3 py-5 sm:px-5">
              <div className="space-y-4">
                {/* CSV importer */}
                <details className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft p-3">
                  <summary className="cursor-pointer text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    Import from CSV
                  </summary>
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={csv}
                      onChange={(e) => setCsv(e.target.value)}
                      rows={5}
                      placeholder={`date,project,hours,notes\n2026-04-18,Acme,6,Homepage`}
                      className={fieldCls + " font-mono text-xs"}
                    />
                    {error && <div className="text-xs text-rose-500">{error}</div>}
                    <button
                      type="button"
                      onClick={importCsv}
                      className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:brightness-110"
                    >
                      Import CSV
                    </button>
                  </div>
                </details>

                {/* Inline editor table */}
                <div className="overflow-hidden rounded-xl border border-tool-accent-soft bg-surface">
                  <div className="grid grid-cols-[120px_1fr_72px_1fr_36px] gap-px bg-tool-accent-soft text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    <div className="bg-tool-accent-soft px-3 py-2">Date</div>
                    <div className="bg-tool-accent-soft px-3 py-2">Project</div>
                    <div className="bg-tool-accent-soft px-3 py-2 text-right">Hrs</div>
                    <div className="bg-tool-accent-soft px-3 py-2">Notes</div>
                    <div className="bg-tool-accent-soft" />
                  </div>
                  {entries.map((e) => (
                    <div
                      key={e.id}
                      className="grid grid-cols-[120px_1fr_72px_1fr_36px] gap-px border-t border-tool-accent-soft bg-surface"
                    >
                      <input
                        type="date"
                        value={e.date}
                        onChange={(ev) => update(e.id, { date: ev.target.value })}
                        className="bg-transparent px-2 py-2 text-xs text-app focus:outline-none"
                      />
                      <input
                        type="text"
                        value={e.project}
                        onChange={(ev) => update(e.id, { project: ev.target.value })}
                        placeholder="Project"
                        className="bg-transparent px-3 py-2 text-sm text-app placeholder:text-muted focus:outline-none"
                      />
                      <input
                        type="number"
                        value={e.hours}
                        onChange={(ev) => update(e.id, { hours: ev.target.value })}
                        placeholder="0"
                        step="0.25"
                        min="0"
                        className="bg-transparent px-3 py-2 text-right font-mono text-sm tabular-nums text-app placeholder:text-muted focus:outline-none"
                      />
                      <input
                        type="text"
                        value={e.notes}
                        onChange={(ev) => update(e.id, { notes: ev.target.value })}
                        placeholder="Notes"
                        className="bg-transparent px-3 py-2 text-sm text-app placeholder:text-muted focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        className="text-muted transition hover:text-rose-500"
                        aria-label="Remove entry"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {entries.length === 0 && (
                    <div className="border-t border-tool-accent-soft bg-surface p-6 text-center text-sm text-muted">
                      No entries. Add one or import CSV.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={add}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-tool-accent-soft bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent transition hover:brightness-110"
                  >
                    + Add entry
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Invoice view */}
          {view === "invoice" && (
            <div className="bg-app-elevated/40 px-3 py-5 sm:px-5">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <QueryField label="From (contractor)">
                    <input
                      value={contractor}
                      onChange={(e) => setContractor(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                  <QueryField label="To (client)">
                    <input
                      value={client}
                      onChange={(e) => setClient(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                  <QueryField label="Invoice number">
                    <input
                      value={invoiceNum}
                      onChange={(e) => setInvoiceNum(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                </div>

                <div className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft p-3">
                  <div className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                    Hourly rates per project
                  </div>
                  {Object.keys(totals.byProject).length === 0 ? (
                    <div className="px-1 py-2 text-xs text-muted">
                      Add entries to set rates.
                    </div>
                  ) : (
                    <div className="divide-y divide-tool-accent-soft">
                      {Object.entries(totals.byProject).map(([project, hours]) => {
                        const rate = parseFloat(rates[project] || "0") || 0;
                        return (
                          <div
                            key={project}
                            className="grid grid-cols-[1fr_88px_120px_120px] items-center gap-3 py-2"
                          >
                            <div className="truncate text-sm text-app">
                              {project}
                            </div>
                            <div className="text-right font-mono text-xs tabular-nums text-muted">
                              {hours.toFixed(2)}h
                            </div>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[0.65rem] text-muted">
                                $
                              </span>
                              <input
                                type="number"
                                value={rates[project] || ""}
                                onChange={(e) =>
                                  setRates((prev) => ({ ...prev, [project]: e.target.value }))
                                }
                                placeholder="0"
                                min="0"
                                step="5"
                                className={fieldCls + " pl-5 text-right"}
                              />
                            </div>
                            <div className="text-right font-mono text-sm font-semibold tabular-nums text-tool-accent">
                              ${(rate * hours).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={exportInvoice}
                  disabled={Object.keys(totals.byProject).length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
                >
                  ↓ Download invoice (.txt)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PercentileCard
            label="Total"
            sub="hours logged"
            value={`${totals.total.toFixed(1)}h`}
            emphasized
          />
          <PercentileCard
            label="Utilization"
            sub={`${totals.weekCount} wk · ${capacity}h cap`}
            value={`${totals.utilization.toFixed(0)}%`}
          />
          <PercentileCard
            label="Overtime wks"
            sub="weeks above 40h"
            value={`${totals.overtimeWeeks.length}`}
          />
          <PercentileCard
            label="Projects"
            sub="distinct rows"
            value={`${grid.projects.length}`}
          />
        </div>

        {/* Sidebar — by project share + by week */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                By project share
              </div>
              <h3 className="text-sm font-semibold text-app">
                Mix of total hours
              </h3>
            </div>
            <div className="space-y-2 px-5 py-4">
              {Object.entries(totals.byProject)
                .sort((a, b) => b[1] - a[1])
                .map(([p, h]) => {
                  const pct = totals.total > 0 ? (h / totals.total) * 100 : 0;
                  return (
                    <div key={p} className="text-xs">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="truncate text-app">{p}</span>
                        <span className="font-mono tabular-nums text-muted">
                          {h.toFixed(1)}h · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-tool-accent-soft">
                        <div
                          className="h-full rounded-full bg-tool-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {Object.keys(totals.byProject).length === 0 && (
                <div className="text-xs text-muted">
                  No projects yet.
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                By ISO week
              </div>
              <h3 className="text-sm font-semibold text-app">
                Overtime detection · 40h threshold
              </h3>
            </div>
            <div className="space-y-1.5 px-5 py-4">
              {Object.entries(totals.byWeek)
                .sort()
                .map(([w, h]) => {
                  const over = h > 40;
                  return (
                    <div
                      key={w}
                      className={
                        "flex items-baseline justify-between rounded-lg border px-3 py-2 text-xs " +
                        (over
                          ? "border-rose-400/40 bg-rose-500/10 text-rose-500"
                          : "border-tool-accent-soft bg-surface text-app")
                      }
                    >
                      <span className="font-mono tabular-nums">{w}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {h.toFixed(1)}h{over ? " · OT" : ""}
                      </span>
                    </div>
                  );
                })}
              {Object.keys(totals.byWeek).length === 0 && (
                <div className="text-xs text-muted">
                  No weeks yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Methodology */}
        <div className="rounded-2xl border border-tool-accent-soft bg-tool-surface p-5 text-xs text-muted">
          <div className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
            Methodology
          </div>
          <p>
            Day-of-week buckets aggregate hours per project across the entire
            entry range (Mon–Sun, UTC). Row target is total capacity (hrs/wk × weeks)
            divided evenly across projects — over-target rows tint rose, under-target
            tint amber. OT chip = hours beyond <span className="font-mono">40h × {grid.weeks}wk</span>.
            ISO-week overtime uses the standard 40h threshold per week.
          </p>
        </div>

        {/* Hidden unused-import guard: keep ToolCard imports referenced so
            existing file-level utilities stay available without warnings. */}
        <span className="hidden">
          <ToolCard title="x" subtitle="x">
            <Field label="x">
              <input className={inputCls()} />
            </Field>
            <Stat label="x" value="x" />
          </ToolCard>
        </span>
      </div>
    </ToolShell>
  );
}

/* ---------- sub-components ---------- */

const fieldCls =
  "w-full rounded-lg border border-tool-accent-soft bg-surface px-3 py-2 text-sm text-app shadow-sm outline-none transition focus:border-tool-accent focus:ring-2 ring-tool-accent";

function QueryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Chip({ children, icon }: { children: React.ReactNode; icon?: string }) {
  const glyph =
    icon === "hours"
      ? "Σ"
      : icon === "util"
      ? "%"
      : icon === "ot"
      ? "!"
      : icon === "weeks"
      ? "▦"
      : "·";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent-soft bg-surface px-2.5 py-1 text-[0.7rem] font-medium text-app backdrop-blur">
      <span className="text-tool-accent">{glyph}</span>
      {children}
    </span>
  );
}

function PercentileCard({
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
          ? "border-tool-accent-soft bg-tool-accent-soft"
          : "border-tool-accent-soft bg-surface")
      }
    >
      <div className="flex items-baseline justify-between">
        <span
          className={
            "text-[0.6rem] font-bold uppercase tracking-[0.2em] " +
            (emphasized ? "text-tool-accent" : "text-muted")
          }
        >
          {label}
        </span>
        <span className="text-[0.6rem] text-muted">{sub}</span>
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-xl font-bold text-tool-accent"
            : "text-lg font-semibold text-app")
        }
      >
        {value}
      </div>
    </div>
  );
}

function RowFragment({
  project,
  cells,
  cellMax,
  rowTotal,
  rowBg,
  overTarget,
  underTarget,
  otHours,
}: {
  project: string;
  cells: number[];
  cellMax: number;
  rowTotal: number;
  rowBg: string;
  overTarget: boolean;
  underTarget: boolean;
  otHours: number;
}) {
  const totalTone = overTarget
    ? "text-rose-500"
    : underTarget
    ? "text-amber-500"
    : "text-emerald-500";
  const barTone = overTarget
    ? "bg-rose-400/70"
    : underTarget
    ? "bg-amber-400/70"
    : "bg-emerald-400/70";
  return (
    <>
      <div className={`flex items-center px-3 py-2 ${rowBg}`}>
        <span className="truncate text-sm font-medium text-app">
          {project}
        </span>
      </div>
      {cells.map((h, i) => {
        const pct = cellMax > 0 ? (h / cellMax) * 100 : 0;
        return (
          <div key={i} className={`flex flex-col items-center justify-end gap-1 px-1.5 py-1.5 ${rowBg}`}>
            <div className="relative h-8 w-full overflow-hidden rounded-md bg-tool-accent-soft">
              {h > 0 && (
                <div
                  className={`absolute inset-x-0 bottom-0 ${barTone} transition-all`}
                  style={{ height: `${Math.max(8, pct)}%` }}
                />
              )}
            </div>
            <span className="font-mono text-[0.6rem] tabular-nums text-muted">
              {h > 0 ? h.toFixed(1) : "·"}
            </span>
          </div>
        );
      })}
      <div className={`flex items-center justify-end px-2 py-2 ${rowBg}`}>
        <span className={`font-mono text-sm font-bold tabular-nums ${totalTone}`}>
          {rowTotal.toFixed(1)}
        </span>
      </div>
      <div className={`flex items-center justify-center px-1 py-2 ${rowBg}`}>
        {otHours > 0 ? (
          <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-wide text-rose-500">
            +{otHours.toFixed(0)}h
          </span>
        ) : (
          <span className="text-[0.6rem] text-muted">—</span>
        )}
      </div>
    </>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

// ISO week key (YYYY-Www)
function weekKey(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
