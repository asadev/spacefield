"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Stat, inputCls } from "../../_components/ToolCard";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// Federal Reserve G.19 avg consumer credit APRs (2024 Q4 release) for
// reference bands. The user can eyeball whether their APR is typical.
const APR_REFERENCE: { kind: string; apr: number }[] = [
  { kind: "Credit card (all accounts)", apr: 21.5 },
  { kind: "Credit card (accounts carrying a balance)", apr: 23.4 },
  { kind: "Personal loan (24-mo)", apr: 12.3 },
  { kind: "Auto loan (48-mo new)", apr: 8.4 },
  { kind: "Federal student loan (undergrad 2024-25)", apr: 6.5 },
  { kind: "HELOC (approx)", apr: 9.0 },
];

interface Debt {
  id: string;
  name: string;
  balance: string;
  apr: string;
  minPayment: string;
}

interface SimResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
  perDebt: { id: string; name: string; paidOffMonth: number; interestPaid: number }[];
  timeline: { month: number; balance: number }[];
  infeasible?: string;
}

type Strategy = "snowball" | "avalanche" | "custom";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function simulate(
  debts: Debt[],
  extra: number,
  strategy: Strategy,
  customOrder?: string[]
): SimResult {
  // Clone to mutable balances.
  const state = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: Math.max(0, parseFloat(d.balance) || 0),
    apr: Math.max(0, parseFloat(d.apr) || 0),
    minPayment: Math.max(0, parseFloat(d.minPayment) || 0),
    interestPaid: 0,
    paidOffMonth: 0,
  }));

  const totalMin = state.reduce((a, b) => a + b.minPayment, 0);
  let months = 0;
  const maxMonths = 1200;
  const timeline: { month: number; balance: number }[] = [
    { month: 0, balance: state.reduce((a, b) => a + b.balance, 0) },
  ];

  // Check feasibility: each debt's min payment must at least cover its monthly interest.
  for (const d of state) {
    const monthlyInterest = d.balance * (d.apr / 100 / 12);
    if (d.balance > 0 && d.minPayment < monthlyInterest) {
      return {
        months: 0,
        totalInterest: 0,
        totalPaid: 0,
        perDebt: [],
        timeline,
        infeasible: `${d.name || "Unnamed debt"}: minimum payment (${d.minPayment.toFixed(
          2
        )}) is less than monthly interest (${monthlyInterest.toFixed(
          2
        )}). Debt would grow forever.`,
      };
    }
  }

  while (state.some((d) => d.balance > 0.005) && months < maxMonths) {
    months++;
    let budget = totalMin + extra;

    // 1) Apply interest + minimum payments to all open debts.
    for (const d of state) {
      if (d.balance <= 0.005) continue;
      const interest = d.balance * (d.apr / 100 / 12);
      d.interestPaid += interest;
      d.balance += interest;
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay;
      budget -= pay;
      if (d.balance <= 0.005 && d.paidOffMonth === 0) {
        d.paidOffMonth = months;
        budget += -d.balance; // overshoot credited back
        d.balance = 0;
      }
    }

    // 2) Apply extra to target debt per strategy.
    while (budget > 0.005) {
      const open = state.filter((d) => d.balance > 0.005);
      if (open.length === 0) break;
      let target;
      if (strategy === "snowball") {
        target = open.slice().sort((a, b) => a.balance - b.balance)[0];
      } else if (strategy === "avalanche") {
        target = open.slice().sort((a, b) => b.apr - a.apr)[0];
      } else {
        // custom: follow customOrder ranking; debts not in list go last
        const rankOf = (id: string) => {
          const r = customOrder?.indexOf(id) ?? -1;
          return r === -1 ? Number.MAX_SAFE_INTEGER : r;
        };
        target = open.slice().sort((a, b) => rankOf(a.id) - rankOf(b.id))[0];
      }

      const pay = Math.min(budget, target.balance);
      target.balance -= pay;
      budget -= pay;
      if (target.balance <= 0.005 && target.paidOffMonth === 0) {
        target.paidOffMonth = months;
        target.balance = 0;
      }
    }

    timeline.push({
      month: months,
      balance: state.reduce((a, b) => a + b.balance, 0),
    });
  }

  const totalInterest = state.reduce((a, b) => a + b.interestPaid, 0);
  const totalPaid =
    state.reduce((a, b) => a + b.interestPaid, 0) +
    debts.reduce((a, b) => a + (parseFloat(b.balance) || 0), 0);

  return {
    months,
    totalInterest,
    totalPaid,
    perDebt: state.map((d) => ({
      id: d.id,
      name: d.name,
      paidOffMonth: d.paidOffMonth,
      interestPaid: d.interestPaid,
    })),
    timeline,
  };
}

