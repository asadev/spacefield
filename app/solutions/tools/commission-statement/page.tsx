"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import {
  COMP_PLAN_TEMPLATES,
  estimateWithholding,
  DEFAULT_FEDERAL_SUPPLEMENTAL_RATE,
  DEFAULT_STATE_SUPPLEMENTAL_RATE,
  DEFAULT_FICA_RATE,
} from "./plans";

interface Deal {
  id: string;
  name: string;
  amount: number;
  closeDate: string;
  rate: number; // %
  rep?: string; // optional for team rollup
}

interface Adj {
  id: string;
  label: string;
  amount: number; // can be negative
}

interface TeamMember {
  id: string;
  name: string;
  quota: number;
  attainment: number;
  grossCommission: number;
}

interface State {
  rep: string;
  period: string;
  quota: number;
  ytdQuota: number;
  ytdAttainment: number;
  deals: Deal[];
  spiffs: Adj[];
  clawbacks: Adj[];
  notes: string;
  compPlanKey?: string;
  team?: TeamMember[];
  showWithholding?: boolean;
  federalRate?: number;
  stateRate?: number;
  ficaRate?: number;
}

const LS_KEY = "solutions:commission-statement:v1";
const MODE_LS_KEY = "solutions:commission-statement:mode:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    rep: "Spacefield",
    period: "2026 Q2",
    quota: 250000,
    ytdQuota: 500000,
    ytdAttainment: 320000,
    deals: [
      {
        id: uid(),
        name: "Acme — expansion",
        amount: 45000,
        closeDate: "2026-04-14",
        rate: 10,
      },
      {
        id: uid(),
        name: "Globex — pilot",
        amount: 12000,
        closeDate: "2026-05-02",
        rate: 10,
      },
      {
        id: uid(),
        name: "Initech — renewal",
        amount: 80000,
        closeDate: "2026-06-18",
        rate: 6,
      },
    ],
    spiffs: [{ id: uid(), label: "Q2 accelerator over-quota", amount: 2500 }],
    clawbacks: [
      { id: uid(), label: "Q1 cancelled deal — Widget Inc.", amount: 900 },
    ],
    notes: "Commission paid in the month after quarter-close.",
    team: [],
    showWithholding: false,
    federalRate: DEFAULT_FEDERAL_SUPPLEMENTAL_RATE,
    stateRate: DEFAULT_STATE_SUPPLEMENTAL_RATE,
    ficaRate: DEFAULT_FICA_RATE,
  };
}

const money = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Stable rep id derived from rep name (deterministic, no randomness on render)
function repId(name: string) {
  const base = (name || "rep")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6)
    .padEnd(3, "X");
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (hash * 31 + (name || "").charCodeAt(i)) >>> 0;
  }
  const num = (hash % 9000) + 1000;
  return `RP-${base}-${num}`;
}

type TabKey = "edit" | "preview" | "export";

