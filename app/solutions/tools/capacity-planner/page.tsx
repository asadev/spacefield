"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

interface Service {
  id: string;
  name: string;
  currentLoad: number;
  unit: string; // RPS, users, etc.
  growthPct: number; // monthly %
  capacity: number;
  headroomMultiplier: number; // e.g. 2 = 2x peak
  // elastic cost model (monthly $):
  computePerUnit?: number; // compute cost per load-unit per month
  storagePerUnit?: number; // storage cost per load-unit per month
  networkPerUnit?: number; // network/egress cost per load-unit per month
  peakToSteadyRatio?: number; // how much the peak is above steady-state
}

const LS_KEY = "solutions:capacity-planner:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultServices(): Service[] {
  return [
    {
      id: uid(),
      name: "API",
      currentLoad: 500,
      unit: "RPS",
      growthPct: 8,
      capacity: 1500,
      headroomMultiplier: 2,
      computePerUnit: 0.25,
      storagePerUnit: 0.05,
      networkPerUnit: 0.1,
      peakToSteadyRatio: 2.0,
    },
    {
      id: uid(),
      name: "Database",
      currentLoad: 250,
      unit: "qps",
      growthPct: 12,
      capacity: 1000,
      headroomMultiplier: 2.5,
      computePerUnit: 0.8,
      storagePerUnit: 0.4,
      networkPerUnit: 0.05,
      peakToSteadyRatio: 1.5,
    },
  ];
}

function elasticCost(svc: Service, load: number) {
  const c = svc.computePerUnit || 0;
  const s = svc.storagePerUnit || 0;
  const n = svc.networkPerUnit || 0;
  const compute = c * load;
  const storage = s * load;
  const network = n * load;
  const total = compute + storage + network;
  return { compute, storage, network, total };
}

function projectedLoad(
  current: number,
  monthlyPct: number,
  months: number
): number {
  const r = 1 + monthlyPct / 100;
  return current * Math.pow(r, months);
}

function monthsToLimit(svc: Service): number {
  if (svc.growthPct <= 0) return Infinity;
  const target = svc.capacity / svc.headroomMultiplier;
  if (svc.currentLoad >= target) return 0;
  const r = 1 + svc.growthPct / 100;
  return Math.log(target / svc.currentLoad) / Math.log(r);
}

type SprintKey = "now" | "m3" | "m6" | "m12";
type ViewMode = "grid" | "detail";

