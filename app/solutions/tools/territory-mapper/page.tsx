"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";
import { US_STATES, resolveToState } from "./us-states";

interface Territory {
  id: string;
  name: string;
  rep: string;
  coverage: string; // comma-separated zips/cities
  capacity?: number; // accounts a rep can reasonably cover
}

interface State {
  territories: Territory[];
  universe: string; // comma-separated coverage the business targets
  viewMode?: "list" | "heatmap" | "capacity";
}

const LS_KEY = "solutions:territory-mapper:v1";
const VIEW_LS_KEY = "solutions:territory-mapper:view:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    universe:
      "10001, 10002, 10003, 10004, 10005, 90001, 90002, 90003, 60601, 60602, 60603",
    territories: [
      {
        id: uid(),
        name: "NYC North",
        rep: "Asad",
        coverage: "10001, 10002, 10003",
      },
      {
        id: uid(),
        name: "LA",
        rep: "Jane",
        coverage: "90001, 90002",
      },
    ],
  };
}

function parseList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function escapeCsv(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// Schematic US grid layout (col, row) — based on common "tile-grid" US map pattern.
const STATE_GRID: Record<string, [number, number]> = {
  AK: [0, 0], ME: [10, 0],
  VT: [9, 1], NH: [10, 1],
  WA: [1, 1], ID: [2, 1], MT: [3, 1], ND: [4, 1], MN: [5, 1], WI: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2], RI: [10, 3],
  OR: [1, 2], UT: [2, 2], WY: [3, 2], SD: [4, 2], IA: [5, 2], OH: [8, 3], PA: [9, 3], NJ: [10, 4], CT: [10, 4],
  CA: [1, 3], NV: [2, 3], CO: [3, 3], NE: [4, 3], MO: [5, 3], IL: [6, 3], IN: [7, 3], WV: [8, 4], VA: [9, 4], MD: [10, 5], DC: [10, 5], DE: [10, 5],
  AZ: [2, 4], NM: [3, 4], KS: [4, 4], AR: [5, 4], KY: [6, 4], TN: [7, 4], NC: [8, 5],
  HI: [1, 5], OK: [4, 5], LA: [5, 5], MS: [6, 5], AL: [7, 5], GA: [8, 5], SC: [9, 5],
  TX: [3, 5], FL: [9, 6],
};

// Rep accent ramp — opacity steps over the tool accent variable, plus a few semantic distinct hues
// for visual differentiation when many reps coexist.
const REP_RAMP = [
  { bg: "color-mix(in srgb, var(--tool-accent) 55%, transparent)", ring: "var(--tool-accent)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 40%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 80%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 30%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 65%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 22%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 50%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 16%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 40%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 12%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 30%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 9%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 22%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 7%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 18%, white)" },
];

function repColor(rep: string, reps: string[]) {
  const idx = reps.indexOf(rep);
  if (idx < 0)
    return {
      bg: "color-mix(in srgb, var(--text-muted) 12%, transparent)",
      ring: "color-mix(in srgb, var(--text-muted) 35%, transparent)",
    };
  return REP_RAMP[idx % REP_RAMP.length];
}

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ViewKey = "map" | "table" | "balance";

