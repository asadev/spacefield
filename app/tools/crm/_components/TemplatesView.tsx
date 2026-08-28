"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * TemplatesView — named email templates with merge variables.
 *
 * Folded in from app/solutions/tools/email-template-library/page.tsx. The
 * marketing chrome (ToolShell, hero, breadcrumbs) is stripped; the editor +
 * preview live inside the CRM shell. Persistence is workspace_data
 * (`email-templates` namespace) when a team is selected; localStorage
 * fallback for personal mode.
 *
 * Seed library + variable list come from the same templates.ts the
 * standalone tool used.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";
import {
  SEEDED_TEMPLATES,
  SEEDED_CATEGORIES,
  SEEDED_VARIABLES,
  type SeededCategory,
} from "../_data/templates";

type Category = SeededCategory | string;

interface Template {
  id: string;
  name: string;
  category: Category;
  subject: string;
  body: string;
  aiPrompt?: string;
  updatedAt?: string;
}

interface State {
  templates: Template[];
  customVariables: string[];
  history?: Array<{ at: string; state: Omit<State, "history"> }>;
}

const LS_KEY = "solutions:email-template-library:v2";
const LEGACY_LS_KEY = "solutions:email-template-library:v1";
const NAMESPACE = "email-templates";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;
const HISTORY_LIMIT = 20;

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    templates: [
      {
        id: uid(),
        name: "Cold intro — pain-led",
        category: "cold outreach",
        subject: "{{company}} + a quick idea on {{pain_point}}",
        body:
          "Hi {{first_name}},\n\nI help teams at companies like {{company}} reduce {{pain_point}} without adding headcount.\n\nWorth a 15-minute call next week?\n\n— {{sender_name}}",
        updatedAt: new Date().toISOString(),
      },
      {
        id: uid(),
        name: "Meeting confirmation",
        category: "meeting",
        subject: "Confirmed: {{meeting_date}}",
        body:
          "Hi {{first_name}},\n\nConfirming our call on {{meeting_date}}. I'll bring a draft agenda.\n\n— {{sender_name}}",
        updatedAt: new Date().toISOString(),
      },
    ],
    customVariables: [],
    history: [],
  };
}

function render(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] || `{{${k}}}`);
}

function extractVars(s: string): string[] {
  const found = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) found.add(m[1]);
  return Array.from(found);
}

