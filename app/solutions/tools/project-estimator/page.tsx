"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

interface Task {
  id: string;
  name: string;
  hours: string; // most-likely in PERT mode
  rate: string;
  optimistic?: string;
  pessimistic?: string;
}

type EstMode = "single" | "pert" | "story" | "tshirt";

const uid = () => Math.random().toString(36).slice(2, 9);

// PERT Expected = (O + 4M + P) / 6; variance = ((P - O) / 6)^2.
// Industry standard used in PMI PMBOK 7th ed.
function pertExpected(o: number, m: number, p: number) {
  return (o + 4 * m + p) / 6;
}
function pertStdDev(o: number, p: number) {
  return (p - o) / 6;
}

export default function ProjectEstimatorPage() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: uid(), name: "Discovery & scoping", hours: "10", rate: "150", optimistic: "6", pessimistic: "20" },
    { id: uid(), name: "Design", hours: "30", rate: "120", optimistic: "20", pessimistic: "50" },
    { id: uid(), name: "Build", hours: "80", rate: "140", optimistic: "60", pessimistic: "130" },
    { id: uid(), name: "QA & launch", hours: "20", rate: "100", optimistic: "12", pessimistic: "35" },
  ]);
  const [buffer, setBuffer] = useState("20");
  const [overhead, setOverhead] = useState("10");
  const [estMode, setEstMode] = useState<EstMode>("single");
  const [projectName, setProjectName] = useState("New project");
  const [clientName, setClientName] = useState("Client");

  const totals = useMemo(() => {
    let subtotalHours = 0;
    let optSum = 0;
    let pessSum = 0;
    let expSum = 0;
    let varianceSum = 0;
    let subtotal = 0;
    let expCost = 0;
    let optCost = 0;
    let pessCost = 0;
    for (const t of tasks) {
      const m = parseFloat(t.hours) || 0;
      const o = parseFloat(t.optimistic || "") || m;
      const p = parseFloat(t.pessimistic || "") || m;
      const r = parseFloat(t.rate) || 0;
      const exp = pertExpected(o, m, p);
      const sd = pertStdDev(o, p);
      subtotalHours += m;
      optSum += o;
      pessSum += p;
      expSum += exp;
      varianceSum += sd * sd;
      subtotal += m * r;
      expCost += exp * r;
      optCost += o * r;
      pessCost += p * r;
    }
    const totalStdDev = Math.sqrt(varianceSum);
    const usePert = estMode === "pert";
    const activeSubtotal = usePert ? expCost : subtotal;
    const bufferAmt = activeSubtotal * ((parseFloat(buffer) || 0) / 100);
    const overheadAmt = activeSubtotal * ((parseFloat(overhead) || 0) / 100);
    const total = activeSubtotal + bufferAmt + overheadAmt;
    const hours = usePert ? expSum : subtotalHours;
    const bufferedHours = hours * (1 + (parseFloat(buffer) || 0) / 100);
    return {
      subtotal: activeSubtotal,
      hours,
      bufferAmt,
      overheadAmt,
      total,
      bufferedHours,
      optCost,
      pessCost,
      expCost,
      optHours: optSum,
      pessHours: pessSum,
      expHours: expSum,
      totalStdDev,
      // 90% confidence range (~ ±1.645 σ) as a quick rule of thumb
      p90Low: expSum - 1.645 * totalStdDev,
      p90High: expSum + 1.645 * totalStdDev,
    };
  }, [tasks, buffer, overhead, estMode]);

  const update = (id: string, patch: Partial<Task>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add = () =>
    setTasks((prev) => [...prev, { id: uid(), name: "", hours: "", rate: "" }]);
  const remove = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function exportProposal() {
    const lines: string[] = [];
    lines.push(`PROPOSAL — ${projectName}`);
    lines.push(`Prepared for: ${clientName}`);
    lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
    lines.push("");
    lines.push("SCOPE OF WORK");
    lines.push("================================");
    tasks.forEach((t, i) => {
      const m = parseFloat(t.hours) || 0;
      const o = parseFloat(t.optimistic || "") || m;
      const p = parseFloat(t.pessimistic || "") || m;
      const exp = pertExpected(o, m, p);
      const display = estMode === "pert" ? exp : m;
      const r = parseFloat(t.rate) || 0;
      lines.push(`${i + 1}. ${t.name}`);
      lines.push(`   Estimated: ${display.toFixed(1)}h @ $${r}/hr = ${fmt(display * r)}`);
      if (estMode === "pert") {
        lines.push(`   Range (O/M/P): ${o}h / ${m}h / ${p}h`);
      }
    });
    lines.push("");
    lines.push("INVESTMENT");
    lines.push("================================");
    lines.push(`Subtotal:           ${fmt(totals.subtotal)}`);
    lines.push(`Risk buffer (${buffer}%):   ${fmt(totals.bufferAmt)}`);
    lines.push(`PM / overhead (${overhead}%): ${fmt(totals.overheadAmt)}`);
    lines.push(`TOTAL:              ${fmt(totals.total)}`);
    lines.push("");
    if (estMode === "pert") {
      lines.push("CONFIDENCE (PERT)");
      lines.push("================================");
      lines.push(`Expected hours:     ${totals.expHours.toFixed(1)}h`);
      lines.push(`90% range:          ${Math.max(0, totals.p90Low).toFixed(1)}h – ${totals.p90High.toFixed(1)}h`);
      lines.push(`Optimistic total:   ${fmt(totals.optCost)}`);
      lines.push(`Pessimistic total:  ${fmt(totals.pessCost)}`);
      lines.push("");
    }
    lines.push("ASSUMPTIONS");
    lines.push("================================");
    lines.push("- Scope is the list above; change requests billed separately.");
    lines.push("- Estimate valid for 30 days from the date above.");
    lines.push("- Payment terms: 50% on kickoff, 50% on delivery unless otherwise agreed.");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-${projectName.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // duration estimate at a generous 30 productive hrs/week
  const durationWeeks = totals.bufferedHours / 30;

  // simple risk band visualization data for PERT mode
  const riskBands = useMemo(() => {
    if (estMode !== "pert") return null;
    const lo = Math.max(0, totals.optCost);
    const exp = totals.expCost;
    const hi = totals.pessCost;
    const range = Math.max(1, hi - lo);
    return {
      lo,
      exp,
      hi,
      // expected position 0..100% across [lo, hi]
      expPct: ((exp - lo) / range) * 100,
    };
  }, [estMode, totals.optCost, totals.expCost, totals.pessCost]);

  const modeOptions: { k: EstMode; label: string; sub: string }[] = [
    { k: "single", label: "Hours", sub: "single-point" },
    { k: "pert", label: "PERT", sub: "3-point" },
    { k: "story", label: "Story pts", sub: "velocity" },
    { k: "tshirt", label: "T-shirt", sub: "S/M/L/XL" },
  ];

  return (
    <div data-tool-theme="productivity" data-tool="project-estimator">
      <ToolShell
        category="Productivity"
        title="Project Estimator"
        description="Break work into tasks, apply hour estimates and rates, buffer for risk, add overhead. Get a defensible quote."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {modeOptions.find((m) => m.k === estMode)?.label}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              estimator.quote
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(projectName || "untitled").toLowerCase().replace(/\s+/g, "-")}.proposal
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">USD · live</div>
          </div>

          <div className="relative p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Project Estimator · Defensible quote
                </div>
                <div className="mt-3 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                  {estMode === "pert" ? "Expected (PERT)" : "Single-point total"}
                </div>
                <div
                  className="mt-1 font-mono tabular-nums font-bold leading-none tracking-tight text-tool-accent"
                  style={{ fontSize: "clamp(2.5rem, 9vw, 5.5rem)" }}
                >
                  {fmt(totals.total)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent bg-tool-accent-soft px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    {totals.bufferedHours.toFixed(0)}h with buffer
                  </span>
                  <span className="rounded-full border border-app bg-app px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    ~{durationWeeks.toFixed(1)} wk @ 30h/wk
                  </span>
                  <span className="rounded-full border border-app bg-app px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    {totals.hours.toFixed(0)}h scoped
                  </span>
                </div>
              </div>

              {/* right cluster — quick stats */}
              <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                <div className="rounded-xl border border-app bg-app px-3 py-3 text-center">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Subtotal</div>
                  <div className="mt-1 font-mono text-sm tabular-nums text-app sm:text-base">
                    {fmt(totals.subtotal)}
                  </div>
                </div>
                <div className="rounded-xl border border-app bg-app px-3 py-3 text-center">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Buffer {buffer || 0}%
                  </div>
                  <div className="mt-1 font-mono text-sm tabular-nums text-app sm:text-base">
                    {fmt(totals.bufferAmt)}
                  </div>
                </div>
                <div className="rounded-xl border border-app bg-app px-3 py-3 text-center">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Overhead {overhead || 0}%
                  </div>
                  <div className="mt-1 font-mono text-sm tabular-nums text-app sm:text-base">
                    {fmt(totals.overheadAmt)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* segmented mode tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {modeOptions.map((m) => (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setEstMode(m.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    estMode === m.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={estMode === m.k ? { color: "var(--bg)" } : undefined}
                  title={m.sub}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {estMode === "pert"
                ? "(O + 4M + P) / 6 — PMBOK 7"
                : estMode === "story"
                ? "story-points × velocity (coming)"
                : estMode === "tshirt"
                ? "S/M/L/XL → hour bands (coming)"
                : "hours × rate"}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={exportProposal}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Export proposal
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Print
              </button>
            </div>
          </div>
        </section>

        {/* Tasks + summary */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <ToolCard title="Task rows" subtitle="Role + hours + rate · live subtotal per row">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                {tasks.length} {tasks.length === 1 ? "row" : "rows"}
              </span>
              <div className="text-right">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Hours</div>
                <div className="font-mono text-sm tabular-nums text-tool-accent">{totals.hours.toFixed(1)}h</div>
              </div>
            </div>

            <ul className="space-y-2">
              {tasks.map((t, i) => {
                const m = parseFloat(t.hours) || 0;
                const r = parseFloat(t.rate) || 0;
                const o = parseFloat(t.optimistic || "") || m;
                const p = parseFloat(t.pessimistic || "") || m;
                const exp = pertExpected(o, m, p);
                const rowCost = estMode === "pert" ? exp * r : m * r;
                return (
                  <li
                    key={t.id}
                    className="group relative rounded-xl border border-app bg-app-elevated p-2.5 transition-colors hover:border-tool-accent"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-tool-accent-soft font-mono text-xs font-semibold text-tool-accent">
                        {i + 1}
                      </div>
                      <input
                        type="text"
                        value={t.name}
                        onChange={(e) => update(t.id, { name: e.target.value })}
                        placeholder="Role / task"
                        className="flex-1 bg-transparent px-2 py-1.5 text-sm text-app placeholder:text-faint focus:outline-none"
                      />
                      <div className="hidden text-right font-mono text-sm tabular-nums text-tool-accent sm:block">
                        {fmt(rowCost)}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-app text-muted transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500"
                        aria-label="Remove task"
                      >
                        ×
                      </button>
                    </div>

                    {estMode === "single" || estMode === "story" || estMode === "tshirt" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 pl-10">
                        <Field label={estMode === "story" ? "Points" : estMode === "tshirt" ? "Size → hrs" : "Hours"}>
                          <input
                            type="number"
                            value={t.hours}
                            onChange={(e) => update(t.id, { hours: e.target.value })}
                            placeholder="0"
                            min="0"
                            className={inputCls("font-mono tabular-nums")}
                          />
                        </Field>
                        <Field label="Rate / hr">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-faint">$</span>
                            <input
                              type="number"
                              value={t.rate}
                              onChange={(e) => update(t.id, { rate: e.target.value })}
                              placeholder="0"
                              min="0"
                              className={inputCls("font-mono tabular-nums pl-5")}
                            />
                          </div>
                        </Field>
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2 pl-10 sm:grid-cols-4">
                        <Field label="Optimistic">
                          <input
                            type="number"
                            value={t.optimistic || ""}
                            onChange={(e) => update(t.id, { optimistic: e.target.value })}
                            placeholder="0"
                            min="0"
                            className={inputCls("font-mono tabular-nums")}
                          />
                        </Field>
                        <Field label="Most-likely">
                          <input
                            type="number"
                            value={t.hours}
                            onChange={(e) => update(t.id, { hours: e.target.value })}
                            placeholder="0"
                            min="0"
                            className={inputCls("font-mono tabular-nums")}
                          />
                        </Field>
                        <Field label="Pessimistic">
                          <input
                            type="number"
                            value={t.pessimistic || ""}
                            onChange={(e) => update(t.id, { pessimistic: e.target.value })}
                            placeholder="0"
                            min="0"
                            className={inputCls("font-mono tabular-nums")}
                          />
                        </Field>
                        <Field label="Rate / hr">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-faint">$</span>
                            <input
                              type="number"
                              value={t.rate}
                              onChange={(e) => update(t.id, { rate: e.target.value })}
                              placeholder="0"
                              min="0"
                              className={inputCls("font-mono tabular-nums pl-5")}
                            />
                          </div>
                        </Field>
                      </div>
                    )}

                    {estMode === "pert" && (
                      <div className="mt-2 flex items-center justify-end gap-2 pl-10 font-mono text-[0.6rem] tabular-nums text-muted">
                        <span>Expected:</span>
                        <span className="text-tool-accent">{exp.toFixed(1)}h</span>
                        <span className="text-faint">·</span>
                        <span className="text-tool-accent">{fmt(rowCost)}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4">
              <button
                type="button"
                onClick={add}
                className="inline-flex items-center gap-1.5 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              >
                <span className="text-base leading-none">+</span> Add task
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-app pt-5">
              <Field label="Risk buffer %">
                <input
                  type="number"
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="0"
                />
              </Field>
              <Field label="Overhead / PM %">
                <input
                  type="number"
                  value={overhead}
                  onChange={(e) => setOverhead(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="0"
                />
              </Field>
            </div>
          </ToolCard>

          <div className="space-y-5">
            <ToolCard title="The quote" subtitle="Defensible breakdown">
              <div className="space-y-3">
                <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-4">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">Total quote</div>
                  <div className="mt-1 font-mono text-2xl tabular-nums font-semibold text-tool-accent">{fmt(totals.total)}</div>
                </div>
                <div className="rounded-xl border border-app bg-app-elevated p-4">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">Subtotal</div>
                  <div className="mt-1 font-mono text-xl tabular-nums text-app">{fmt(totals.subtotal)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-app bg-app-elevated p-3">
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">Buffer ({buffer || 0}%)</div>
                    <div className="mt-1 font-mono text-base tabular-nums text-app">{fmt(totals.bufferAmt)}</div>
                  </div>
                  <div className="rounded-xl border border-app bg-app-elevated p-3">
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">Overhead ({overhead || 0}%)</div>
                    <div className="mt-1 font-mono text-base tabular-nums text-app">{fmt(totals.overheadAmt)}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-app bg-app-elevated p-4">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">Hours (with buffer)</div>
                  <div className="mt-1 font-mono text-xl tabular-nums text-app">{totals.bufferedHours.toFixed(1)}h</div>
                </div>
              </div>
            </ToolCard>

            {estMode === "pert" && riskBands && (
              <ToolCard title="Risk band" subtitle="Optimistic → expected → pessimistic">
                {/* semantic-tone band: emerald → amber → rose */}
                <div className="relative h-3 overflow-hidden rounded-full border border-app bg-app">
                  <div
                    className="absolute inset-y-0 left-0 right-0"
                    style={{
                      background:
                        "linear-gradient(90deg, rgb(16 185 129 / 0.55) 0%, rgb(245 158 11 / 0.55) 50%, rgb(244 63 94 / 0.55) 100%)",
                    }}
                  />
                  {/* expected marker */}
                  <div
                    className="absolute -top-1 h-5 w-[2px] bg-app"
                    style={{ left: `${Math.min(100, Math.max(0, riskBands.expPct))}%` }}
                    aria-hidden
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-emerald-500">Optimistic</div>
                    <div className="mt-1 font-mono text-sm tabular-nums text-app">{fmt(totals.optCost)}</div>
                    <div className="font-mono text-[0.55rem] text-muted">{totals.optHours.toFixed(0)}h</div>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-amber-500">Expected</div>
                    <div className="mt-1 font-mono text-sm tabular-nums text-app">{fmt(totals.expCost)}</div>
                    <div className="font-mono text-[0.55rem] text-muted">{totals.expHours.toFixed(0)}h</div>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-rose-500">Pessimistic</div>
                    <div className="mt-1 font-mono text-sm tabular-nums text-app">{fmt(totals.pessCost)}</div>
                    <div className="font-mono text-[0.55rem] text-muted">{totals.pessHours.toFixed(0)}h</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">90% hours range</span>
                  <span className="font-mono text-xs tabular-nums text-app">
                    {Math.max(0, totals.p90Low).toFixed(0)}h – {totals.p90High.toFixed(0)}h
                  </span>
                </div>
              </ToolCard>
            )}

            <div className="rounded-xl border border-app bg-app-elevated p-4 text-xs leading-relaxed text-secondary">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">Quoting tip</p>
              <p className="mt-1.5 text-secondary">
                A 20% buffer is table stakes for anything non-trivial. PERT 90% range uses ±1.645σ. Source: PMI PMBOK 7th edition.
              </p>
            </div>
          </div>
        </div>

        {/* Proposal export */}
        <section className="mt-6">
          <ToolCard title="Proposal export" subtitle="Ready-to-send section">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Project name">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className={inputCls()}
                />
              </Field>
              <Field label="Client name">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className={inputCls()}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={exportProposal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              Download proposal (.txt)
            </button>
          </ToolCard>
        </section>
      </ToolShell>
    </div>
  );
}