export default function TerritoryMapperPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Territory Mapper"
      description="Assign regions or ZIP codes to reps. Flags overlapping territories and uncovered zones. Export the final assignment as CSV."
    >
      <Inner />
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewKey>("map");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
      const v = localStorage.getItem(VIEW_LS_KEY);
      if (v === "map" || v === "table" || v === "balance") setView(v);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {}
  }, [state, view, hydrated]);

  const analysis = useMemo(() => {
    const universe = new Set(parseList(state.universe));
    const coverageMap = new Map<string, string[]>(); // zip → territories
    state.territories.forEach((t) => {
      parseList(t.coverage).forEach((z) => {
        const arr = coverageMap.get(z) || [];
        arr.push(t.name || "(unnamed)");
        coverageMap.set(z, arr);
      });
    });

    const overlaps: { zip: string; territories: string[] }[] = [];
    coverageMap.forEach((terrs, zip) => {
      if (terrs.length > 1) overlaps.push({ zip, territories: terrs });
    });

    const covered = new Set(Array.from(coverageMap.keys()));
    const uncovered = Array.from(universe).filter((z) => !covered.has(z));
    const outsideUniverse = Array.from(coverageMap.keys()).filter(
      (z) => !universe.has(z)
    );

    // State heatmap: accounts per state across all territories
    const byState = new Map<string, number>();
    state.territories.forEach((t) => {
      parseList(t.coverage).forEach((item) => {
        const info = resolveToState(item);
        if (info) byState.set(info.code, (byState.get(info.code) || 0) + 1);
      });
    });

    return {
      overlaps,
      uncovered,
      outsideUniverse,
      coverageMap,
      universe,
      byState,
    };
  }, [state]);

  const repCapacity = useMemo(() => {
    const map = new Map<
      string,
      { rep: string; assigned: number; capacity: number; territories: string[] }
    >();
    state.territories.forEach((t) => {
      if (!t.rep) return;
      const cur = map.get(t.rep) || {
        rep: t.rep,
        assigned: 0,
        capacity: 0,
        territories: [],
      };
      cur.assigned += parseList(t.coverage).length;
      cur.capacity += t.capacity || 0;
      cur.territories.push(t.name || "(unnamed)");
      map.set(t.rep, cur);
    });
    return Array.from(map.values());
  }, [state.territories]);

  // Map rep -> primary state codes (which states they "own" via coverage).
  const repsList = useMemo(
    () =>
      Array.from(
        new Set(state.territories.map((t) => t.rep).filter(Boolean))
      ),
    [state.territories]
  );

  const stateOwners = useMemo(() => {
    // For each US state, find the rep with the most assigned items there.
    const map = new Map<string, Map<string, number>>(); // state -> rep -> count
    state.territories.forEach((t) => {
      if (!t.rep) return;
      parseList(t.coverage).forEach((item) => {
        const info = resolveToState(item);
        if (!info) return;
        const inner = map.get(info.code) || new Map();
        inner.set(t.rep, (inner.get(t.rep) || 0) + 1);
        map.set(info.code, inner);
      });
    });
    const owner = new Map<string, { rep: string; count: number }>();
    map.forEach((reps, code) => {
      let top: { rep: string; count: number } | null = null;
      reps.forEach((c, rep) => {
        if (!top || c > top.count) top = { rep, count: c };
      });
      if (top) owner.set(code, top);
    });
    return owner;
  }, [state.territories]);

  // Per-territory marker: position at owned state centroid, size by capacity.
  const territoryMarkers = useMemo(() => {
    const maxCap = Math.max(
      1,
      ...state.territories.map((t) => t.capacity || 0)
    );
    return state.territories
      .map((t) => {
        const items = parseList(t.coverage);
        const stateCounts = new Map<string, number>();
        items.forEach((it) => {
          const info = resolveToState(it);
          if (info) {
            stateCounts.set(info.code, (stateCounts.get(info.code) || 0) + 1);
          }
        });
        let primary: string | null = null;
        let max = 0;
        stateCounts.forEach((c, code) => {
          if (c > max) {
            primary = code;
            max = c;
          }
        });
        if (!primary || !STATE_GRID[primary]) return null;
        const [col, row] = STATE_GRID[primary];
        const cap = t.capacity || items.length;
        const r = 6 + (cap / maxCap) * 14;
        return {
          id: t.id,
          name: t.name,
          rep: t.rep,
          col,
          row,
          radius: r,
          capacity: cap,
          items: items.length,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      rep: string;
      col: number;
      row: number;
      radius: number;
      capacity: number;
      items: number;
    }>;
  }, [state.territories]);

  const addTerritory = () => {
    setState((s) => ({
      ...s,
      territories: [
        ...s.territories,
        { id: uid(), name: "New territory", rep: "", coverage: "" },
      ],
    }));
  };

  const update = (id: string, patch: Partial<Territory>) =>
    setState((s) => ({
      ...s,
      territories: s.territories.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    }));

  const remove = (id: string) =>
    setState((s) => ({
      ...s,
      territories: s.territories.filter((t) => t.id !== id),
    }));

  const exportCsv = () => {
    const rows = ["territory,rep,zip"];
    state.territories.forEach((t) => {
      parseList(t.coverage).forEach((z) => {
        rows.push([t.name, t.rep, z].map(escapeCsv).join(","));
      });
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "territories.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Map dimensions
  const COLS = 11;
  const ROWS = 7;
  const CELL = 44;
  const PAD = 12;
  const SVG_W = COLS * CELL + PAD * 2;
  const SVG_H = ROWS * CELL + PAD * 2;

  return (
    <div data-tool-theme="sales" data-tool="territory-mapper" className="space-y-6">
      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            Sales · Territory designer
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            territory.assignment
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {state.territories.length} territor{state.territories.length === 1 ? "y" : "ies"}
            </span>
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
                Coverage map · Capacity balancer · Account-rep assignment
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                Territory Mapper
              </h2>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Assign regions to reps, watch overlaps and gaps, and balance
                load against capacity. Real ZIP-to-state mapping powers the
                schematic.
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                onClick={exportCsv}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Export CSV
              </button>
              <button
                onClick={addTerritory}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                + Territory
              </button>
            </div>
          </div>

          {/* Big number band */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-app pt-5 sm:grid-cols-5">
            <BigNum label="Territories" value={String(state.territories.length)} accent />
            <BigNum label="Reps" value={String(repsList.length)} />
            <BigNum
              label="Overlaps"
              value={String(analysis.overlaps.length)}
              tone={analysis.overlaps.length > 0 ? "warn" : undefined}
            />
            <BigNum
              label="Uncovered"
              value={String(analysis.uncovered.length)}
              tone={analysis.uncovered.length > 0 ? "warn" : undefined}
            />
            <BigNum label="Outside" value={String(analysis.outsideUniverse.length)} />
          </div>
        </div>

        {/* segmented view tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "map", label: "Map" },
                { k: "table", label: "Table" },
                { k: "balance", label: "Balance" },
              ] as { k: ViewKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  view === t.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            {analysis.byState.size} states · {territoryMarkers.length} markers
          </div>
        </div>
      </section>

      {/* ============================== MAP VIEW ============================== */}
      {view === "map" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
          {/* Schematic territory map */}
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                  Coverage map
                </div>
                <div className="mt-1 text-lg font-semibold text-app">
                  {analysis.byState.size} states · {territoryMarkers.length} markers
                </div>
              </div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                Marker size = capacity
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-app bg-app p-3">
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="h-auto w-full"
                role="img"
                aria-label="Schematic US territory map"
              >
                {/* state cells */}
                {US_STATES.map((s) => {
                  const pos = STATE_GRID[s.code];
                  if (!pos) return null;
                  const [col, row] = pos;
                  const x = PAD + col * CELL;
                  const y = PAD + row * CELL;
                  const owner = stateOwners.get(s.code);
                  const color = owner
                    ? repColor(owner.rep, repsList)
                    : {
                        bg: "color-mix(in srgb, var(--text-muted) 8%, transparent)",
                        ring: "color-mix(in srgb, var(--text-muted) 18%, transparent)",
                      };
                  const inUniverse = analysis.byState.has(s.code);
                  return (
                    <g key={s.code}>
                      <rect
                        x={x}
                        y={y}
                        width={CELL - 4}
                        height={CELL - 4}
                        rx={6}
                        fill={color.bg}
                        stroke={color.ring}
                        strokeWidth={inUniverse ? 1.2 : 0.6}
                      />
                      <text
                        x={x + (CELL - 4) / 2}
                        y={y + (CELL - 4) / 2 + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill="var(--text)"
                      >
                        {s.code}
                      </text>
                      {inUniverse && (
                        <text
                          x={x + (CELL - 4) / 2}
                          y={y + (CELL - 4) - 5}
                          textAnchor="middle"
                          fontSize={8}
                          fill="var(--text-muted)"
                        >
                          {analysis.byState.get(s.code)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* deal-value markers (one per territory) */}
                {territoryMarkers.map((m) => {
                  const x = PAD + m.col * CELL + (CELL - 4) / 2;
                  const y = PAD + m.row * CELL + (CELL - 4) / 2;
                  const c = repColor(m.rep, repsList);
                  return (
                    <g key={m.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r={m.radius}
                        fill={c.bg}
                        stroke={c.ring}
                        strokeWidth={1.5}
                        opacity={0.85}
                      >
                        <title>{`${m.name} · ${m.rep || "Unassigned"} · capacity ${m.capacity}`}</title>
                      </circle>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            {repsList.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {repsList.map((rep) => {
                  const c = repColor(rep, repsList);
                  return (
                    <span
                      key={rep}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app px-2.5 py-1 text-[0.65rem] font-medium text-secondary"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.ring }}
                      />
                      {rep}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
              Schematic grid · USPS ZIP→state mapping · Numeric overlay = items in state
            </div>
          </section>

          {/* Reps list */}
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                  Reps & quota
                </div>
                <div className="mt-1 text-lg font-semibold text-app">
                  {repCapacity.length} reps assigned
                </div>
              </div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                Load = assigned / capacity
              </div>
            </div>

            {repCapacity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app bg-app p-8 text-center text-sm text-muted">
                No reps assigned yet. Add a territory below.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {repCapacity.map((r) => {
                  const repTerritories = state.territories.filter(
                    (t) => t.rep === r.rep
                  );
                  const accounts = repTerritories.reduce(
                    (sum, t) => sum + parseList(t.coverage).length,
                    0
                  );
                  const load = r.capacity > 0 ? (r.assigned / r.capacity) * 100 : 0;
                  const barCls =
                    load > 100
                      ? "bg-rose-500"
                      : load > 80
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                  const c = repColor(r.rep, repsList);
                  return (
                    <li
                      key={r.rep}
                      className="rounded-xl border border-app bg-app p-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold text-app"
                          style={{
                            backgroundColor: c.bg,
                            borderColor: c.ring,
                          }}
                        >
                          {initials(r.rep)}
                        </div>

                        {/* Body */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-semibold text-app">
                              {r.rep}
                            </div>
                            <div className="font-mono text-[0.7rem] text-secondary">
                              {accounts} acct
                            </div>
                          </div>

                          {/* Territory chips */}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.territories.map((tn, i) => (
                              <span
                                key={`${tn}-${i}`}
                                className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium text-app"
                                style={{
                                  borderColor: c.ring,
                                  backgroundColor: c.bg,
                                }}
                              >
                                {tn}
                              </span>
                            ))}
                          </div>

                          {/* Quota progress */}
                          <div className="mt-2.5">
                            <div className="mb-1 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                              <span>Quota load</span>
                              <span className="text-secondary">
                                {r.assigned}/{r.capacity || "—"}
                                {r.capacity > 0 && ` · ${load.toFixed(0)}%`}
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full border border-app bg-app-elevated">
                              <div
                                className={`h-full ${barCls} transition-all`}
                                style={{ width: `${Math.min(100, load)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ============================== BALANCE VIEW ============================== */}
      {view === "balance" && (
        <ToolCard
          title="Capacity balance"
          subtitle="Reps overloaded vs underutilized"
        >
          {repCapacity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-app bg-app p-8 text-center text-sm text-muted">
              No reps assigned yet.
            </div>
          ) : (
            <div className="space-y-4">
              {/* warnings */}
              {(() => {
                const overloaded = repCapacity.filter(
                  (r) => r.capacity > 0 && r.assigned / r.capacity > 1
                );
                const hot = repCapacity.filter(
                  (r) =>
                    r.capacity > 0 &&
                    r.assigned / r.capacity > 0.8 &&
                    r.assigned / r.capacity <= 1
                );
                if (overloaded.length === 0 && hot.length === 0) return null;
                return (
                  <div className="grid gap-2 md:grid-cols-2">
                    {overloaded.length > 0 && (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-rose-500">
                          Overloaded · {overloaded.length} rep{overloaded.length === 1 ? "" : "s"}
                        </div>
                        <div className="mt-1 text-xs text-secondary">
                          {overloaded.map((r) => r.rep).join(", ")} — assigned exceeds capacity.
                        </div>
                      </div>
                    )}
                    {hot.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-amber-500">
                          Near capacity · {hot.length} rep{hot.length === 1 ? "" : "s"}
                        </div>
                        <div className="mt-1 text-xs text-secondary">
                          {hot.map((r) => r.rep).join(", ")} — over 80% loaded.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* sorted bar list */}
              <div className="rounded-lg border border-app bg-app">
                <div className="grid grid-cols-[1fr_auto_auto_2fr] gap-3 border-b border-app px-4 py-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <span>Rep</span>
                  <span>Assigned</span>
                  <span>Capacity</span>
                  <span>Load</span>
                </div>
                <ul>
                  {[...repCapacity]
                    .sort((a, b) => {
                      const la = a.capacity > 0 ? a.assigned / a.capacity : 0;
                      const lb = b.capacity > 0 ? b.assigned / b.capacity : 0;
                      return lb - la;
                    })
                    .map((r) => {
                      const load =
                        r.capacity > 0 ? (r.assigned / r.capacity) * 100 : 0;
                      const barCls =
                        load > 100
                          ? "bg-rose-500"
                          : load > 80
                          ? "bg-amber-500"
                          : "bg-emerald-500";
                      const c = repColor(r.rep, repsList);
                      return (
                        <li
                          key={r.rep}
                          className="grid grid-cols-[1fr_auto_auto_2fr] items-center gap-3 border-b border-app px-4 py-2 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: c.ring }}
                            />
                            <span className="text-sm font-semibold text-app">
                              {r.rep}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-secondary">
                            {r.assigned}
                          </span>
                          <span className="font-mono text-xs text-secondary">
                            {r.capacity || "—"}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-app-elevated">
                              <div
                                className={`h-full ${barCls} transition-all`}
                                style={{ width: `${Math.min(100, load)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right font-mono text-[0.65rem] text-muted">
                              {r.capacity > 0 ? `${load.toFixed(0)}%` : "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            </div>
          )}
        </ToolCard>
      )}

      {/* ============================== TABLE VIEW ============================== */}
      {view === "table" && (
        <ToolCard
          title="Assignments"
          subtitle={`${state.territories.length} territor${state.territories.length === 1 ? "y" : "ies"}`}
        >
          {state.territories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-app bg-app p-8 text-center text-sm text-muted">
              No territories yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-app bg-app">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app bg-app-elevated">
                    <th className="px-3 py-2 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Territory</th>
                    <th className="px-3 py-2 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Rep</th>
                    <th className="px-3 py-2 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Items</th>
                    <th className="px-3 py-2 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">States</th>
                    <th className="px-3 py-2 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {state.territories.map((t) => {
                    const items = parseList(t.coverage);
                    const statesTouched = Array.from(
                      new Set(
                        items
                          .map((i) => resolveToState(i)?.code)
                          .filter((x): x is string => Boolean(x))
                      )
                    );
                    const c = repColor(t.rep, repsList);
                    return (
                      <tr key={t.id} className="border-b border-app last:border-b-0">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: c.ring }}
                            />
                            <span className="font-medium text-app">
                              {t.name || "(unnamed)"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-secondary">
                          {t.rep || <span className="text-faint">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-secondary">
                          {items.length}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-secondary">
                          {statesTouched.length > 0 ? statesTouched.join(", ") : <span className="text-faint">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-secondary">
                          {t.capacity ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ToolCard>
      )}

      {/* ============================== UNIVERSE CONFIG ============================== */}
      <ToolCard title="Universe" subtitle="All territories you want covered">
        <Field label="ZIPs or cities (comma-separated)">
          <textarea
            value={state.universe}
            onChange={(e) => setState({ ...state, universe: e.target.value })}
            className={inputCls("min-h-[80px] font-mono text-xs")}
          />
        </Field>
      </ToolCard>

      {/* ============================== ASSIGNMENTS EDITOR ============================== */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
            Assignments · {state.territories.length} territor{state.territories.length === 1 ? "y" : "ies"}
          </div>
          <button
            onClick={addTerritory}
            className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:opacity-90"
          >
            + Territory
          </button>
        </div>

        <div className="space-y-3">
          {state.territories.map((t) => {
            const items = parseList(t.coverage);
            const statesTouched = Array.from(
              new Set(
                items
                  .map((i) => resolveToState(i)?.code)
                  .filter((x): x is string => Boolean(x))
              )
            );
            const c = repColor(t.rep, repsList);
            const itemCount = items.length;
            const cap = t.capacity ?? 0;
            const balanced = cap === 0 || (itemCount <= cap && itemCount >= cap * 0.5);
            return (
              <div
                key={t.id}
                className="rounded-xl border border-app bg-app-elevated p-4"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.ring }}
                  />
                  <div className="text-sm font-semibold text-app">
                    {t.name || "Territory"}
                  </div>
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                    {t.rep || "Unassigned"} · {itemCount} items
                    {statesTouched.length > 0 ? ` · ${statesTouched.join(", ")}` : ""}
                  </div>
                  {cap > 0 && (
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] ${
                        itemCount > cap
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                          : balanced
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {itemCount > cap
                        ? "over"
                        : balanced
                        ? "balanced"
                        : "light"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_2fr_1fr_auto]">
                  <Field label="Name">
                    <input
                      value={t.name}
                      onChange={(e) => update(t.id, { name: e.target.value })}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Rep">
                    <input
                      value={t.rep}
                      onChange={(e) => update(t.id, { rep: e.target.value })}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Coverage (ZIP, city, state)">
                    <textarea
                      value={t.coverage}
                      onChange={(e) => update(t.id, { coverage: e.target.value })}
                      className={inputCls("min-h-[60px] font-mono text-xs")}
                    />
                  </Field>
                  <Field label="Capacity (accounts)">
                    <input
                      type="number"
                      value={t.capacity ?? 0}
                      onChange={(e) =>
                        update(t.id, { capacity: Number(e.target.value) || 0 })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      onClick={() => remove(t.id)}
                      className="rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================== HEATMAP ============================== */}
      {analysis.byState.size > 0 && (
        <ToolCard
          title="Coverage heatmap"
          subtitle={`${analysis.byState.size} US states touched`}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5 lg:grid-cols-8">
            {US_STATES.filter((s) => analysis.byState.has(s.code))
              .sort(
                (a, b) =>
                  (analysis.byState.get(b.code) || 0) -
                  (analysis.byState.get(a.code) || 0)
              )
              .map((s) => {
                const count = analysis.byState.get(s.code) || 0;
                const max = Math.max(...Array.from(analysis.byState.values()));
                const intensity = count / Math.max(1, max);
                const pct = Math.max(8, Math.round(intensity * 55));
                return (
                  <div
                    key={s.code}
                    className="rounded-lg border border-app p-2 text-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--tool-accent) ${pct}%, transparent)`,
                    }}
                  >
                    <div className="text-sm font-semibold text-app">
                      {s.code}
                    </div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.1em] text-muted">
                      {s.region}
                    </div>
                    <div className="mt-1 font-mono text-xs text-tool-accent">
                      {count}
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
            ZIP-to-state mapping: USPS public ZIP code ranges. Darker = more coverage.
          </div>
        </ToolCard>
      )}

      {/* ============================== ANALYSIS GRID ============================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ToolCard title="Overlaps" subtitle={`${analysis.overlaps.length} issues`}>
          {analysis.overlaps.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">None.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {analysis.overlaps.map((o) => (
                <li
                  key={o.zip}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2"
                >
                  <span className="font-mono text-rose-500">{o.zip}</span>
                  <span className="ml-2 text-secondary">
                    {o.territories.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ToolCard>

        <ToolCard title="Uncovered" subtitle={`${analysis.uncovered.length} zones`}>
          {analysis.uncovered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">All covered.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {analysis.uncovered.map((z) => (
                <span
                  key={z}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-500"
                >
                  {z}
                </span>
              ))}
            </div>
          )}
        </ToolCard>

        <ToolCard
          title="Outside universe"
          subtitle={`${analysis.outsideUniverse.length} extras`}
        >
          {analysis.outsideUniverse.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">None.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {analysis.outsideUniverse.map((z) => (
                <span
                  key={z}
                  className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-xs text-secondary"
                >
                  {z}
                </span>
              ))}
            </div>
          )}
        </ToolCard>
      </div>
    </div>
  );
}

/* ───────── small presentational helpers ───────── */

function BigNum({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "warn";
}) {
  const valueCls = accent
    ? "text-tool-accent"
    : tone === "warn"
    ? "text-amber-500"
    : "text-app";
  return (
    <div>
      <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold tracking-tight sm:text-2xl ${valueCls}`}
      >
        {value}
      </div>
    </div>
  );
}
