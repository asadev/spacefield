"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

interface KeyResultUpdate {
  id: string;
  at: string; // ISO
  author: string; // user id or "anon"
  note: string;
  value?: number;
}

interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  owner: string;
  updates: KeyResultUpdate[];
}

interface Objective {
  id: string;
  title: string;
  quarter: string; // e.g. "2026 Q2"
  owner: string;
  keyResults: KeyResult[];
}

interface OkrState {
  objectives: Objective[];
}

const LS_KEY = "solutions:okr-dashboard:v1";
const NAMESPACE = "okr";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const uid = () => Math.random().toString(36).slice(2, 9);
const nowIso = () => new Date().toISOString();

function defaultState(): OkrState {
  const q = currentQuarter();
  return {
    objectives: [
      {
        id: uid(),
        title: "Ship the team dashboard",
        quarter: q,
        owner: "Asad",
        keyResults: [
          {
            id: uid(),
            title: "3 dashboards live in production",
            target: 3,
            current: 1,
            unit: "tools",
            owner: "Asad",
            updates: [],
          },
          {
            id: uid(),
            title: "10 teams invited",
            target: 10,
            current: 2,
            unit: "teams",
            owner: "Asad",
            updates: [],
          },
        ],
      },
    ],
  };
}

function currentQuarter(d = new Date()): string {
  return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function progress(kr: KeyResult): number {
  if (!kr.target) return 0;
  return Math.max(0, Math.min(1, kr.current / kr.target));
}

function objectiveProgress(o: Objective): number {
  if (o.keyResults.length === 0) return 0;
  return (
    o.keyResults.reduce((s, kr) => s + progress(kr), 0) / o.keyResults.length
  );
}

export default function OkrDashboardPage() {
  return (
    <ToolShell
      category="Productivity"
      title="OKR Dashboard"
      description="Team-aware OKR tracker. Personal mode saves to your browser. Team mode syncs across everyone in the workspace."
    >
      <div data-tool-theme="productivity" data-tool="okr-dashboard">
        <OkrDashboardInner />
      </div>
    </ToolShell>
  );
}

function statusFromPct(pct: number): "on-track" | "at-risk" | "off-track" {
  if (pct >= 70) return "on-track";
  if (pct >= 40) return "at-risk";
  return "off-track";
}

const KR_BAR: Record<"on-track" | "at-risk" | "off-track", string> = {
  "on-track": "bg-tool-accent",
  "at-risk": "bg-amber-500/85",
  "off-track": "bg-rose-500/85",
};

const KR_CHIP: Record<"on-track" | "at-risk" | "off-track", string> = {
  "on-track":
    "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]",
  "at-risk":
    "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/30",
  "off-track":
    "bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/30",
};

const KR_LABEL: Record<"on-track" | "at-risk" | "off-track", string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
};

function OkrDashboardInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<OkrState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  // Load from storage whenever workspace selection changes.
  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<OkrState>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        if (data && Array.isArray(data.objectives)) {
          setState(data);
        } else {
          setState(defaultState());
        }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as OkrState;
            if (parsed && Array.isArray(parsed.objectives)) {
              setState(parsed);
            } else {
              setState(defaultState());
            }
          } else {
            setState(defaultState());
          }
        } catch {
          setState(defaultState());
        }
      }
      lastSig.current = null;
      setHydrated(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

  // Persist (debounced) whenever state changes.
  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (current.kind === "team") {
        setSyncing(true);
        const res = await saveWorkspaceData(
          current.id,
          NAMESPACE,
          DATA_KEY,
          state
        );
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(LS_KEY, sig);
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {
          /* ignore */
        }
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  const addObjective = () => {
    setState((s) => ({
      ...s,
      objectives: [
        ...s.objectives,
        {
          id: uid(),
          title: "New objective",
          quarter: currentQuarter(),
          owner: "",
          keyResults: [],
        },
      ],
    }));
  };

  const updateObjective = (id: string, patch: Partial<Objective>) => {
    setState((s) => ({
      ...s,
      objectives: s.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  };

  const removeObjective = (id: string) => {
    if (!confirm("Delete this objective and all its key results?")) return;
    setState((s) => ({
      ...s,
      objectives: s.objectives.filter((o) => o.id !== id),
    }));
  };

  const addKr = (objId: string) => {
    setState((s) => ({
      ...s,
      objectives: s.objectives.map((o) =>
        o.id === objId
          ? {
              ...o,
              keyResults: [
                ...o.keyResults,
                {
                  id: uid(),
                  title: "New key result",
                  target: 100,
                  current: 0,
                  unit: "",
                  owner: "",
                  updates: [],
                },
              ],
            }
          : o
      ),
    }));
  };

  const updateKr = (
    objId: string,
    krId: string,
    patch: Partial<KeyResult>
  ) => {
    setState((s) => ({
      ...s,
      objectives: s.objectives.map((o) =>
        o.id === objId
          ? {
              ...o,
              keyResults: o.keyResults.map((kr) =>
                kr.id === krId ? { ...kr, ...patch } : kr
              ),
            }
          : o
      ),
    }));
  };

  const removeKr = (objId: string, krId: string) => {
    setState((s) => ({
      ...s,
      objectives: s.objectives.map((o) =>
        o.id === objId
          ? { ...o, keyResults: o.keyResults.filter((kr) => kr.id !== krId) }
          : o
      ),
    }));
  };

  const addUpdate = (objId: string, krId: string, note: string, value?: number) => {
    const update: KeyResultUpdate = {
      id: uid(),
      at: nowIso(),
      author: current.kind === "team" ? "team" : "you",
      note,
      value,
    };
    setState((s) => ({
      ...s,
      objectives: s.objectives.map((o) =>
        o.id === objId
          ? {
              ...o,
              keyResults: o.keyResults.map((kr) =>
                kr.id === krId
                  ? {
                      ...kr,
                      current: typeof value === "number" ? value : kr.current,
                      updates: [update, ...kr.updates].slice(0, 20),
                    }
                  : kr
              ),
            }
          : o
      ),
    }));
  };

  const quarters = useMemo(
    () =>
      Array.from(new Set(state.objectives.map((o) => o.quarter))).sort().reverse(),
    [state]
  );
  const [filterQ, setFilterQ] = useState<string>("all");
  const filtered = useMemo(
    () =>
      state.objectives.filter((o) => filterQ === "all" || o.quarter === filterQ),
    [state, filterQ]
  );

  const rollup = useMemo(() => {
    if (filtered.length === 0) return { avg: 0, onTrack: 0, atRisk: 0 };
    const scores = filtered.map(objectiveProgress);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const onTrack = scores.filter((s) => s >= 0.7).length;
    const atRisk = scores.filter((s) => s < 0.4).length;
    return { avg, onTrack, atRisk };
  }, [filtered]);

  const headlineQuarter =
    filterQ === "all" ? currentQuarter() : filterQ;
  const overallPct = Math.round(rollup.avg * 100);
  const totalObjectives = filtered.length;
  const teamRows = useMemo(() => {
    const map = new Map<
      string,
      { owner: string; objectives: Objective[]; pct: number }
    >();
    filtered.forEach((o) => {
      const owner = (o.owner || "Unassigned").trim() || "Unassigned";
      const entry = map.get(owner) ?? { owner, objectives: [], pct: 0 };
      entry.objectives.push(o);
      map.set(owner, entry);
    });
    return Array.from(map.values())
      .map((row) => {
        const avg =
          row.objectives.reduce((s, o) => s + objectiveProgress(o), 0) /
          row.objectives.length;
        return { ...row, pct: Math.round(avg * 100) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [filtered]);

  return (
    <>
      <WorkspaceSwitcher />

      {/* Leadership hero — quarter completion */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated p-6 sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-tool-accent-soft px-3 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              {headlineQuarter} · Org rollup
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-semibold tracking-tight text-app sm:text-7xl">
                {overallPct}
                <span className="text-3xl text-faint">%</span>
              </span>
              <span className="text-sm uppercase tracking-[0.2em] text-muted">
                quarter complete
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-tool-accent-soft">
              <div
                className="h-full rounded-full bg-tool-accent transition-[width] duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 md:w-[22rem]">
            <HeroStat label="Objectives" value={String(totalObjectives)} />
            <HeroStat
              label="On track"
              value={String(rollup.onTrack)}
              tone="ok"
            />
            <HeroStat
              label="At risk"
              value={String(rollup.atRisk)}
              tone={rollup.atRisk > 0 ? "warn" : "muted"}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-app pt-4 text-[0.65rem] uppercase tracking-[0.18em] text-muted">
          <span>
            {current.kind === "team" ? "Team mode" : "Personal mode"} ·{" "}
            {syncing ? "Saving…" : syncedAt ? `Saved ${syncedAt}` : "Ready"}
          </span>
          <button
            onClick={addObjective}
            className="rounded-lg bg-tool-accent px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + Objective
          </button>
        </div>
      </section>

      {/* Quarter filter — segmented pills */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[0.55rem] uppercase tracking-[0.22em] text-faint">
          Quarter
        </span>
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-app bg-app-elevated p-1">
          <button
            onClick={() => setFilterQ("all")}
            className={`rounded-md px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
              filterQ === "all"
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:text-app"
            }`}
          >
            All
          </button>
          {quarters.map((q) => (
            <button
              key={q}
              onClick={() => setFilterQ(q)}
              className={`rounded-md px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                filterQ === q
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:text-app"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Team breakdown */}
      {teamRows.length > 0 && (
        <section className="mb-8 rounded-xl border border-app bg-app-elevated">
          <header className="flex items-center justify-between border-b border-app px-5 py-3">
            <h3 className="text-[0.7rem] uppercase tracking-[0.22em] text-secondary">
              Team breakdown
            </h3>
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              {teamRows.length} owner{teamRows.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="divide-y divide-[color:var(--border)]">
            {teamRows.map((row) => {
              const status = statusFromPct(row.pct);
              return (
                <li
                  key={row.owner}
                  className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 sm:grid-cols-[10rem_1fr_5rem_5rem]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tool-accent-soft text-[0.65rem] font-semibold uppercase text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                      {row.owner.slice(0, 2)}
                    </span>
                    <span className="truncate text-sm text-app">
                      {row.owner}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-tool-accent-soft">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${KR_BAR[status]}`}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                  <span
                    className={`justify-self-start rounded-full px-2.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.14em] sm:justify-self-center ${KR_CHIP[status]}`}
                  >
                    {KR_LABEL[status]}
                  </span>
                  <span className="justify-self-start text-right text-sm tabular-nums text-app sm:justify-self-end">
                    {row.pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.7rem] uppercase tracking-[0.22em] text-secondary">
          Objectives
        </h3>
        <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          {filtered.length} total
        </span>
      </div>

      <div className="space-y-5">
        {filtered.map((o) => (
          <ObjectiveCard
            key={o.id}
            objective={o}
            canLog={current.kind === "team"}
            onChange={(p) => updateObjective(o.id, p)}
            onRemove={() => removeObjective(o.id)}
            onAddKr={() => addKr(o.id)}
            onChangeKr={(krId, p) => updateKr(o.id, krId, p)}
            onRemoveKr={(krId) => removeKr(o.id, krId)}
            onAddUpdate={(krId, note, value) => addUpdate(o.id, krId, note, value)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
            No objectives for this quarter yet. Spin one up to start tracking.
          </div>
        )}
      </div>
    </>
  );
}

function HeroStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const toneCls =
    tone === "ok"
      ? "text-tool-accent"
      : tone === "warn"
      ? "text-amber-500"
      : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app px-3 py-2.5">
      <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function ObjectiveCard({
  objective,
  canLog,
  onChange,
  onRemove,
  onAddKr,
  onChangeKr,
  onRemoveKr,
  onAddUpdate,
}: {
  objective: Objective;
  canLog: boolean;
  onChange: (p: Partial<Objective>) => void;
  onRemove: () => void;
  onAddKr: () => void;
  onChangeKr: (krId: string, p: Partial<KeyResult>) => void;
  onRemoveKr: (krId: string) => void;
  onAddUpdate: (krId: string, note: string, value?: number) => void;
}) {
  const pct = Math.round(objectiveProgress(objective) * 100);
  const status = statusFromPct(pct);

  return (
    <ToolCard
      title={objective.title}
      subtitle={`${objective.quarter} · ${pct}% complete`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.16em] ${KR_CHIP[status]}`}
        >
          {KR_LABEL[status]}
        </span>
        <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          {objective.keyResults.length} key result
          {objective.keyResults.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-2xl font-semibold tabular-nums text-app">
          {pct}
          <span className="text-base text-faint">%</span>
        </span>
      </div>

      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-tool-accent-soft">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${KR_BAR[status]}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <Field label="Title">
          <input
            value={objective.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={inputCls()}
          />
        </Field>
        <Field label="Quarter">
          <input
            value={objective.quarter}
            onChange={(e) => onChange({ quarter: e.target.value })}
            className={inputCls()}
          />
        </Field>
        <Field label="Owner">
          <input
            value={objective.owner}
            onChange={(e) => onChange({ owner: e.target.value })}
            className={inputCls()}
          />
        </Field>
        <div className="flex items-end">
          <button
            onClick={onRemove}
            className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {objective.keyResults.map((kr) => (
          <KrRow
            key={kr.id}
            kr={kr}
            canLog={canLog}
            onChange={(p) => onChangeKr(kr.id, p)}
            onRemove={() => onRemoveKr(kr.id)}
            onAddUpdate={(note, value) => onAddUpdate(kr.id, note, value)}
          />
        ))}
      </div>

      <div className="mt-4">
        <button
          onClick={onAddKr}
          className="rounded-lg border border-dashed border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
        >
          + Key result
        </button>
      </div>
    </ToolCard>
  );
}

function KrRow({
  kr,
  canLog,
  onChange,
  onRemove,
  onAddUpdate,
}: {
  kr: KeyResult;
  canLog: boolean;
  onChange: (p: Partial<KeyResult>) => void;
  onRemove: () => void;
  onAddUpdate: (note: string, value?: number) => void;
}) {
  const [note, setNote] = useState("");
  const [newVal, setNewVal] = useState<string>("");
  const pct = Math.round(progress(kr) * 100);
  const status = statusFromPct(pct);

  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors hover:border-tool-accent">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Field label="Key result">
          <input
            value={kr.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={inputCls()}
          />
        </Field>
        <Field label="Current">
          <input
            type="number"
            value={kr.current}
            onChange={(e) => onChange({ current: Number(e.target.value) || 0 })}
            className={inputCls()}
          />
        </Field>
        <Field label="Target">
          <input
            type="number"
            value={kr.target}
            onChange={(e) => onChange({ target: Number(e.target.value) || 0 })}
            className={inputCls()}
          />
        </Field>
        <Field label="Unit">
          <input
            value={kr.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className={inputCls()}
            placeholder="%, deals, $"
          />
        </Field>
        <div className="flex items-end">
          <button
            onClick={onRemove}
            className="rounded-lg border border-app px-2 py-2 text-[0.6rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
          >
            ×
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tool-accent-soft">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${KR_BAR[status]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.14em] ${KR_CHIP[status]}`}
        >
          {pct}%
        </span>
      </div>

      {canLog && (
        <div className="mt-4 rounded-lg border border-app bg-app p-3">
          <div className="mb-2 text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            Log an update
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              placeholder="What changed?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls("flex-1")}
            />
            <input
              placeholder="New value (optional)"
              type="number"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              className={inputCls("sm:w-40")}
            />
            <button
              onClick={() => {
                if (!note.trim()) return;
                const val = newVal === "" ? undefined : Number(newVal);
                onAddUpdate(note.trim(), val);
                setNote("");
                setNewVal("");
              }}
              className="rounded-lg bg-tool-accent px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Log
            </button>
          </div>
          {kr.updates.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-xs text-secondary">
              {kr.updates.slice(0, 5).map((u) => (
                <li key={u.id} className="flex justify-between gap-3">
                  <span>
                    <span className="text-app">{u.note}</span>
                    {typeof u.value === "number" && (
                      <span className="ml-2 text-tool-accent">
                        → {u.value}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-faint">
                    {new Date(u.at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