interface Inputs {
  debts: Debt[];
  extra: string;
  strategy?: Strategy;
  customOrder?: string[];
}

const DEFAULT_DEBTS: Debt[] = [
  { id: "a1", name: "Credit card", balance: "6500", apr: "22.9", minPayment: "180" },
  { id: "a2", name: "Car loan", balance: "12400", apr: "6.5", minPayment: "280" },
  { id: "a3", name: "Student loan", balance: "18000", apr: "4.2", minPayment: "220" },
];

export default function DebtPayoffPage() {
  const [debts, setDebts] = useState<Debt[]>(DEFAULT_DEBTS);
  const [extra, setExtra] = useState("200");
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const [customOrder, setCustomOrder] = useState<string[]>(DEFAULT_DEBTS.map((d) => d.id));

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared?.debts) setDebts(shared.debts);
    if (shared?.extra) setExtra(shared.extra);
    if (shared?.strategy) setStrategy(shared.strategy);
    if (shared?.customOrder) setCustomOrder(shared.customOrder);
  }, []);

  // Keep custom order in sync with the debt list (add new ids, drop removed ones).
  useEffect(() => {
    setCustomOrder((prev) => {
      const ids = debts.map((d) => d.id);
      const filtered = prev.filter((id) => ids.includes(id));
      const additions = ids.filter((id) => !filtered.includes(id));
      return [...filtered, ...additions];
    });
  }, [debts]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const extraNum = parseFloat(extra) || 0;

  const snowball = useMemo(() => simulate(debts, extraNum, "snowball"), [debts, extraNum]);
  const avalanche = useMemo(() => simulate(debts, extraNum, "avalanche"), [debts, extraNum]);
  const custom = useMemo(
    () => simulate(debts, extraNum, "custom", customOrder),
    [debts, extraNum, customOrder]
  );

  const update = (id: string, key: keyof Debt, value: string) => {
    setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, [key]: value } : d)));
  };

  const add = () =>
    setDebts((prev) => [
      ...prev,
      { id: uid(), name: "New debt", balance: "1000", apr: "10", minPayment: "25" },
    ]);

  const remove = (id: string) => setDebts((prev) => prev.filter((d) => d.id !== id));

  const moveCustom = (id: string, dir: -1 | 1) => {
    setCustomOrder((prev) => {
      const i = prev.indexOf(id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const totalBalance = debts.reduce((a, b) => a + (parseFloat(b.balance) || 0), 0);
  const totalMin = debts.reduce((a, b) => a + (parseFloat(b.minPayment) || 0), 0);

  // Active strategy result for the ladder + timeline.
  const active =
    strategy === "snowball" ? snowball : strategy === "avalanche" ? avalanche : custom;

  // Best baseline is the highest-interest of the alternatives — what avalanche saves vs. the worst.
  const interestSaved = Math.max(0, snowball.totalInterest - avalanche.totalInterest);

  // Build ladder: rank debts by strategy ordering, attach principal/interest.
  const rankedLadder = useMemo(() => {
    const principalById: Record<string, number> = {};
    debts.forEach((d) => {
      principalById[d.id] = parseFloat(d.balance) || 0;
    });
    const rows = active.perDebt.map((p, idx) => {
      const principal = principalById[p.id] ?? 0;
      const total = principal + p.interestPaid;
      return {
        ...p,
        principal,
        total,
        rank: idx + 1,
      };
    });
    rows.sort((a, b) => {
      if (a.paidOffMonth === 0 && b.paidOffMonth === 0) return 0;
      if (a.paidOffMonth === 0) return 1;
      if (b.paidOffMonth === 0) return -1;
      return a.paidOffMonth - b.paidOffMonth;
    });
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [active, debts]);

  const ladderMaxTotal = rankedLadder.reduce((m, r) => Math.max(m, r.total), 1);

  const monthsLabel =
    active.months > 0
      ? `${Math.floor(active.months / 12)}y ${active.months % 12}mo`
      : "—";

  return (
    <div data-tool-theme="finance" data-tool="debt-payoff">
      <ToolShell
        category="Finance"
        title="Debt Payoff — Snowball vs Avalanche"
        description="Line up your debts. Pick the right strategy. See the exact month you'll be debt-free."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {strategy === "snowball" ? "snowball" : strategy === "avalanche" ? "avalanche" : "custom"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {debts.length} debt{debts.length === 1 ? "" : "s"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              payoff.plan
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {strategy}.run
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              extra {fmt(extraNum)}/mo
            </div>
          </div>

          <div className="relative p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Debt-free verdict
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-4xl font-semibold tracking-tight text-app sm:text-5xl">
                    {monthsLabel}
                  </span>
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                    until debt-free
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    saves {fmt(interestSaved)} vs snowball
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    interest {fmt(active.totalInterest)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
                <Stat label="Total balance" value={fmt(totalBalance)} />
                <Stat label="Monthly budget" value={fmt(totalMin + extraNum)} accent />
              </div>
            </div>
          </div>

          {/* Strategy segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "snowball", label: "Snowball" },
                  { k: "avalanche", label: "Avalanche" },
                  { k: "custom", label: "Custom" },
                ] as { k: Strategy; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setStrategy(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    strategy === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={strategy === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {strategy === "snowball"
                ? "smallest balance first — quick wins"
                : strategy === "avalanche"
                ? "highest APR first — math-optimal"
                : "your order — drag-rank below"}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6">
          {/* Inputs: debts + extra payment */}
          <ToolCard title="Debts" subtitle="Your obligations">
            <div className="space-y-3">
              <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_1fr_2rem] gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted md:grid">
                <div>Name</div>
                <div>Balance</div>
                <div>APR %</div>
                <div>Min payment</div>
                <div />
              </div>
              {debts.map((d) => (
                <div
                  key={d.id}
                  className="grid grid-cols-1 gap-2 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_2rem]"
                >
                  <input
                    value={d.name}
                    onChange={(e) => update(d.id, "name", e.target.value)}
                    className={inputCls()}
                    placeholder="Debt name"
                  />
                  <input
                    type="number"
                    value={d.balance}
                    onChange={(e) => update(d.id, "balance", e.target.value)}
                    className={inputCls()}
                    min="0"
                    step="100"
                  />
                  <input
                    type="number"
                    value={d.apr}
                    onChange={(e) => update(d.id, "apr", e.target.value)}
                    className={inputCls()}
                    min="0"
                    step="0.1"
                  />
                  <input
                    type="number"
                    value={d.minPayment}
                    onChange={(e) => update(d.id, "minPayment", e.target.value)}
                    className={inputCls()}
                    min="0"
                    step="10"
                  />
                  <button
                    onClick={() => remove(d.id)}
                    className="rounded-md border border-app bg-app-elevated text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                    aria-label="Remove debt"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                onClick={add}
                className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              >
                + Add debt
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Extra monthly payment
                </span>
                <input
                  type="number"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  className={inputCls("w-32")}
                  min="0"
                  step="25"
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Total balance" value={fmt(totalBalance)} />
              <Stat label="Total min / month" value={fmt(totalMin)} />
              <Stat label="Monthly budget" value={fmt(totalMin + extraNum)} accent />
            </div>
          </ToolCard>

          {/* Custom-order ranker (only when strategy === custom) */}
          {strategy === "custom" && (
            <ToolCard
              title="Custom payoff order"
              subtitle="Top of the list gets the extra payment first"
            >
              <div className="space-y-2">
                {customOrder.map((id, idx) => {
                  const d = debts.find((x) => x.id === id);
                  if (!d) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 rounded-lg border border-app bg-app px-3 py-2"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-tool-accent bg-tool-accent-soft font-mono text-sm font-bold text-tool-accent">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-app">
                          {d.name || "Unnamed"}
                        </div>
                        <div className="font-mono text-[0.65rem] text-muted">
                          {fmt(parseFloat(d.balance) || 0)} · APR {parseFloat(d.apr) || 0}%
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveCustom(id, -1)}
                          disabled={idx === 0}
                          className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.7rem] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveCustom(id, 1)}
                          disabled={idx === customOrder.length - 1}
                          className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.7rem] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ToolCard>
          )}

          {/* Payoff timeline */}
          {!active.infeasible && active.timeline.length > 1 && (
            <ToolCard
              title="Payoff timeline"
              subtitle="Total balance over time"
            >
              <PayoffChart timeline={active.timeline} fmt={fmt} />
            </ToolCard>
          )}

          {/* The ladder: ranked debts with principal/interest split */}
          <ToolCard
            title={`${
              strategy === "snowball" ? "Snowball" : strategy === "avalanche" ? "Avalanche" : "Custom"
            } ladder`}
            subtitle={
              strategy === "snowball"
                ? "Climb out smallest balance first"
                : strategy === "avalanche"
                ? "Climb out highest APR first"
                : "Climb out in your chosen order"
            }
          >
            {active.infeasible ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
                {active.infeasible}
              </p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-tool-accent" />
                    Principal
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-app bg-app" />
                    Interest
                  </span>
                  <span className="ml-auto">
                    {rankedLadder.length} debt{rankedLadder.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-3">
                  {rankedLadder.map((row) => {
                    const widthPct = (row.total / ladderMaxTotal) * 100;
                    const principalPct =
                      row.total > 0 ? (row.principal / row.total) * 100 : 0;
                    const interestPct = 100 - principalPct;
                    const yearLabel =
                      row.paidOffMonth > 0
                        ? `${Math.floor(row.paidOffMonth / 12)}y ${row.paidOffMonth % 12}mo`
                        : "—";
                    return (
                      <div
                        key={row.id}
                        className={`rounded-xl border bg-app p-4 transition-colors ${
                          row.rank === 1
                            ? "border-tool-accent"
                            : "border-app hover:border-tool-accent"
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tool-accent-soft font-mono text-[0.65rem] font-semibold text-tool-accent">
                              {row.rank}
                            </span>
                            <span className="text-sm font-medium text-app">
                              {row.name || "Unnamed"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
                              {yearLabel}
                            </span>
                            <span className="font-mono text-[0.7rem] text-secondary">
                              total {fmt(row.total)}
                            </span>
                          </div>
                        </div>

                        <div
                          className="relative mt-3 flex h-2.5 overflow-hidden rounded-full border border-app bg-app-elevated"
                          style={{ width: `${Math.max(8, widthPct)}%` }}
                          aria-label={`${row.name}: principal ${fmt(row.principal)}, interest ${fmt(row.interestPaid)}`}
                        >
                          <div
                            className="h-full bg-tool-accent"
                            style={{ width: `${principalPct}%` }}
                          />
                          <div
                            className="h-full bg-tool-accent-soft"
                            style={{ width: `${interestPct}%` }}
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[0.65rem] text-muted">
                          <span>
                            Principal{" "}
                            <span className="text-app">{fmt(row.principal)}</span>
                          </span>
                          <span>
                            Interest paid{" "}
                            <span className="text-secondary">
                              {fmt(row.interestPaid)}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </ToolCard>

          {/* Strategy comparison */}
          {!snowball.infeasible && !avalanche.infeasible && (
            <ToolCard title="Side by side" subtitle="Math, not vibes">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div
                  className={`rounded-xl border p-4 ${
                    strategy === "snowball"
                      ? "border-tool-accent bg-tool-accent-soft"
                      : "border-app bg-app"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                      Snowball
                    </span>
                    {strategy === "snowball" && (
                      <span className="rounded-md border border-tool-accent bg-app-elevated px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                        active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-app">
                    {Math.floor(snowball.months / 12)}y {snowball.months % 12}mo
                  </div>
                  <div className="font-mono text-xs text-muted">
                    Interest {fmt(snowball.totalInterest)}
                  </div>
                </div>
                <div
                  className={`rounded-xl border p-4 ${
                    strategy === "avalanche"
                      ? "border-tool-accent bg-tool-accent-soft"
                      : "border-app bg-app"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                      Avalanche
                    </span>
                    {strategy === "avalanche" && (
                      <span className="rounded-md border border-tool-accent bg-app-elevated px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                        active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-app">
                    {Math.floor(avalanche.months / 12)}y {avalanche.months % 12}mo
                  </div>
                  <div className="font-mono text-xs text-secondary">
                    Interest {fmt(avalanche.totalInterest)}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-secondary">
                <span className="font-semibold text-tool-accent">Avalanche</span>{" "}
                saves{" "}
                <span className="font-semibold text-app">
                  {fmt(interestSaved)}
                </span>{" "}
                in interest vs snowball. Pick avalanche if you trust the math; pick
                snowball if you need quick wins to stay motivated.
              </p>
            </ToolCard>
          )}

          <ToolCard title="APR reference" subtitle="Fed G.19, 2024 Q4">
            <ul className="space-y-1.5 text-xs text-secondary">
              {APR_REFERENCE.map((r) => (
                <li
                  key={r.kind}
                  className="flex items-baseline justify-between border-b border-app pb-1.5 last:border-0"
                >
                  <span>{r.kind}</span>
                  <span className="font-mono tabular-nums text-app">
                    {r.apr.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[0.6rem] text-muted">
              US Federal Reserve Consumer Credit G.19 release, Q4 2024. Averages —
              your actual rate depends on issuer and credit.
            </p>
          </ToolCard>

          <p className="text-[0.65rem] leading-relaxed text-muted">
            Assumes fixed APR, fixed minimum payments, interest compounded monthly,
            and extra payment applied on top of all minimums. Doesn&apos;t model
            fees, promo rates, or balance transfers.
          </p>
        </div>

        <ScenarioBar<Inputs>
          slug="debt-payoff"
          state={{ debts, extra, strategy, customOrder }}
          onLoad={(d) => {
            if (d?.debts) setDebts(d.debts);
            if (d?.extra) setExtra(d.extra);
            if (d?.strategy) setStrategy(d.strategy);
            if (d?.customOrder) setCustomOrder(d.customOrder);
          }}
          exports={{
            csv: () =>
              toCsv([
                ["Strategy", "Months", "Interest", "Debt", "Paid-off month", "Interest"],
                ...snowball.perDebt.map((d) => [
                  "Snowball",
                  snowball.months,
                  snowball.totalInterest.toFixed(2),
                  d.name,
                  d.paidOffMonth,
                  d.interestPaid.toFixed(2),
                ]),
                ...avalanche.perDebt.map((d) => [
                  "Avalanche",
                  avalanche.months,
                  avalanche.totalInterest.toFixed(2),
                  d.name,
                  d.paidOffMonth,
                  d.interestPaid.toFixed(2),
                ]),
              ]),
            json: () => ({ debts, extra, strategy, customOrder, snowball, avalanche, custom }),
            markdown: () =>
              `# Debt payoff\n\nTotal balance ${fmt(totalBalance)} · extra ${fmt(extraNum)}/mo\n\n| Strategy | Payoff | Interest |\n|---|---|---|\n| Snowball | ${snowball.months} mo | ${fmt(snowball.totalInterest)} |\n| Avalanche | ${avalanche.months} mo | ${fmt(avalanche.totalInterest)} |\n\n**Avalanche saves ${fmt(interestSaved)} in interest.**\n`,
          }}
        />
      </ToolShell>
    </div>
  );
}

// ============================================================================
// Payoff timeline chart — reads --tool-accent at draw time so theme swaps work.
// ============================================================================
function PayoffChart({
  timeline,
  fmt,
}: {
  timeline: { month: number; balance: number }[];
  fmt: (n: number) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = 220;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const cs = getComputedStyle(canvas);
      const accent = cs.getPropertyValue("--tool-accent").trim() || "#6366f1";
      const border = cs.getPropertyValue("--border").trim() || "rgba(127,127,127,0.2)";
      const muted = cs.getPropertyValue("--text-muted").trim() || "rgba(127,127,127,0.6)";

      const pad = { l: 56, r: 14, t: 14, b: 28 };
      const innerW = w - pad.l - pad.r;
      const innerH = h - pad.t - pad.b;

      const maxMonth = Math.max(1, timeline[timeline.length - 1].month);
      const maxBal = Math.max(1, ...timeline.map((p) => p.balance));

      // axes
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + innerH);
      ctx.lineTo(pad.l + innerW, pad.t + innerH);
      ctx.stroke();

      // gridlines + y labels (4 ticks)
      ctx.fillStyle = muted;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + (innerH * i) / 4;
        const value = maxBal * (1 - i / 4);
        ctx.strokeStyle = border;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + innerW, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(fmt(value), pad.l - 6, y);
      }

      // x labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xTicks = Math.min(6, maxMonth);
      for (let i = 0; i <= xTicks; i++) {
        const m = Math.round((maxMonth * i) / xTicks);
        const x = pad.l + (innerW * i) / xTicks;
        ctx.fillText(`${m}mo`, x, pad.t + innerH + 6);
      }

      // area fill
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + innerH);
      timeline.forEach((p) => {
        const x = pad.l + (p.month / maxMonth) * innerW;
        const y = pad.t + innerH - (p.balance / maxBal) * innerH;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(pad.l + innerW, pad.t + innerH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + innerH);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.globalAlpha = 1;

      // line
      ctx.beginPath();
      timeline.forEach((p, i) => {
        const x = pad.l + (p.month / maxMonth) * innerW;
        const y = pad.t + innerH - (p.balance / maxBal) * innerH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [timeline, fmt]);

  return (
    <div className="rounded-xl border border-app bg-app p-3">
      <canvas ref={canvasRef} />
    </div>
  );
}
