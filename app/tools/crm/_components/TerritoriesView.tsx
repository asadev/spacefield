"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * TerritoriesView — assign regions / ZIPs to reps; flag overlaps & gaps.
 *
 * Folded in from app/solutions/tools/territory-mapper/page.tsx. Marketing
 * chrome stripped; the schematic US grid + capacity balancer + assignment
 * editor render inline. State lives in localStorage (the standalone tool
 * never moved this to workspace_data, so we keep it consistent).
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import {
  US_STATES,
  resolveToState,
} from "../_data/us-states";

interface Territory {
  id: string;
  name: string;
  rep: string;
  coverage: string;
  capacity?: number;
}

interface State {
  territories: Territory[];
  universe: string;
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

function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${extra}`.trim();
}

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATE_GRID: Record<string, [number, number]> = {
  AK: [0, 0],
  ME: [10, 0],
  VT: [9, 1],
  NH: [10, 1],
  WA: [1, 1],
  ID: [2, 1],
  MT: [3, 1],
  ND: [4, 1],
  MN: [5, 1],
  WI: [6, 2],
  MI: [7, 2],
  NY: [9, 2],
  MA: [10, 2],
  RI: [10, 3],
  OR: [1, 2],
  UT: [2, 2],
  WY: [3, 2],
  SD: [4, 2],
  IA: [5, 2],
  OH: [8, 3],
  PA: [9, 3],
  NJ: [10, 4],
  CT: [10, 4],
  CA: [1, 3],
  NV: [2, 3],
  CO: [3, 3],
  NE: [4, 3],
  MO: [5, 3],
  IL: [6, 3],
  IN: [7, 3],
  WV: [8, 4],
  VA: [9, 4],
  MD: [10, 5],
  DC: [10, 5],
  DE: [10, 5],
  AZ: [2, 4],
  NM: [3, 4],
  KS: [4, 4],
  AR: [5, 4],
  KY: [6, 4],
  TN: [7, 4],
  NC: [8, 5],
  HI: [1, 5],
  OK: [4, 5],
  LA: [5, 5],
  MS: [6, 5],
  AL: [7, 5],
  GA: [8, 5],
  SC: [9, 5],
  TX: [3, 5],
  FL: [9, 6],
};

const REP_RAMP = [
  { bg: "color-mix(in srgb, var(--tool-accent) 55%, transparent)", ring: "var(--tool-accent)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 40%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 80%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 30%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 65%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 22%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 50%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 16%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 40%, white)" },
  { bg: "color-mix(in srgb, var(--tool-accent) 12%, transparent)", ring: "color-mix(in srgb, var(--tool-accent) 30%, white)" },
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

type ViewKey = "map" | "table" | "balance";

interface Props {
  width: number;
}

export default function TerritoriesView({ width }: Props) {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewKey>("map");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
      const v = localStorage.getItem(VIEW_LS_KEY);
      if (v === "map" || v === "table" || v === "balance") setView(v);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {
      /* ignore */
    }
  }, [state, view, hydrated]);

  const analysis = useMemo(() => {
    const universe = new Set(parseList(state.universe));
    const coverageMap = new Map<string, string[]>();
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

    const byState = new Map<string, number>();
    state.territories.forEach((t) => {
      parseList(t.coverage).forEach((item) => {
        const info = resolveToState(item);
        if (info) byState.set(info.code, (byState.get(info.code) || 0) + 1);
      });
    });

    return { overlaps, uncovered, outsideUniverse, coverageMap, universe, byState };
  }, [state]);

  const repsList = useMemo(
    () =>
      Array.from(
        new Set(state.territories.map((t) => t.rep).filter(Boolean))
      ),
    [state.territories]
  );

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

  const stateOwners = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
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
          if (info)
            stateCounts.set(info.code, (stateCounts.get(info.code) || 0) + 1);
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

  const COLS = 11;
  const ROWS = 7;
  const CELL = 44;
  const PAD = 12;
  const SVG_W = COLS * CELL + PAD * 2;
  const SVG_H = ROWS * CELL + PAD * 2;
  const compact = width < 720;

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.territories
          </div>
          <h2 className="text-sm font-semibold text-app">Territory mapper</h2>
        </div>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {state.territories.length} territor
          {state.territories.length === 1 ? "y" : "ies"}
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {repsList.length} reps
        </span>
        {analysis.overlaps.length > 0 && (
          <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-rose-500">
            {analysis.overlaps.length} overlaps
          </span>
        )}
        {analysis.uncovered.length > 0 && (
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-amber-500">
            {analysis.uncovered.length} uncovered
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded-md border border-app bg-app">
            {(
              [
                { k: "map", label: "Map" },
                { k: "table", label: "Table" },
                { k: "balance", label: "Balance" },
              ] as { k: ViewKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setView(t.k)}
                className={`px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  view === t.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:border-tool-accent hover:text-tool-accent"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={addTerritory}
            className="rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + Territory
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {view === "map" && (
          <div
            className={`grid gap-3 ${
              compact ? "grid-cols-1" : "xl:grid-cols-[1.3fr_1fr]"
            }`}
          >
            <section className="rounded-md border border-app bg-app-elevated p-3">
              <div className="mb-2 flex items-end justify-between">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Coverage map · {analysis.byState.size} states ·{" "}
                  {territoryMarkers.length} markers
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                  Marker size = capacity
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-app bg-app p-2">
                <svg
                  viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                  className="h-auto w-full"
                  role="img"
                  aria-label="Schematic US territory map"
                >
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
              {repsList.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {repsList.map((rep) => {
                    const c = repColor(rep, repsList);
                    return (
                      <span
                        key={rep}
                        className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app px-2 py-0.5 text-[0.6rem] font-medium text-secondary"
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.ring }}
                        />
                        {rep}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-md border border-app bg-app-elevated p-3">
              <div className="mb-2 flex items-end justify-between">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Reps & quota
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                  Load = assigned / capacity
                </div>
              </div>
              {repCapacity.length === 0 ? (
                <div className="rounded-md border border-dashed border-app bg-app p-6 text-center text-xs text-muted">
                  No reps assigned yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {repCapacity.map((r) => {
                    const accounts = r.assigned;
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
                        className="rounded-md border border-app bg-app p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold text-app"
                            style={{
                              backgroundColor: c.bg,
                              borderColor: c.ring,
                            }}
                          >
                            {initials(r.rep)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-sm font-semibold text-app">
                                {r.rep}
                              </div>
                              <div className="font-mono text-[0.65rem] text-secondary">
                                {accounts} acct
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.territories.map((tn, i) => (
                                <span
                                  key={`${tn}-${i}`}
                                  className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.55rem] font-medium text-app"
                                  style={{
                                    borderColor: c.ring,
                                    backgroundColor: c.bg,
                                  }}
                                >
                                  {tn}
                                </span>
                              ))}
                            </div>
                            <div className="mt-2">
                              <div className="mb-0.5 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                                <span>Quota load</span>
                                <span className="text-secondary">
                                  {r.assigned}/{r.capacity || "—"}
                                  {r.capacity > 0 && ` · ${load.toFixed(0)}%`}
                                </span>
                              </div>
                              <div className="h-1 w-full overflow-hidden rounded-full border border-app bg-app-elevated">
                                <div
                                  className={`h-full ${barCls}`}
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

        {view === "balance" && (
          <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Capacity balance
            </div>
            {repCapacity.length === 0 ? (
              <div className="rounded-md border border-dashed border-app bg-app p-6 text-center text-xs text-muted">
                No reps assigned yet.
              </div>
            ) : (
              <div className="rounded-md border border-app bg-app">
                <div className="grid grid-cols-[1fr_auto_auto_2fr] gap-3 border-b border-app px-3 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
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
                        r.capacity > 0
                          ? (r.assigned / r.capacity) * 100
                          : 0;
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
                          className="grid grid-cols-[1fr_auto_auto_2fr] items-center gap-3 border-b border-app px-3 py-1.5 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
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
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-app-elevated">
                              <div
                                className={`h-full ${barCls}`}
                                style={{ width: `${Math.min(100, load)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right font-mono text-[0.6rem] text-faint">
                              {r.capacity > 0 ? `${load.toFixed(0)}%` : "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </section>
        )}

        {view === "table" && (
          <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Assignments · {state.territories.length} territor
              {state.territories.length === 1 ? "y" : "ies"}
            </div>
            {state.territories.length === 0 ? (
              <div className="rounded-md border border-dashed border-app bg-app p-6 text-center text-xs text-muted">
                No territories yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-app bg-app">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app bg-app-elevated">
                      <th className="px-3 py-1.5 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                        Territory
                      </th>
                      <th className="px-3 py-1.5 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                        Rep
                      </th>
                      <th className="px-3 py-1.5 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                        Items
                      </th>
                      <th className="px-3 py-1.5 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                        States
                      </th>
                      <th className="px-3 py-1.5 text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                        Capacity
                      </th>
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
                        <tr
                          key={t.id}
                          className="border-b border-app last:border-b-0"
                        >
                          <td className="px-3 py-1.5">
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
                          <td className="px-3 py-1.5 text-secondary">
                            {t.rep || (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-secondary">
                            {items.length}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-secondary">
                            {statesTouched.length > 0 ? (
                              statesTouched.join(", ")
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-secondary">
                            {t.capacity ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Universe + assignments editor — always visible below the active view */}
        <section className="mt-4 rounded-md border border-app bg-app-elevated p-3">
          <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
            Universe — all coverage you want covered
          </div>
          <textarea
            value={state.universe}
            onChange={(e) => setState({ ...state, universe: e.target.value })}
            className={inputCls("min-h-[60px] font-mono text-xs")}
          />
        </section>

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Assignments · {state.territories.length} territor
              {state.territories.length === 1 ? "y" : "ies"}
            </div>
            <button
              type="button"
              onClick={addTerritory}
              className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent hover:opacity-90"
            >
              + Territory
            </button>
          </div>
          <div className="space-y-2">
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
              const balanced =
                cap === 0 || (itemCount <= cap && itemCount >= cap * 0.5);
              return (
                <div
                  key={t.id}
                  className="rounded-md border border-app bg-app-elevated p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.ring }}
                    />
                    <div className="text-sm font-semibold text-app">
                      {t.name || "Territory"}
                    </div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                      {t.rep || "Unassigned"} · {itemCount} items
                      {statesTouched.length > 0
                        ? ` · ${statesTouched.join(", ")}`
                        : ""}
                    </div>
                    {cap > 0 && (
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.15em] ${
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
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_2fr_1fr_auto]">
                    <input
                      placeholder="Name"
                      value={t.name}
                      onChange={(e) => update(t.id, { name: e.target.value })}
                      className={inputCls()}
                    />
                    <input
                      placeholder="Rep"
                      value={t.rep}
                      onChange={(e) => update(t.id, { rep: e.target.value })}
                      className={inputCls()}
                    />
                    <textarea
                      placeholder="Coverage (ZIP, city, state)"
                      value={t.coverage}
                      onChange={(e) =>
                        update(t.id, { coverage: e.target.value })
                      }
                      className={inputCls("min-h-[44px] font-mono text-xs")}
                    />
                    <input
                      type="number"
                      placeholder="Capacity"
                      value={t.capacity ?? 0}
                      onChange={(e) =>
                        update(t.id, {
                          capacity: Number(e.target.value) || 0,
                        })
                      }
                      className={inputCls()}
                    />
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="rounded-md border border-app bg-app px-2 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary hover:border-rose-500/40 hover:text-rose-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Heatmap & analysis */}
        {analysis.byState.size > 0 && (
          <section className="mt-4 rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Coverage heatmap · {analysis.byState.size} US states touched
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5 lg:grid-cols-8">
              {US_STATES.filter((s) => analysis.byState.has(s.code))
                .sort(
                  (a, b) =>
                    (analysis.byState.get(b.code) || 0) -
                    (analysis.byState.get(a.code) || 0)
                )
                .map((s) => {
                  const count = analysis.byState.get(s.code) || 0;
                  const max = Math.max(
                    ...Array.from(analysis.byState.values())
                  );
                  const intensity = count / Math.max(1, max);
                  const pct = Math.max(8, Math.round(intensity * 55));
                  return (
                    <div
                      key={s.code}
                      className="rounded-md border border-app p-1.5 text-center"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--tool-accent) ${pct}%, transparent)`,
                      }}
                    >
                      <div className="text-sm font-semibold text-app">
                        {s.code}
                      </div>
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.1em] text-faint">
                        {s.region}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-tool-accent">
                        {count}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Overlaps · {analysis.overlaps.length} issues
            </div>
            {analysis.overlaps.length === 0 ? (
              <div className="text-center text-xs text-muted">None.</div>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {analysis.overlaps.map((o) => (
                  <li
                    key={o.zip}
                    className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2"
                  >
                    <span className="font-mono text-rose-500">{o.zip}</span>
                    <span className="ml-2 text-secondary">
                      {o.territories.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Uncovered · {analysis.uncovered.length} zones
            </div>
            {analysis.uncovered.length === 0 ? (
              <div className="text-center text-xs text-muted">All covered.</div>
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
          </section>
          <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
              Outside universe · {analysis.outsideUniverse.length} extras
            </div>
            {analysis.outsideUniverse.length === 0 ? (
              <div className="text-center text-xs text-muted">None.</div>
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
          </section>
        </div>
      </div>
    </div>
  );
}