function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${extra}`.trim();
}

interface Props {
  workspaceId: string;
  workspaceLabel: string;
  width: number;
}

export default function TemplatesView({
  workspaceId,
  workspaceLabel,
  width,
}: Props) {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);
  const suppressHistory = useRef(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sampleVars, setSampleVars] = useState<Record<string, string>>({
    first_name: "Jane",
    last_name: "Doe",
    company: "Acme Co",
    meeting_date: "Friday 2pm",
    pain_point: "pipeline leakage",
    sender_name: "Alex",
    segment: "mid-market",
    role: "RevOps",
    timeframe: "6 weeks",
    result: "20% more forecast accuracy",
  });
  const [customVarDraft, setCustomVarDraft] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const compact = width < 720;

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    (async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<State>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        setState(
          data && Array.isArray(data.templates)
            ? { ...defaultState(), ...data }
            : defaultState()
        );
      } else {
        try {
          const raw =
            localStorage.getItem(LS_KEY) ||
            localStorage.getItem(LEGACY_LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<State>;
            setState({ ...defaultState(), ...parsed });
          } else {
            setState(defaultState());
          }
        } catch {
          setState(defaultState());
        }
      }
      lastSig.current = null;
      suppressHistory.current = true;
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

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

  const active = state.templates.find((t) => t.id === selected) || null;

  const allCategories = useMemo(() => {
    const s = new Set<string>(SEEDED_CATEGORIES);
    state.templates.forEach((t) => s.add(t.category));
    return Array.from(s).sort();
  }, [state.templates]);

  const allVariables = useMemo(() => {
    const s = new Set<string>(SEEDED_VARIABLES);
    (state.customVariables || []).forEach((v) => s.add(v));
    if (active) {
      extractVars(active.subject).forEach((v) => s.add(v));
      extractVars(active.body).forEach((v) => s.add(v));
    }
    return Array.from(s).sort();
  }, [state.customVariables, active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.templates.filter((t) => {
      if (filter !== "all" && t.category !== filter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q)
      );
    });
  }, [state, filter, search]);

  const pushHistory = (prev: State) => {
    const hist = (prev.history || []).slice(-HISTORY_LIMIT + 1);
    hist.push({
      at: new Date().toISOString(),
      state: {
        templates: prev.templates,
        customVariables: prev.customVariables,
      },
    });
    return hist;
  };

  const mutate = (updater: (s: State) => State) => {
    setState((s) => {
      if (suppressHistory.current) {
        suppressHistory.current = false;
        return updater(s);
      }
      const before = s;
      const history = pushHistory(before);
      return { ...updater(before), history };
    });
  };

  const undo = () => {
    setState((s) => {
      const hist = (s.history || []).slice();
      const last = hist.pop();
      if (!last) return s;
      return {
        ...s,
        templates: last.state.templates,
        customVariables: last.state.customVariables,
        history: hist,
      };
    });
  };

  const addTemplate = () => {
    const t: Template = {
      id: uid(),
      name: "New template",
      category: "cold outreach",
      subject: "",
      body: "",
      updatedAt: new Date().toISOString(),
    };
    mutate((s) => ({ ...s, templates: [t, ...s.templates] }));
    setSelected(t.id);
  };

  const update = (id: string, patch: Partial<Template>) =>
    mutate((s) => ({
      ...s,
      templates: s.templates.map((t) =>
        t.id === id
          ? { ...t, ...patch, updatedAt: new Date().toISOString() }
          : t
      ),
    }));

  const remove = (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this template?")) return;
    mutate((s) => ({
      ...s,
      templates: s.templates.filter((t) => t.id !== id),
    }));
    if (selected === id) setSelected(null);
  };

  const duplicate = (id: string) => {
    const t = state.templates.find((x) => x.id === id);
    if (!t) return;
    const copy: Template = {
      ...t,
      id: uid(),
      name: `${t.name} (copy)`,
      updatedAt: new Date().toISOString(),
    };
    mutate((s) => ({ ...s, templates: [copy, ...s.templates] }));
    setSelected(copy.id);
  };

  const insertVar = (variable: string) => {
    if (!active || !bodyRef.current) return;
    const ta = bodyRef.current;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const token = `{{${variable}}}`;
    const newBody =
      active.body.slice(0, start) + token + active.body.slice(end);
    update(active.id, { body: newBody });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addCustomVar = () => {
    const v = customVarDraft
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    if (!v) return;
    if ((state.customVariables || []).includes(v)) {
      setCustomVarDraft("");
      return;
    }
    mutate((s) => ({
      ...s,
      customVariables: [...(s.customVariables || []), v],
    }));
    setCustomVarDraft("");
  };

  const copy = () => {
    if (!active) return;
    const subject = render(active.subject, sampleVars);
    const body = render(active.body, sampleVars);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    }
  };

  const seedLibrary = () => {
    mutate((s) => {
      const existingNames = new Set(s.templates.map((t) => t.name));
      const toAdd = SEEDED_TEMPLATES.filter(
        (t) => !existingNames.has(t.name)
      ).map((t) => ({
        ...t,
        id: uid(),
        updatedAt: new Date().toISOString(),
      }));
      return { ...s, templates: [...toAdd, ...s.templates] };
    });
    setShowSeedConfirm(false);
  };

  const categoryPills = ["all", ...allCategories];
  const requiredVars = active
    ? Array.from(
        new Set([
          ...Object.keys(sampleVars),
          ...extractVars(active.subject),
          ...extractVars(active.body),
        ])
      )
    : [];

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.templates
          </div>
          <h2 className="text-sm font-semibold text-app">Email templates</h2>
        </div>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {state.templates.length} templates
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {new Set(state.templates.map((t) => t.category)).size} cats
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {allVariables.length} vars
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          {syncing
            ? "saving…"
            : syncedAt
            ? `saved ${syncedAt}`
            : hydrated
            ? "ready"
            : "loading…"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={(state.history || []).length === 0}
            className="rounded-md border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
          >
            Undo ({(state.history || []).length})
          </button>
          <button
            type="button"
            onClick={() => setShowSeedConfirm(true)}
            className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-opacity hover:opacity-80"
          >
            Seed 30 starters
          </button>
          <button
            type="button"
            onClick={addTemplate}
            className="rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + New template
          </button>
        </div>
      </header>

      {showSeedConfirm && (
        <div className="border-b border-app bg-app-elevated px-3 py-2">
          <div className="mb-2 text-xs text-app">
            Add 30 seeded templates across 16 categories? Existing templates
            with the same name will be skipped.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={seedLibrary}
              className="rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setShowSeedConfirm(false)}
              className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:border-tool-accent hover:text-app"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className={`min-h-0 flex-1 overflow-hidden ${
          compact ? "flex flex-col" : "grid"
        }`}
        style={
          compact
            ? undefined
            : {
                gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 2fr)",
              }
        }
      >
        {/* LEFT — list */}
        <aside className="flex min-h-0 flex-col border-r border-app bg-app">
          <div className="space-y-2 border-b border-app p-3">
            <input
              type="search"
              placeholder="Search name, subject, body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputCls()}
            />
            <div className="flex flex-wrap gap-1">
              {categoryPills.map((c) => {
                const on = filter === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFilter(c)}
                    className={`rounded-md px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] transition-colors ${
                      on
                        ? "bg-tool-accent"
                        : "border border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                    }`}
                    style={on ? { color: "var(--bg)" } : undefined}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
              <span>{filtered.length} shown</span>
              <span>{state.templates.length} total</span>
            </div>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {filtered.map((t) => {
              const on = selected === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.id)}
                    className={`block w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                      on
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app-elevated hover:border-tool-accent"
                    }`}
                  >
                    <div className="text-sm font-semibold text-app">
                      {t.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                      {t.category}
                    </div>
                    {t.subject && (
                      <div className="mt-1 line-clamp-1 text-xs text-secondary">
                        {t.subject}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="rounded-md border border-dashed border-app p-6 text-center text-xs text-muted">
                No templates.
              </li>
            )}
          </ul>
        </aside>

        {/* RIGHT — editor + preview */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!active ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-app bg-app-elevated p-10 text-center">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                editor
              </div>
              <div className="mt-2 text-sm font-semibold text-app">
                No template selected
              </div>
              <div className="mt-1 text-xs text-muted">
                Pick one from the list, or seed the library to get 30 sales
                starters.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <section className="rounded-md border border-app bg-app-elevated p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      Editor
                    </div>
                    <div className="font-mono text-[0.55rem] text-faint">
                      {active.body.length} chars ·{" "}
                      {extractVars(active.body).length} vars in body
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => duplicate(active.id)}
                      className="rounded-md border border-app bg-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary hover:border-tool-accent hover:text-app"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(active.id)}
                      className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-rose-500 hover:bg-rose-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input
                    placeholder="Name"
                    value={active.name}
                    onChange={(e) =>
                      update(active.id, { name: e.target.value })
                    }
                    className={inputCls()}
                  />
                  <input
                    list="crm-tmpl-categories"
                    placeholder="Category"
                    value={active.category}
                    onChange={(e) =>
                      update(active.id, { category: e.target.value })
                    }
                    className={inputCls()}
                  />
                  <datalist id="crm-tmpl-categories">
                    {allCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <input
                    placeholder="AI opener prompt (seed — not executed)"
                    value={active.aiPrompt || ""}
                    onChange={(e) =>
                      update(active.id, { aiPrompt: e.target.value })
                    }
                    className={`${inputCls()} md:col-span-2`}
                  />
                  <input
                    placeholder="Subject"
                    value={active.subject}
                    onChange={(e) =>
                      update(active.id, { subject: e.target.value })
                    }
                    className={`${inputCls()} md:col-span-2`}
                  />
                  <textarea
                    ref={bodyRef}
                    value={active.body}
                    onChange={(e) =>
                      update(active.id, { body: e.target.value })
                    }
                    className={`${inputCls("min-h-[180px] font-mono text-xs")} md:col-span-2`}
                  />
                </div>
                <div className="mt-3 rounded-md border border-app bg-app p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                      Insert variable
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={customVarDraft}
                        onChange={(e) => setCustomVarDraft(e.target.value)}
                        placeholder="add_custom_var"
                        className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.65rem] text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addCustomVar}
                        className="rounded-md bg-tool-accent px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
                        style={{ color: "var(--bg)" }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allVariables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVar(v)}
                        className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] text-tool-accent hover:opacity-80"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-app bg-app-elevated p-3">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Sample data — drives the live preview
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {requiredVars.map((v) => (
                    <label key={v} className="block">
                      <span className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-faint">
                        {v}
                      </span>
                      <input
                        value={sampleVars[v] || ""}
                        onChange={(e) =>
                          setSampleVars((s) => ({
                            ...s,
                            [v]: e.target.value,
                          }))
                        }
                        className={`${inputCls()} mt-1`}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-md border border-app bg-app-elevated">
                <div className="border-b border-app bg-app px-3 py-2">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    Rendered preview ·{" "}
                    {active.updatedAt
                      ? `updated ${new Date(active.updatedAt).toLocaleString()}`
                      : "live"}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-app">
                    {render(active.subject, sampleVars)}
                  </div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                    From: {sampleVars.sender_name || "{{sender_name}}"} · To:{" "}
                    {sampleVars.first_name || "{{first_name}}"}
                  </div>
                </div>
                <pre className="whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-secondary">
                  {render(active.body, sampleVars)}
                </pre>
                <div className="flex flex-wrap gap-2 border-t border-app bg-app px-3 py-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
                    style={{ color: "var(--bg)" }}
                  >
                    Copy rendered
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
      <footer className="border-t border-app bg-app-elevated px-3 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {workspaceLabel} · {workspaceId ? "synced" : "personal mode"}
      </footer>
    </div>
  );
}
