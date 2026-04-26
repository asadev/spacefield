"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
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
} from "./templates";

type Category = SeededCategory | string;

const BUILTIN_CATEGORIES = SEEDED_CATEGORIES;

const BUILTIN_VARIABLES = SEEDED_VARIABLES;

interface Template {
  id: string;
  name: string;
  category: Category;
  subject: string;
  body: string;
  aiPrompt?: string; // seed / idea for AI-drafted opener; not executed, just a field.
  updatedAt?: string;
}

interface State {
  templates: Template[];
  customVariables: string[];
  // history of previous state snapshots for undo (capped)
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

export default function EmailTemplateLibraryPage() {
  return (
    <div data-tool-theme="crm" data-tool="email-template-library">
      <ToolShell
        category="CRM & Sales Ops"
        title="Email Template Library"
        description="30 seeded sales email templates across 16 categories plus your own. Merge variables, live preview, one-click copy, undo history. Team mode shares the library."
      >
        <Inner />
      </ToolShell>
    </div>
  );
}

function Inner() {
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
    sender_name: "Asad",
    segment: "mid-market",
    role: "RevOps",
    timeframe: "6 weeks",
    result: "20% more forecast accuracy",
  });
  const [customVarDraft, setCustomVarDraft] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

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

  // Debounced persistence
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
        } catch {}
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  const active = state.templates.find((t) => t.id === selected) || null;

  // merged category list: built-in + any custom ones in existing templates
  const allCategories = useMemo(() => {
    const s = new Set<string>(BUILTIN_CATEGORIES);
    state.templates.forEach((t) => s.add(t.category));
    return Array.from(s).sort();
  }, [state.templates]);

  const allVariables = useMemo(() => {
    const s = new Set<string>(BUILTIN_VARIABLES);
    (state.customVariables || []).forEach((v) => s.add(v));
    // also include any found in selected template subject/body
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

  // --- Undo/history plumbing ---
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
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
      ),
    }));

  const remove = (id: string) => {
    if (!confirm("Delete this template?")) return;
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
    const v = customVarDraft.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
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
    navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`);
  };

  const seedLibrary = () => {
    mutate((s) => {
      const existingNames = new Set(s.templates.map((t) => t.name));
      const toAdd = SEEDED_TEMPLATES.filter((t) => !existingNames.has(t.name)).map(
        (t) => ({ ...t, id: uid(), updatedAt: new Date().toISOString() })
      );
      return { ...s, templates: [...toAdd, ...s.templates] };
    });
    setShowSeedConfirm(false);
  };

  const categoryPills = ["all", ...allCategories];

  return (
    <>
      <WorkspaceSwitcher />

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="relative p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                CRM &amp; Sales Ops · Template Library
              </div>

              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                Email Template Library
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-secondary">
                Sales email starter library · merge variables · live preview · undo history
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                  {state.templates.length} templates
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {new Set(state.templates.map((t) => t.category)).size} cats
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {allVariables.length} vars
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {current.kind === "team" ? "Team" : "Personal"} ·{" "}
                  {syncing ? "Saving" : syncedAt ? syncedAt : "Ready"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <button
            onClick={() => setShowSeedConfirm(true)}
            className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + Seed 30 starters
          </button>
          <button
            onClick={undo}
            disabled={(state.history || []).length === 0}
            className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
          >
            Undo ({(state.history || []).length})
          </button>
          <span className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
            Source: Winning by Design · Predictable Revenue · Gong.io
          </span>
        </div>
      </section>

      {showSeedConfirm && (
        <div className="mb-6 rounded-xl border border-app bg-app-elevated p-4">
          <div className="mb-3 text-sm text-app">
            Add 30 seeded templates across 16 categories? Existing templates with the same name will be skipped.
          </div>
          <div className="flex gap-2">
            <button
              onClick={seedLibrary}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Confirm
            </button>
            <button
              onClick={() => setShowSeedConfirm(false)}
              className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-app"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ============================== BODY ============================== */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* LEFT — Library list */}
        <aside className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              Library
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {filtered.length} of {state.templates.length} shown
            </div>
          </div>

          <div className="mb-3 space-y-2">
            <input
              placeholder="Search name, subject, body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputCls()}
            />
            <button
              onClick={addTemplate}
              className="w-full rounded-lg bg-tool-accent px-3 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              + New template
            </button>
          </div>

          {/* Category pills (segmented) */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {categoryPills.map((c) => {
              const on = filter === c;
              return (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    on
                      ? "bg-tool-accent"
                      : "border border-app bg-app text-secondary hover:border-tool-accent hover:text-tool-accent"
                  }`}
                  style={on ? { color: "var(--bg)" } : undefined}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <ul className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((t) => {
              const on = selected === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setSelected(t.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app hover:border-tool-accent"
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
              <li className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-muted">
                No templates.
              </li>
            )}
          </ul>
        </aside>

        {/* RIGHT — Editor + preview */}
        <div className="space-y-5">
          {active ? (
            <>
              <ToolCard
                title="Editor"
                subtitle={`${active.body.length} chars · ${extractVars(active.body).length} vars in body`}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <input
                      value={active.name}
                      onChange={(e) => update(active.id, { name: e.target.value })}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Category">
                    <input
                      list="tmpl-categories"
                      value={active.category}
                      onChange={(e) =>
                        update(active.id, { category: e.target.value })
                      }
                      className={inputCls()}
                      placeholder="cold outreach / custom…"
                    />
                    <datalist id="tmpl-categories">
                      {allCategories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <div className="md:col-span-2">
                    <Field
                      label="AI opener prompt (seed)"
                      hint="Stored for later — not executed"
                    >
                      <input
                        value={active.aiPrompt || ""}
                        onChange={(e) =>
                          update(active.id, { aiPrompt: e.target.value })
                        }
                        className={inputCls()}
                        placeholder="e.g. Warm opener for a CFO who just raised a Series B"
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Subject">
                      <input
                        value={active.subject}
                        onChange={(e) =>
                          update(active.id, { subject: e.target.value })
                        }
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field
                      label="Body"
                      hint={`${active.body.length} chars · ${extractVars(active.body).length} vars`}
                    >
                      <textarea
                        ref={bodyRef}
                        value={active.body}
                        onChange={(e) =>
                          update(active.id, { body: e.target.value })
                        }
                        className={inputCls("min-h-[220px] font-mono text-xs")}
                      />
                    </Field>
                  </div>
                </div>

                {/* Variable insert */}
                <div className="mt-4 rounded-xl border border-app bg-app p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                      Insert variable
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={customVarDraft}
                        onChange={(e) => setCustomVarDraft(e.target.value)}
                        placeholder="add_custom_var"
                        className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.65rem] text-app placeholder:text-faint outline-none focus:border-app-focus"
                      />
                      <button
                        onClick={addCustomVar}
                        className="rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
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
                        onClick={() => insertVar(v)}
                        className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.65rem] text-tool-accent transition-opacity hover:opacity-80"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => duplicate(active.id)}
                    className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => remove(active.id)}
                    className="ml-auto rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-rose-500 transition-colors hover:bg-rose-500/20"
                  >
                    Delete
                  </button>
                </div>
              </ToolCard>

              <ToolCard title="Sample data" subtitle="Drives the live preview">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {Array.from(
                    new Set([
                      ...Object.keys(sampleVars),
                      ...extractVars(active.subject),
                      ...extractVars(active.body),
                    ])
                  ).map((v) => (
                    <label key={v} className="block">
                      <span className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                        {v}
                      </span>
                      <input
                        value={sampleVars[v] || ""}
                        onChange={(e) =>
                          setSampleVars((s) => ({ ...s, [v]: e.target.value }))
                        }
                        className={inputCls("mt-1")}
                      />
                    </label>
                  ))}
                </div>
              </ToolCard>

              <ToolCard
                title="Rendered preview"
                subtitle={
                  active.updatedAt
                    ? `Updated ${new Date(active.updatedAt).toLocaleString()}`
                    : "Live"
                }
              >
                <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                  <div className="border-b border-app bg-app px-4 py-3">
                    <div className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-tool-accent font-mono text-[0.6rem]"
                        style={{ color: "var(--bg)" }}
                      >
                        @
                      </span>
                      From: {sampleVars.sender_name || "{{sender_name}}"} · To:{" "}
                      {sampleVars.first_name || "{{first_name}}"}
                    </div>
                    <div className="mt-1.5 text-sm font-semibold text-app">
                      {render(active.subject, sampleVars)}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap px-4 py-4 font-mono text-sm leading-relaxed text-secondary">
                    {render(active.body, sampleVars)}
                  </pre>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={copy}
                    className="rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                    style={{ color: "var(--bg)" }}
                  >
                    Copy rendered
                  </button>
                  <button
                    onClick={copy}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-4 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent transition-opacity hover:opacity-80"
                  >
                    Use template
                  </button>
                </div>
              </ToolCard>
            </>
          ) : (
            <ToolCard title="Editor & preview" subtitle="Pick a template to begin">
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-app bg-app p-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-app">
                  No template selected
                </div>
                <div className="mt-1 text-xs text-muted">
                  Pick one from the library, or create a new template.
                </div>
              </div>
            </ToolCard>
          )}
        </div>
      </div>
    </>
  );
}