export default function CommissionStatementPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Commission Statement"
      description="Generate a per-rep commission statement with deals, SPIFs, and clawbacks. Matches typical AE comp-plan payout format. Print-ready."
    >
      <Inner />
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<TabKey>("edit");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "edit" || m === "preview" || m === "export") setMode(m as TabKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [state, mode, hydrated]);

  const grossCommission = useMemo(
    () => state.deals.reduce((s, d) => s + (d.amount * d.rate) / 100, 0),
    [state.deals]
  );
  const spiffTotal = state.spiffs.reduce((s, x) => s + x.amount, 0);
  const clawbackTotal = state.clawbacks.reduce((s, x) => s + x.amount, 0);
  const net = grossCommission + spiffTotal - clawbackTotal;
  const attainment = state.quota
    ? (state.deals.reduce((s, d) => s + d.amount, 0) / state.quota) * 100
    : 0;
  const ytdAttainmentPct = state.ytdQuota
    ? (state.ytdAttainment / state.ytdQuota) * 100
    : 0;

  const addDeal = () =>
    setState((s) => ({
      ...s,
      deals: [
        ...s.deals,
        {
          id: uid(),
          name: "New deal",
          amount: 0,
          closeDate: new Date().toISOString().slice(0, 10),
          rate: 10,
        },
      ],
    }));

  const updateDeal = (id: string, patch: Partial<Deal>) =>
    setState((s) => ({
      ...s,
      deals: s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));

  const removeDeal = (id: string) =>
    setState((s) => ({ ...s, deals: s.deals.filter((d) => d.id !== id) }));

  const addAdj = (kind: "spiffs" | "clawbacks") =>
    setState((s) => ({
      ...s,
      [kind]: [
        ...s[kind],
        { id: uid(), label: "New", amount: 0 } as Adj,
      ],
    }));

  const updateAdj = (
    kind: "spiffs" | "clawbacks",
    id: string,
    patch: Partial<Adj>
  ) =>
    setState((s) => ({
      ...s,
      [kind]: s[kind].map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const removeAdj = (kind: "spiffs" | "clawbacks", id: string) =>
    setState((s) => ({
      ...s,
      [kind]: s[kind].filter((x) => x.id !== id),
    }));

  const print = () => window.print();

  const rid = repId(state.rep);

  // Severity-style payout chip
  const payoutChip = useMemo(() => {
    if (net <= 0)
      return { label: "ZERO", tone: "border-rose-500/40 bg-rose-500/15 text-rose-500" };
    if (attainment >= 100)
      return { label: "OVER", tone: "border-emerald-500/40 bg-emerald-500/15 text-emerald-500" };
    if (attainment >= 70)
      return { label: "ON TRACK", tone: "border-tool-accent bg-tool-accent-soft text-tool-accent" };
    return { label: "UNDER", tone: "border-amber-500/40 bg-amber-500/15 text-amber-500" };
  }, [net, attainment]);

  const periodSlug = (state.period || "untitled").toLowerCase().replace(/\s+/g, "-");

  return (
    <div data-tool-theme="finance" data-tool="commission-statement">
      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome — payout + rep chips, no dots */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${payoutChip.tone}`}
          >
            {payoutChip.label}
          </span>
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
            {rid}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            commission.statement
            <span className="text-faint">/</span>
            <span className="text-secondary">{periodSlug}.pay</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? "◉ autosaved" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Commission Statement · Payout Ledger
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {state.deals.length} deal{state.deals.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {state.spiffs.length} spiff{state.spiffs.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {state.clawbacks.length} clawback{state.clawbacks.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  value={state.rep}
                  onChange={(e) => setState({ ...state, rep: e.target.value })}
                  placeholder="Rep name"
                  className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                />
                <input
                  value={state.period}
                  onChange={(e) => setState({ ...state, period: e.target.value })}
                  placeholder="2026 Q2"
                  className="w-full bg-transparent font-mono text-base tracking-tight text-secondary placeholder:text-faint outline-none"
                />
              </div>
            </div>

            {/* attainment dial */}
            <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
              <div className="relative h-12 w-12">
                <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="var(--tool-accent)"
                    strokeWidth="3"
                    strokeDasharray={`${Math.min(attainment, 100)}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                  {attainment.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Attainment
                </div>
                <div className="text-sm font-semibold text-app">
                  {money(state.deals.reduce((s, d) => s + d.amount, 0))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* sub-tab strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2 no-print">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "edit", label: "Edit" },
                { k: "preview", label: "Preview" },
                { k: "export", label: "Export" },
              ] as { k: TabKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  mode === t.k
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={mode === t.k ? { color: "var(--bg)" } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <label className="flex items-center gap-2 rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              <input
                type="checkbox"
                checked={!!state.showWithholding}
                onChange={(e) =>
                  setState({ ...state, showWithholding: e.target.checked })
                }
              />
              Tax estimate
            </label>
            <button
              onClick={print}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Print / PDF
            </button>
          </div>
        </div>
      </section>

      {/* Top stat ribbon */}
      <div className="no-print mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Net commission" value={money(net)} accent />
        <Stat label="Gross" value={money(grossCommission)} />
        <Stat label="Attainment" value={`${attainment.toFixed(0)}%`} />
        <Stat label="YTD" value={`${ytdAttainmentPct.toFixed(0)}%`} />
      </div>

      {mode === "edit" && (
        <>
          {/* Comp plan template picker */}
          <ToolCard
            title="Comp plan template"
            subtitle="Apply a template rate across deals"
            className="mb-6"
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {COMP_PLAN_TEMPLATES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      compPlanKey: p.key,
                      deals: s.deals.map((d) => ({ ...d, rate: p.defaultDealRate })),
                    }));
                  }}
                  title={`${p.description}\nBase: $${p.baseSalary.toLocaleString()} · Variable: $${p.variable.toLocaleString()}\nSource: ${p.source}`}
                  className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                    state.compPlanKey === p.key
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {state.compPlanKey &&
              (() => {
                const p = COMP_PLAN_TEMPLATES.find(
                  (x) => x.key === state.compPlanKey
                );
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-xs text-secondary">
                    <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      {p.role} · OTE ${(p.baseSalary + p.variable).toLocaleString()}
                    </div>
                    <p className="text-app">{p.description}</p>
                    <p className="mt-1">
                      <strong className="text-tool-accent">Accelerators:</strong>{" "}
                      {p.accelerators}
                    </p>
                    <p className="mt-1">
                      <strong className="text-tool-accent">Clawback:</strong>{" "}
                      {p.clawbackRule}
                    </p>
                    <p className="mt-1 font-mono text-[0.55rem] text-faint">
                      Source: {p.source}
                    </p>
                  </div>
                );
              })()}
          </ToolCard>

          {state.showWithholding &&
            (() => {
              const federalRate =
                state.federalRate ?? DEFAULT_FEDERAL_SUPPLEMENTAL_RATE;
              const stateRate = state.stateRate ?? DEFAULT_STATE_SUPPLEMENTAL_RATE;
              const ficaRate = state.ficaRate ?? DEFAULT_FICA_RATE;
              const w = estimateWithholding(net, federalRate, stateRate, ficaRate);
              return (
                <ToolCard
                  title="Estimated tax withholding"
                  subtitle="Supplemental wages — US"
                  className="mb-6"
                >
                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Federal supplemental %">
                      <input
                        type="number"
                        value={federalRate}
                        onChange={(e) =>
                          setState({
                            ...state,
                            federalRate: Number(e.target.value) || 0,
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="State supplemental %">
                      <input
                        type="number"
                        value={stateRate}
                        onChange={(e) =>
                          setState({
                            ...state,
                            stateRate: Number(e.target.value) || 0,
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="FICA %">
                      <input
                        type="number"
                        value={ficaRate}
                        onChange={(e) =>
                          setState({
                            ...state,
                            ficaRate: Number(e.target.value) || 0,
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
                    <Stat label="Gross net comm." value={money(net)} />
                    <Stat label="Federal" value={money(w.federal)} />
                    <Stat label="State" value={money(w.state)} />
                    <Stat label="FICA" value={money(w.fica)} />
                  </div>
                  <div className="mt-3 rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-sm text-app">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                        Estimated take-home
                      </span>
                      <span className="font-mono text-xl font-semibold text-tool-accent tabular-nums">
                        {money(w.net)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Not tax advice. US federal supplemental rate is 22% on
                      commissions up to $1M/yr (IRS). State rates vary — this uses a
                      5% rough median. Check your own state and paystub.
                    </p>
                  </div>
                </ToolCard>
              );
            })()}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ToolCard title="Rep & period" subtitle="Identifiers">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Rep">
                  <input
                    value={state.rep}
                    onChange={(e) => setState({ ...state, rep: e.target.value })}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Period">
                  <input
                    value={state.period}
                    onChange={(e) =>
                      setState({ ...state, period: e.target.value })
                    }
                    className={inputCls()}
                  />
                </Field>
                <Field label="Period quota">
                  <input
                    type="number"
                    value={state.quota}
                    onChange={(e) =>
                      setState({ ...state, quota: Number(e.target.value) || 0 })
                    }
                    className={inputCls()}
                  />
                </Field>
                <Field label="YTD quota">
                  <input
                    type="number"
                    value={state.ytdQuota}
                    onChange={(e) =>
                      setState({ ...state, ytdQuota: Number(e.target.value) || 0 })
                    }
                    className={inputCls()}
                  />
                </Field>
                <Field label="YTD attainment">
                  <input
                    type="number"
                    value={state.ytdAttainment}
                    onChange={(e) =>
                      setState({
                        ...state,
                        ytdAttainment: Number(e.target.value) || 0,
                      })
                    }
                    className={inputCls()}
                  />
                </Field>
                <Field label="Notes">
                  <input
                    value={state.notes}
                    onChange={(e) => setState({ ...state, notes: e.target.value })}
                    className={inputCls()}
                  />
                </Field>
              </div>
            </ToolCard>

            <ToolCard title="SPIFs & clawbacks" subtitle="Adjustments">
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                    SPIFs · accelerators
                  </div>
                  <button
                    onClick={() => addAdj("spiffs")}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    + Spiff
                  </button>
                </div>
                {state.spiffs.map((x) => (
                  <div key={x.id} className="mb-2 grid grid-cols-[2fr_1fr_auto] gap-2">
                    <input
                      value={x.label}
                      onChange={(e) =>
                        updateAdj("spiffs", x.id, { label: e.target.value })
                      }
                      className={inputCls()}
                    />
                    <input
                      type="number"
                      value={x.amount}
                      onChange={(e) =>
                        updateAdj("spiffs", x.id, {
                          amount: Number(e.target.value) || 0,
                        })
                      }
                      className={`${inputCls()} text-right font-mono tabular-nums`}
                    />
                    <button
                      onClick={() => removeAdj("spiffs", x.id)}
                      className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove SPIF"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-rose-500">
                    Clawbacks
                  </div>
                  <button
                    onClick={() => addAdj("clawbacks")}
                    className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
                  >
                    + Clawback
                  </button>
                </div>
                {state.clawbacks.map((x) => (
                  <div key={x.id} className="mb-2 grid grid-cols-[2fr_1fr_auto] gap-2">
                    <input
                      value={x.label}
                      onChange={(e) =>
                        updateAdj("clawbacks", x.id, { label: e.target.value })
                      }
                      className={inputCls()}
                    />
                    <input
                      type="number"
                      value={x.amount}
                      onChange={(e) =>
                        updateAdj("clawbacks", x.id, {
                          amount: Number(e.target.value) || 0,
                        })
                      }
                      className={`${inputCls()} text-right font-mono tabular-nums`}
                    />
                    <button
                      onClick={() => removeAdj("clawbacks", x.id)}
                      className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove clawback"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </ToolCard>
          </div>

          <div className="mt-6">
            <ToolCard title="Deals in period" subtitle="Closed bookings">
              <div className="mb-3 flex justify-end">
                <button
                  onClick={addDeal}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + Deal
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-app font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                      <th className="p-2 text-left">Deal</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2 text-right">Rate %</th>
                      <th className="p-2 text-right">Date</th>
                      <th className="p-2 text-right">Commission</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.deals.map((d) => (
                      <tr key={d.id} className="border-b border-app">
                        <td className="p-1">
                          <input
                            value={d.name}
                            onChange={(e) =>
                              updateDeal(d.id, { name: e.target.value })
                            }
                            className={inputCls()}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            value={d.amount}
                            onChange={(e) =>
                              updateDeal(d.id, { amount: Number(e.target.value) || 0 })
                            }
                            className={`${inputCls()} text-right font-mono tabular-nums`}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            value={d.rate}
                            onChange={(e) =>
                              updateDeal(d.id, { rate: Number(e.target.value) || 0 })
                            }
                            className={`${inputCls()} text-right font-mono tabular-nums`}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="date"
                            value={d.closeDate}
                            onChange={(e) =>
                              updateDeal(d.id, { closeDate: e.target.value })
                            }
                            className={inputCls()}
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-medium text-tool-accent tabular-nums">
                          {money((d.amount * d.rate) / 100)}
                        </td>
                        <td className="p-1">
                          <button
                            onClick={() => removeDeal(d.id)}
                            className="rounded-md border border-app px-2 py-1 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                            aria-label="Remove deal"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolCard>
          </div>

          {/* Team roll-up */}
          <div className="mt-6">
            <ToolCard title="Team roll-up" subtitle="Multi-rep summary">
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      team: [
                        ...(s.team || []),
                        {
                          id: uid(),
                          name: "New rep",
                          quota: 250000,
                          attainment: 0,
                          grossCommission: 0,
                        },
                      ],
                    }))
                  }
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + Team member
                </button>
              </div>
              {(state.team?.length || 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                  Add teammates to roll up commission across a team.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-app font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                        <th className="p-2 text-left">Rep</th>
                        <th className="p-2 text-right">Quota</th>
                        <th className="p-2 text-right">Attainment</th>
                        <th className="p-2 text-right">Attain %</th>
                        <th className="p-2 text-right">Gross commission</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(state.team || []).map((m) => {
                        const attainPct = m.quota
                          ? (m.attainment / m.quota) * 100
                          : 0;
                        return (
                          <tr key={m.id} className="border-b border-app">
                            <td className="p-1">
                              <input
                                value={m.name}
                                onChange={(e) =>
                                  setState((s) => ({
                                    ...s,
                                    team: (s.team || []).map((x) =>
                                      x.id === m.id
                                        ? { ...x, name: e.target.value }
                                        : x
                                    ),
                                  }))
                                }
                                className={inputCls()}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={m.quota}
                                onChange={(e) =>
                                  setState((s) => ({
                                    ...s,
                                    team: (s.team || []).map((x) =>
                                      x.id === m.id
                                        ? { ...x, quota: Number(e.target.value) || 0 }
                                        : x
                                    ),
                                  }))
                                }
                                className={`${inputCls()} text-right font-mono tabular-nums`}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={m.attainment}
                                onChange={(e) =>
                                  setState((s) => ({
                                    ...s,
                                    team: (s.team || []).map((x) =>
                                      x.id === m.id
                                        ? {
                                            ...x,
                                            attainment: Number(e.target.value) || 0,
                                          }
                                        : x
                                    ),
                                  }))
                                }
                                className={`${inputCls()} text-right font-mono tabular-nums`}
                              />
                            </td>
                            <td className="p-2 text-right font-mono text-xs text-secondary tabular-nums">
                              {attainPct.toFixed(0)}%
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={m.grossCommission}
                                onChange={(e) =>
                                  setState((s) => ({
                                    ...s,
                                    team: (s.team || []).map((x) =>
                                      x.id === m.id
                                        ? {
                                            ...x,
                                            grossCommission:
                                              Number(e.target.value) || 0,
                                          }
                                        : x
                                    ),
                                  }))
                                }
                                className={`${inputCls()} text-right font-mono tabular-nums`}
                              />
                            </td>
                            <td className="p-1">
                              <button
                                onClick={() =>
                                  setState((s) => ({
                                    ...s,
                                    team: (s.team || []).filter((x) => x.id !== m.id),
                                  }))
                                }
                                className="rounded-md border border-app px-2 py-1 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                                aria-label="Remove team member"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-app">
                        <td className="p-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                          Team total
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-app tabular-nums">
                          {money(
                            (state.team || []).reduce((s, x) => s + x.quota, 0)
                          )}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-app tabular-nums">
                          {money(
                            (state.team || []).reduce(
                              (s, x) => s + x.attainment,
                              0
                            )
                          )}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-app tabular-nums">
                          {(() => {
                            const totQ =
                              (state.team || []).reduce((s, x) => s + x.quota, 0) ||
                              0;
                            const totA = (state.team || []).reduce(
                              (s, x) => s + x.attainment,
                              0
                            );
                            const pct = totQ ? (totA / totQ) * 100 : 0;
                            return `${pct.toFixed(0)}%`;
                          })()}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-tool-accent tabular-nums">
                          {money(
                            (state.team || []).reduce(
                              (s, x) => s + x.grossCommission,
                              0
                            )
                          )}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </ToolCard>
          </div>
        </>
      )}

      {/* Print-ready statement — preview / export modes */}
      {(mode === "preview" || mode === "export") && (
        <StatementPreview
          state={state}
          rid={rid}
          attainment={attainment}
          ytdAttainmentPct={ytdAttainmentPct}
          grossCommission={grossCommission}
          spiffTotal={spiffTotal}
          clawbackTotal={clawbackTotal}
          net={net}
        />
      )}

      {/* Always render preview (hidden) for print path when in edit mode */}
      {mode === "edit" && (
        <div className="hidden print:block">
          <StatementPreview
            state={state}
            rid={rid}
            attainment={attainment}
            ytdAttainmentPct={ytdAttainmentPct}
            grossCommission={grossCommission}
            spiffTotal={spiffTotal}
            clawbackTotal={clawbackTotal}
            net={net}
          />
        </div>
      )}
    </div>
  );
}

function StatementPreview({
  state,
  rid,
  attainment,
  ytdAttainmentPct,
  grossCommission,
  spiffTotal,
  clawbackTotal,
  net,
}: {
  state: State;
  rid: string;
  attainment: number;
  ytdAttainmentPct: number;
  grossCommission: number;
  spiffTotal: number;
  clawbackTotal: number;
  net: number;
}) {
  return (
    <div className="statement-print mt-2 overflow-hidden rounded-xl border border-app bg-app-elevated">
      {/* Header band */}
      <div className="border-b border-app bg-app px-8 py-6 sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              Commission Statement
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-app">
              Payout · {state.period}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              Rep ID
            </div>
            <div className="mt-1 font-mono text-sm text-app tabular-nums">{rid}</div>
            <div className="mt-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              Issued
            </div>
            <div className="font-mono text-xs text-secondary tabular-nums">
              {new Date().toISOString().slice(0, 10)}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              Rep
            </div>
            <div className="font-medium text-app">{state.rep}</div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              Period
            </div>
            <div className="font-medium text-app">{state.period}</div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              Attainment
            </div>
            <div className="font-mono font-medium text-app tabular-nums">
              {attainment.toFixed(0)}% of quota
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 sm:p-10">
        {/* Total payout reveal */}
        <div className="mb-8 rounded-xl border border-tool-accent bg-tool-accent-soft p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Total payout (this period)
              </div>
              <div className="mt-1 text-xs text-muted">
                Gross + SPIFs − Clawbacks
              </div>
            </div>
            <div className="font-mono text-4xl font-semibold text-tool-accent tabular-nums sm:text-5xl">
              {money(net)}
            </div>
          </div>
        </div>

        {/* Itemised deal ledger */}
        <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
          Deal ledger
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-app font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <th className="p-2 text-left">Deal</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Tier</th>
                <th className="p-2 text-right">Close date</th>
                <th className="p-2 text-right">Commission</th>
              </tr>
            </thead>
            <tbody>
              {state.deals.map((d) => {
                const tier =
                  d.rate >= 12 ? "ACCEL" : d.rate >= 8 ? "STD" : "BASE";
                return (
                  <tr key={d.id} className="border-b border-app">
                    <td className="p-2 text-app">{d.name}</td>
                    <td className="p-2 text-right font-mono text-app tabular-nums">
                      {money(d.amount)}
                    </td>
                    <td className="p-2 text-right font-mono text-app tabular-nums">
                      {d.rate}%
                    </td>
                    <td className="p-2 text-right font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent">
                      {tier}
                    </td>
                    <td className="p-2 text-right font-mono text-secondary tabular-nums">
                      {d.closeDate}
                    </td>
                    <td className="p-2 text-right font-mono font-medium text-app tabular-nums">
                      {money((d.amount * d.rate) / 100)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-app">
                <td colSpan={5} className="p-2 text-right font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                  Gross commission
                </td>
                <td className="p-2 text-right font-mono font-semibold text-app tabular-nums">
                  {money(grossCommission)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="my-6 border-t border-dashed border-app" />

        {/* Accelerators (SPIFs) + Clawbacks */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Accelerators · SPIFs
              </div>
              <div className="font-mono text-xs text-tool-accent tabular-nums">
                + {money(spiffTotal)}
              </div>
            </div>
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {state.spiffs.map((x) => (
                  <tr key={x.id} className="border-b border-app">
                    <td className="p-1.5 text-app">{x.label}</td>
                    <td className="p-1.5 text-right font-mono text-app tabular-nums">
                      {money(x.amount)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="p-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Subtotal
                  </td>
                  <td className="p-1.5 text-right font-mono font-semibold text-tool-accent tabular-nums">
                    {money(spiffTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-rose-500">
                Clawbacks
              </div>
              <div className="font-mono text-xs text-rose-500 tabular-nums">
                − {money(clawbackTotal)}
              </div>
            </div>
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {state.clawbacks.map((x) => (
                  <tr key={x.id} className="border-b border-app">
                    <td className="p-1.5 text-app">{x.label}</td>
                    <td className="p-1.5 text-right font-mono text-rose-500 tabular-nums">
                      ({money(x.amount)})
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="p-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-rose-500">
                    Subtotal
                  </td>
                  <td className="p-1.5 text-right font-mono font-semibold text-rose-500 tabular-nums">
                    ({money(clawbackTotal)})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="my-6 border-t border-dashed border-app" />

        {/* Net payout summary */}
        <div className="flex items-center justify-between">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            Net payout
          </div>
          <div className="font-mono text-2xl font-semibold text-tool-accent tabular-nums">
            {money(net)}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              YTD attainment
            </div>
            <div className="font-mono text-secondary tabular-nums">
              {money(state.ytdAttainment)} / {money(state.ytdQuota)} (
              {ytdAttainmentPct.toFixed(0)}%)
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              Notes
            </div>
            <div className="text-secondary">{state.notes}</div>
          </div>
        </div>

        {/* Signature row */}
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <div className="border-t border-app pt-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              Rep signature
            </div>
            <div className="text-xs text-faint">{state.rep}</div>
          </div>
          <div>
            <div className="border-t border-app pt-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              Manager
            </div>
            <div className="text-xs text-faint">Approved by</div>
          </div>
          <div>
            <div className="border-t border-app pt-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              Finance / payroll
            </div>
            <div className="text-xs text-faint">Released for payment</div>
          </div>
        </div>
      </div>
    </div>
  );
}