export default function CapacityPlannerPage() {
  const [services, setServices] = useState<Service[]>(defaultServices());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setServices(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(services));
    } catch {}
  }, [services, hydrated]);

  const rows = useMemo(
    () =>
      services.map((s) => ({
        svc: s,
        m3: projectedLoad(s.currentLoad, s.growthPct, 3),
        m6: projectedLoad(s.currentLoad, s.growthPct, 6),
        m12: projectedLoad(s.currentLoad, s.growthPct, 12),
        required12: projectedLoad(s.currentLoad, s.growthPct, 12) *
          s.headroomMultiplier,
        monthsLeft: monthsToLimit(s),
      })),
    [services]
  );

  const earliest = useMemo(() => {
    const finite = rows.filter((r) => isFinite(r.monthsLeft));
    if (finite.length === 0) return null;
    return finite.sort((a, b) => a.monthsLeft - b.monthsLeft)[0];
  }, [rows]);

  // Allocation grid summary chips: total capacity, available headroom (now), over-allocated count
  const totalCapacity = useMemo(
    () => services.reduce((acc, s) => acc + s.capacity, 0),
    [services]
  );
  const availableNow = useMemo(
    () =>
      services.reduce(
        (acc, s) => acc + Math.max(0, s.capacity - s.currentLoad * s.headroomMultiplier),
        0
      ),
    [services]
  );
  const overAllocated = useMemo(
    () =>
      services.filter((s) => s.currentLoad * s.headroomMultiplier > s.capacity).length,
    [services]
  );

  // Utilization helpers — sprint columns reuse projectedLoad math.
  const sprints: { key: SprintKey; label: string; sub: string }[] = [
    { key: "now", label: "Now", sub: "S0" },
    { key: "m3", label: "+3 mo", sub: "S1" },
    { key: "m6", label: "+6 mo", sub: "S2" },
    { key: "m12", label: "+12 mo", sub: "S3" },
  ];

  function utilFor(s: Service, key: SprintKey) {
    const base =
      key === "now"
        ? s.currentLoad
        : key === "m3"
        ? projectedLoad(s.currentLoad, s.growthPct, 3)
        : key === "m6"
        ? projectedLoad(s.currentLoad, s.growthPct, 6)
        : projectedLoad(s.currentLoad, s.growthPct, 12);
    const required = base * s.headroomMultiplier;
    const pct = s.capacity > 0 ? (required / s.capacity) * 100 : 0;
    return { base, required, pct };
  }

  function utilTone(pct: number) {
    if (pct > 100)
      return {
        bar: "bg-rose-500",
        text: "text-rose-400",
        wash: "bg-rose-500/[0.06]",
      };
    if (pct >= 80)
      return {
        bar: "bg-amber-400",
        text: "text-amber-400",
        wash: "bg-amber-500/[0.05]",
      };
    return {
      bar: "bg-emerald-500",
      text: "text-emerald-400",
      wash: "bg-emerald-500/[0.04]",
    };
  }

  return (
    <div data-tool-theme="productivity" data-tool="capacity-planner">
      <ToolShell
        category="Support & Ops"
        title="Capacity Planner"
        description="Project load 3/6/12 months out. Compute required capacity and months until you hit your headroom ceiling."
      >
        {/* Hero — summary header with allocation chips */}
        <div className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-app px-6 py-5 sm:px-8">
          <div className="absolute inset-0 -z-10 opacity-50 [background-image:radial-gradient(circle_at_85%_-10%,var(--tool-accent-soft),transparent_55%)]" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent-soft ring-1 ring-[color:var(--tool-accent-ring)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tool-accent">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </span>
              <div>
                <div className="text-sm font-semibold text-app">Resource allocation</div>
                <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  {services.length} {services.length === 1 ? "service" : "services"} · 4 sprint horizons
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--tool-accent-ring)] bg-tool-accent-soft px-3 py-1 text-[0.7rem] font-medium text-tool-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Total {totalCapacity.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/[0.08] px-3 py-1 text-[0.7rem] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Available {availableNow.toLocaleString()}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-medium ${
                  overAllocated > 0
                    ? "border-rose-400/40 bg-rose-500/[0.10] text-rose-400"
                    : "border-app bg-app-elevated text-muted"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${overAllocated > 0 ? "bg-rose-400" : "bg-[color:var(--text-muted)]"}`} />
                {overAllocated} over-allocated
              </span>
              {earliest && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/[0.08] px-3 py-1 text-[0.7rem] font-medium text-amber-400">
                  First ceiling: {earliest.svc.name} · {earliest.monthsLeft.toFixed(1)} mo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sub-tabs — state buttons */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-app bg-app-elevated p-0.5 text-[0.65rem] uppercase tracking-[0.18em]">
            {(["grid", "detail"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 transition ${
                  view === v
                    ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
                    : "text-secondary hover:text-app"
                }`}
              >
                {v === "grid" ? "Sprint grid" : "Service detail"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setServices([
                ...services,
                {
                  id: uid(),
                  name: "New service",
                  currentLoad: 100,
                  unit: "req/s",
                  growthPct: 5,
                  capacity: 500,
                  headroomMultiplier: 2,
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-tool-accent bg-tool-accent-soft px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent transition hover:brightness-110"
          >
            <span className="text-base leading-none">+</span> Service
          </button>
        </div>

        {/* Allocation grid — sprints (cols) × services (rows) */}
        {view === "grid" && (
          <section className="mb-6 overflow-hidden rounded-2xl border border-app bg-app-elevated">
            <div className="grid grid-cols-[minmax(160px,1.4fr)_repeat(4,minmax(120px,1fr))_minmax(110px,0.8fr)] items-stretch border-b border-app bg-surface px-4 py-2.5 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <div>Service</div>
              {sprints.map((sp) => (
                <div key={sp.key} className="text-center">
                  <div className="text-tool-accent">{sp.sub}</div>
                  <div className="mt-0.5 text-[0.55rem] tracking-[0.16em] text-faint">{sp.label}</div>
                </div>
              ))}
              <div className="text-right">Headroom</div>
            </div>

            <div className="divide-y divide-[color:var(--border)]">
              {services.map((s) => {
                const row = rows.find((r) => r.svc.id === s.id)!;
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-[minmax(160px,1.4fr)_repeat(4,minmax(120px,1fr))_minmax(110px,0.8fr)] items-center gap-x-2 px-4 py-3 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-sm font-semibold text-app">
                        {s.name || "(service)"}
                      </div>
                      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                        Cap {s.capacity.toLocaleString()} {s.unit}
                      </div>
                    </div>
                    {sprints.map((sp) => {
                      const u = utilFor(s, sp.key);
                      const tone = utilTone(u.pct);
                      const width = Math.min(100, u.pct);
                      const overflow = u.pct > 100 ? Math.min(100, u.pct - 100) : 0;
                      return (
                        <div
                          key={sp.key}
                          className={`relative rounded-lg border border-app ${tone.wash} px-2 py-2`}
                        >
                          <div className={`flex items-baseline justify-between gap-1 text-[0.6rem] font-medium ${tone.text}`}>
                            <span className="font-mono tabular-nums">{u.pct.toFixed(0)}%</span>
                            <span className="font-mono text-[0.55rem] tabular-nums text-muted">
                              {u.required.toFixed(0)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-app">
                            <div
                              className={`h-full ${tone.bar} transition-[width] duration-300`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          {overflow > 0 && (
                            <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-rose-900/30">
                              <div
                                className="h-full bg-rose-400"
                                style={{ width: `${overflow}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="text-right">
                      <div className="font-mono text-sm tabular-nums text-tool-accent">
                        {isFinite(row.monthsLeft) ? `${row.monthsLeft.toFixed(1)}mo` : "—"}
                      </div>
                      <div className="text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                        to ceiling
                      </div>
                    </div>
                  </div>
                );
              })}
              {services.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-muted">
                  No services yet. Add one to populate the grid.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-app bg-surface px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-3 text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-3 rounded-full bg-emerald-500" /> &lt; 80%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-3 rounded-full bg-amber-400" /> 80–100%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-3 rounded-full bg-rose-500" /> &gt; 100%
                </span>
              </div>
            </div>
          </section>
        )}

        {view === "detail" && (
          <div className="space-y-4">
            {services.map((s) => {
              const row = rows.find((r) => r.svc.id === s.id)!;
              const urgency =
                row.monthsLeft < 3
                  ? "rose"
                  : row.monthsLeft < 6
                  ? "amber"
                  : "emerald";
              const urgencyCls = {
                rose: "border-rose-400/30 bg-rose-500/[0.08] text-rose-400",
                amber: "border-amber-400/30 bg-amber-500/[0.08] text-amber-400",
                emerald:
                  "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-400",
              }[urgency];

              return (
                <ToolCard
                  key={s.id}
                  title={s.name || "(service)"}
                  subtitle={`Current ${s.currentLoad.toLocaleString()} ${s.unit} · Cap ${s.capacity.toLocaleString()} ${s.unit}`}
                >
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
                    <Field label="Service">
                      <input
                        value={s.name}
                        onChange={(e) =>
                          setServices(
                            services.map((x) =>
                              x.id === s.id ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Current load">
                      <input
                        type="number"
                        value={s.currentLoad}
                        onChange={(e) =>
                          setServices(
                            services.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    currentLoad: Number(e.target.value) || 0,
                                  }
                                : x
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Unit">
                      <input
                        value={s.unit}
                        onChange={(e) =>
                          setServices(
                            services.map((x) =>
                              x.id === s.id ? { ...x, unit: e.target.value } : x
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Growth %/mo">
                      <input
                        type="number"
                        step="0.1"
                        value={s.growthPct}
                        onChange={(e) =>
                          setServices(
                            services.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    growthPct: Number(e.target.value) || 0,
                                  }
                                : x
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Headroom ×">
                      <input
                        type="number"
                        step="0.1"
                        value={s.headroomMultiplier}
                        onChange={(e) =>
                          setServices(
                            services.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    headroomMultiplier:
                                      Number(e.target.value) || 1,
                                  }
                                : x
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <div className="flex items-end">
                      <button
                        onClick={() =>
                          setServices(services.filter((x) => x.id !== s.id))
                        }
                        className="rounded-md border border-app bg-app-elevated px-3 py-2 text-xs text-muted transition-colors hover:border-rose-400/30 hover:text-rose-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Field label="Max capacity">
                      <input
                        type="number"
                        value={s.capacity}
                        onChange={(e) =>
                          setServices(
                            services.map((x) =>
                              x.id === s.id
                                ? { ...x, capacity: Number(e.target.value) || 0 }
                                : x
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="3 months" value={row.m3.toFixed(0)} />
                    <Stat label="6 months" value={row.m6.toFixed(0)} />
                    <Stat label="12 months" value={row.m12.toFixed(0)} />
                    <Stat
                      label="Required 12mo (w/ headroom)"
                      value={row.required12.toFixed(0)}
                      accent
                    />
                  </div>

                  <div
                    className={`mt-4 rounded-md border p-3 text-sm ${urgencyCls}`}
                  >
                    {isFinite(row.monthsLeft)
                      ? row.monthsLeft <= 0
                        ? "Already past headroom target. Scale now."
                        : `~${row.monthsLeft.toFixed(1)} months until load × headroom hits max capacity. Plan capacity work before then.`
                      : "No growth — no timeline pressure."}
                  </div>

                  <div className="mt-5">
                    <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent mb-2">
                      Elastic cost model (per month)
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Field label="$ compute/unit">
                        <input
                          type="number"
                          step="0.01"
                          value={s.computePerUnit ?? 0}
                          onChange={(e) =>
                            setServices(
                              services.map((x) =>
                                x.id === s.id
                                  ? {
                                      ...x,
                                      computePerUnit:
                                        Number(e.target.value) || 0,
                                    }
                                  : x
                              )
                            )
                          }
                          className={inputCls()}
                        />
                      </Field>
                      <Field label="$ storage/unit">
                        <input
                          type="number"
                          step="0.01"
                          value={s.storagePerUnit ?? 0}
                          onChange={(e) =>
                            setServices(
                              services.map((x) =>
                                x.id === s.id
                                  ? {
                                      ...x,
                                      storagePerUnit:
                                        Number(e.target.value) || 0,
                                    }
                                  : x
                              )
                            )
                          }
                          className={inputCls()}
                        />
                      </Field>
                      <Field label="$ network/unit">
                        <input
                          type="number"
                          step="0.01"
                          value={s.networkPerUnit ?? 0}
                          onChange={(e) =>
                            setServices(
                              services.map((x) =>
                                x.id === s.id
                                  ? {
                                      ...x,
                                      networkPerUnit:
                                        Number(e.target.value) || 0,
                                    }
                                  : x
                              )
                            )
                          }
                          className={inputCls()}
                        />
                      </Field>
                      <Field label="Peak × steady">
                        <input
                          type="number"
                          step="0.1"
                          value={s.peakToSteadyRatio ?? 1}
                          onChange={(e) =>
                            setServices(
                              services.map((x) =>
                                x.id === s.id
                                  ? {
                                      ...x,
                                      peakToSteadyRatio:
                                        Number(e.target.value) || 1,
                                    }
                                  : x
                              )
                            )
                          }
                          className={inputCls()}
                        />
                      </Field>
                    </div>

                    {(() => {
                      const steady = elasticCost(s, s.currentLoad);
                      const peak = elasticCost(
                        s,
                        s.currentLoad * (s.peakToSteadyRatio || 1)
                      );
                      const y12 = elasticCost(s, row.m12);
                      return (
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div className="rounded-md border border-app bg-app-elevated p-3">
                            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                              Steady-state $/mo
                            </div>
                            <div className="mt-1 text-lg font-semibold text-app">
                              ${steady.total.toFixed(0)}
                            </div>
                            <div className="mt-1 text-[0.65rem] text-muted">
                              C ${steady.compute.toFixed(0)} · S $
                              {steady.storage.toFixed(0)} · N $
                              {steady.network.toFixed(0)}
                            </div>
                          </div>
                          <div className="rounded-md border border-amber-400/20 bg-amber-500/[0.04] p-3">
                            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-amber-400">
                              Peak $/mo
                            </div>
                            <div className="mt-1 text-lg font-semibold text-amber-400">
                              ${peak.total.toFixed(0)}
                            </div>
                            <div className="mt-1 text-[0.65rem] text-muted">
                              C ${peak.compute.toFixed(0)} · S $
                              {peak.storage.toFixed(0)} · N $
                              {peak.network.toFixed(0)}
                            </div>
                          </div>
                          <div className="rounded-md border border-[color:var(--tool-accent-ring)] bg-tool-accent-soft p-3">
                            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                              Projected 12mo $/mo
                            </div>
                            <div className="mt-1 text-lg font-semibold text-tool-accent">
                              ${y12.total.toFixed(0)}
                            </div>
                            <div className="mt-1 text-[0.65rem] text-muted">
                              C ${y12.compute.toFixed(0)} · S $
                              {y12.storage.toFixed(0)} · N $
                              {y12.network.toFixed(0)}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <p className="mt-2 text-xs text-muted">
                      Compute-Storage-Network split based on your unit costs.
                      Elastic = you pay for peak only when it&apos;s peak. Provision
                      steady-state capacity + reserve pricing; burst to peak on
                      on-demand.
                    </p>
                  </div>
                </ToolCard>
              );
            })}
          </div>
        )}
      </ToolShell>
    </div>
  );
}
