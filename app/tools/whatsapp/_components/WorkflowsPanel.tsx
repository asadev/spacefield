"use client";

/* Workflows + drip sequences (EPIC-19) — lazy-loaded builder.
 *
 * BUILD-SAFETY: this is a STRUCTURED STEP-LIST editor, NOT a drag-and-drop node
 * canvas (a real graph lib would risk the 8GB Vercel build). It produces the
 * SAME graph/steps jsonb the runtime consumes:
 *   - Workflow  : { trigger, conditions, actions[] } → compiled into the proven
 *                 automation engine server-side (shared executor; throttle +
 *                 consent baked in).
 *   - Sequence  : [{ delay_minutes, actions[] }] → drained by the
 *                 whatsapp-sequence-runner cron (throttle + consent +
 *                 exit-on-reply).
 * Prebuilt clonable recipes seed both. Mobile-first; responsive CSS only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSequence,
  createWorkflow,
  deleteSequence,
  deleteWorkflow,
  fetchSequences,
  fetchWorkflows,
  updateSequence,
  updateWorkflow,
  type WaSequence,
  type WaSequenceRecipe,
  type WaSequenceStep,
  type WaWorkflow,
  type WaWorkflowGraph,
  type WaWorkflowRecipe,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

type View = "workflows" | "sequences";

// Action vocabulary the builder offers (matches the shared executor allowlist).
const ACTION_OPTIONS: Array<{ type: string; label: string; field?: string; placeholder?: string }> = [
  { type: "send_text", label: "Send text", field: "text", placeholder: "Message — {{contact.firstName}} supported" },
  { type: "send_canned", label: "Send quick reply", field: "short_code", placeholder: "short code (e.g. price)" },
  { type: "send_menu", label: "Send numbered menu", field: "options", placeholder: "Comma-separated options" },
  { type: "send_product", label: "Send product", field: "product_id", placeholder: "product id" },
  { type: "ai_reply", label: "AI auto-draft + send", field: "prompt", placeholder: "optional guidance" },
  { type: "add_label", label: "Add label", field: "label_id", placeholder: "label id" },
  { type: "set_status", label: "Set status", field: "status", placeholder: "0 open · 1 resolved · 2 pending" },
];

const TRIGGERS: Array<{ value: string; label: string }> = [
  { value: "conversation_created", label: "New conversation (first message)" },
  { value: "message_created", label: "Any inbound message" },
];

type EditAction = { type: string; params: Record<string, unknown> };

function actionLabel(type: string): string {
  return ACTION_OPTIONS.find((a) => a.type === type)?.label ?? type;
}

/** Render a compact human summary of an action for the list view. */
function summarizeAction(a: { type: string; params?: Record<string, unknown> }): string {
  const p = a.params ?? {};
  const val =
    typeof p.text === "string"
      ? p.text
      : typeof p.short_code === "string"
        ? `/${p.short_code}`
        : Array.isArray(p.options)
          ? (p.options as unknown[]).join(", ")
          : typeof p.product_id === "string"
            ? p.product_id
            : "";
  return `${actionLabel(a.type)}${val ? `: ${String(val).slice(0, 40)}` : ""}`;
}

export default function WorkflowsPanel({ workspaceId, compact }: Props) {
  const [view, setView] = useState<View>("workflows");
  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center gap-1 border-b border-app bg-app-elevated px-3 py-2">
        {(
          [
            ["workflows", "Workflows"],
            ["sequences", "Drip sequences"],
          ] as Array<[View, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-md px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors ${
              view === key
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:bg-surface hover:text-app"
            }`}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "workflows" ? (
          <WorkflowsView workspaceId={workspaceId} compact={compact} />
        ) : (
          <SequencesView workspaceId={workspaceId} compact={compact} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Workflows ───────────────────────── */

function WorkflowsView({ workspaceId, compact }: Props) {
  const [items, setItems] = useState<WaWorkflow[]>([]);
  const [recipes, setRecipes] = useState<Record<string, WaWorkflowRecipe>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaWorkflow | "new" | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetchWorkflows(workspaceId, true);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.data.items);
    setRecipes(res.data.recipes);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (wf: WaWorkflow) => {
      setItems((prev) => prev.map((x) => (x.id === wf.id ? { ...x, active: !x.active } : x)));
      const res = await updateWorkflow(workspaceId, wf.id, { active: !wf.active });
      if (!res.ok) void refresh();
    },
    [workspaceId, refresh],
  );

  const cloneRecipe = useCallback(
    async (key: string) => {
      const r = recipes[key];
      if (!r) return;
      const res = await createWorkflow(workspaceId, {
        name: r.name,
        description: r.description,
        recipe_key: key,
        active: false,
      });
      if (res.ok) void refresh();
    },
    [workspaceId, recipes, refresh],
  );

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Workflows · {items.length}
        </h3>
        <PrimaryButton onClick={() => setEditing("new")}>
          <MiniIcon name="plus" /> New workflow
        </PrimaryButton>
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {/* Recipe quick-clone strip */}
      {Object.keys(recipes).length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
            Start from a recipe
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(recipes).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => cloneRecipe(r.key)}
                title={r.description}
                className="rounded-full border border-app bg-surface px-2.5 py-1 text-[0.65rem] text-secondary hover:border-tool-accent hover:text-tool-accent"
              >
                + {r.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {items.length === 0 && !editing ? (
        <EmptyState
          kicker="whatsapp.workflows"
          compact={compact}
          title="No workflows yet"
          body={
            <span>
              Build a trigger → conditions → actions flow (welcome bot, FAQ
              auto-reply, lead qualification). It runs through the same anti-ban
              executor as automation.
            </span>
          }
        />
      ) : (
        <ul role="list" className="space-y-2">
          {items.map((wf) => (
            <li
              key={wf.id}
              className="flex items-center justify-between gap-2 rounded-md border border-app bg-surface px-3 py-2"
            >
              <button type="button" onClick={() => setEditing(wf)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-app">{wf.name}</span>
                  <Pill tone={wf.active ? "success" : "neutral"}>
                    {wf.active ? "active" : "off"}
                  </Pill>
                </div>
                <div className="truncate text-[0.65rem] text-faint">
                  {TRIGGERS.find((t) => t.value === wf.trigger)?.label ?? wf.trigger} ·{" "}
                  {(wf.graph?.actions ?? []).length} action(s)
                </div>
              </button>
              <button
                type="button"
                onClick={() => void toggle(wf)}
                className={`shrink-0 rounded-md border px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] ${
                  wf.active
                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-300"
                    : "border-app text-secondary"
                }`}
              >
                {wf.active ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Delete "${wf.name}"?`)) return;
                  const res = await deleteWorkflow(workspaceId, wf.id);
                  if (res.ok) void refresh();
                }}
                className="shrink-0 rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
                aria-label="Delete workflow"
              >
                <MiniIcon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <WorkflowEditor
          workspaceId={workspaceId}
          workflow={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function WorkflowEditor({
  workspaceId,
  workflow,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  workflow: WaWorkflow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [trigger, setTrigger] = useState(workflow?.trigger ?? "message_created");
  const [keywords, setKeywords] = useState(
    Array.isArray(workflow?.graph?.conditions?.keywords)
      ? (workflow!.graph!.conditions!.keywords as string[]).join(", ")
      : "",
  );
  const [actions, setActions] = useState<EditAction[]>(
    (workflow?.graph?.actions ?? []).map((a) => ({ type: a.type, params: a.params ?? {} })),
  );
  const [active, setActive] = useState(workflow?.active ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (actions.length === 0) {
      setError("Add at least one action.");
      return;
    }
    const conditions: Record<string, unknown> = {};
    const kw = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (kw.length) {
      conditions.keywords = kw;
      conditions.match = "contains";
    }
    if (trigger === "conversation_created") conditions.first_message_only = true;
    const graph: WaWorkflowGraph = { trigger, conditions, actions: normalizeActions(actions) };

    setBusy(true);
    const res = workflow
      ? await updateWorkflow(workspaceId, workflow.id, { name: name.trim(), trigger, graph, active })
      : await createWorkflow(workspaceId, { name: name.trim(), trigger, graph, active });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }, [workspaceId, workflow, name, trigger, keywords, actions, active, onSaved]);

  return (
    <BuilderModal title={workflow ? "Edit workflow" : "New workflow"} onClose={onClose}>
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
      </Field>
      <Field label="Trigger">
        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Keyword match (optional, comma-separated)">
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="price, rate, delivery"
          className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
      </Field>

      <ActionListEditor actions={actions} setActions={setActions} />

      <label className="flex items-center gap-2 text-xs text-secondary">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (runs on matching messages)
      </label>
      {error ? <ErrorBlock body={error} /> : null}

      <BuilderFooter busy={busy} onClose={onClose} onSave={save} saveLabel={workflow ? "Save" : "Create"} />
    </BuilderModal>
  );
}

/* ───────────────────────── Sequences ───────────────────────── */

function SequencesView({ workspaceId, compact }: Props) {
  const [items, setItems] = useState<WaSequence[]>([]);
  const [recipes, setRecipes] = useState<Record<string, WaSequenceRecipe>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaSequence | "new" | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetchSequences(workspaceId, true);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.data.items);
    setRecipes(res.data.recipes);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (seq: WaSequence) => {
      setItems((prev) => prev.map((x) => (x.id === seq.id ? { ...x, active: !x.active } : x)));
      const res = await updateSequence(workspaceId, seq.id, { active: !seq.active });
      if (!res.ok) void refresh();
    },
    [workspaceId, refresh],
  );

  const cloneRecipe = useCallback(
    async (key: string) => {
      const r = recipes[key];
      if (!r) return;
      const res = await createSequence(workspaceId, {
        name: r.name,
        description: r.description,
        recipe_key: key,
        active: false,
      });
      if (res.ok) void refresh();
    },
    [workspaceId, recipes, refresh],
  );

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Drip sequences · {items.length}
        </h3>
        <PrimaryButton onClick={() => setEditing("new")}>
          <MiniIcon name="plus" /> New sequence
        </PrimaryButton>
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {Object.keys(recipes).length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
            Start from a recipe
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(recipes).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => cloneRecipe(r.key)}
                title={r.description}
                className="rounded-full border border-app bg-surface px-2.5 py-1 text-[0.65rem] text-secondary hover:border-tool-accent hover:text-tool-accent"
              >
                + {r.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {items.length === 0 && !editing ? (
        <EmptyState
          kicker="whatsapp.sequences"
          compact={compact}
          title="No sequences yet"
          body={
            <span>
              A drip sequence sends timed follow-ups (e.g. welcome now, value
              tomorrow, nudge in 3 days). It stops automatically when the customer
              replies, and respects opt-out + the throttle.
            </span>
          }
        />
      ) : (
        <ul role="list" className="space-y-2">
          {items.map((seq) => (
            <li
              key={seq.id}
              className="flex items-center justify-between gap-2 rounded-md border border-app bg-surface px-3 py-2"
            >
              <button type="button" onClick={() => setEditing(seq)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-app">{seq.name}</span>
                  <Pill tone={seq.active ? "success" : "neutral"}>
                    {seq.active ? "active" : "off"}
                  </Pill>
                </div>
                <div className="truncate text-[0.65rem] text-faint">
                  {(seq.steps ?? []).length} step(s) ·{" "}
                  {seq.active_enrollments ?? 0} enrolled ·{" "}
                  {seq.exit_conditions?.on_reply !== false ? "stops on reply" : "runs to end"}
                </div>
              </button>
              <button
                type="button"
                onClick={() => void toggle(seq)}
                className={`shrink-0 rounded-md border px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] ${
                  seq.active
                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-300"
                    : "border-app text-secondary"
                }`}
              >
                {seq.active ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Delete "${seq.name}"? Active enrollments stop.`)) return;
                  const res = await deleteSequence(workspaceId, seq.id);
                  if (res.ok) void refresh();
                }}
                className="shrink-0 rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
                aria-label="Delete sequence"
              >
                <MiniIcon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <SequenceEditor
          workspaceId={workspaceId}
          sequence={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SequenceEditor({
  workspaceId,
  sequence,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  sequence: WaSequence | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sequence?.name ?? "");
  const [onReply, setOnReply] = useState(sequence?.exit_conditions?.on_reply !== false);
  const [steps, setSteps] = useState<Array<{ delay_minutes: number; actions: EditAction[] }>>(
    (sequence?.steps ?? []).map((s) => ({
      delay_minutes: Number(s.delay_minutes ?? 0),
      actions: (s.actions ?? []).map((a) => ({ type: a.type, params: a.params ?? {} })),
    })),
  );
  const [active, setActive] = useState(sequence?.active ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { delay_minutes: prev.length === 0 ? 0 : 1440, actions: [{ type: "send_text", params: {} }] },
    ]);

  const save = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (steps.length === 0) {
      setError("Add at least one step.");
      return;
    }
    const payloadSteps: WaSequenceStep[] = steps.map((s) => ({
      delay_minutes: Math.max(0, Number(s.delay_minutes) || 0),
      actions: normalizeActions(s.actions),
    }));
    setBusy(true);
    const res = sequence
      ? await updateSequence(workspaceId, sequence.id, {
          name: name.trim(),
          steps: payloadSteps,
          exit_conditions: { on_reply: onReply },
          active,
        })
      : await createSequence(workspaceId, {
          name: name.trim(),
          steps: payloadSteps,
          exit_conditions: { on_reply: onReply },
          active,
        });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }, [workspaceId, sequence, name, steps, onReply, active, onSaved]);

  return (
    <BuilderModal title={sequence ? "Edit sequence" : "New sequence"} onClose={onClose}>
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
      </Field>

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={idx} className="rounded-md border border-app bg-surface p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent">
                Step {idx + 1}
              </span>
              <div className="flex items-center gap-1 text-xs text-secondary">
                {idx === 0 ? (
                  <span className="text-faint">on enroll</span>
                ) : (
                  <>
                    after
                    <input
                      type="number"
                      min={0}
                      value={step.delay_minutes}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, delay_minutes: Number(e.target.value) } : s,
                          ),
                        )
                      }
                      className="w-20 rounded border border-app bg-app-elevated px-1.5 py-0.5 text-xs text-app outline-none"
                    />
                    min
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                  className="ml-1 rounded p-0.5 text-rose-500 hover:bg-rose-500/10"
                  aria-label="Remove step"
                >
                  <MiniIcon name="close" size={12} />
                </button>
              </div>
            </div>
            <ActionListEditor
              actions={step.actions}
              setActions={(updater) =>
                setSteps((prev) =>
                  prev.map((s, i) =>
                    i === idx
                      ? {
                          ...s,
                          actions:
                            typeof updater === "function"
                              ? (updater as (a: EditAction[]) => EditAction[])(s.actions)
                              : updater,
                        }
                      : s,
                  ),
                )
              }
              dense
            />
          </div>
        ))}
        <SecondaryButton onClick={addStep}>
          <MiniIcon name="plus" /> Add step
        </SecondaryButton>
      </div>

      <label className="flex items-center gap-2 text-xs text-secondary">
        <input type="checkbox" checked={onReply} onChange={(e) => setOnReply(e.target.checked)} />
        Stop the sequence if the customer replies
      </label>
      <label className="flex items-center gap-2 text-xs text-secondary">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
      {error ? <ErrorBlock body={error} /> : null}

      <BuilderFooter busy={busy} onClose={onClose} onSave={save} saveLabel={sequence ? "Save" : "Create"} />
    </BuilderModal>
  );
}

/* ───────────────────────── shared editor primitives ───────────────────────── */

function normalizeActions(actions: EditAction[]): Array<{ type: string; params: Record<string, unknown> }> {
  return actions
    .filter((a) => a.type)
    .map((a) => {
      const opt = ACTION_OPTIONS.find((o) => o.type === a.type);
      const params: Record<string, unknown> = { ...a.params };
      // send_menu options come in as a comma string in the editor → array.
      if (a.type === "send_menu" && typeof params.options === "string") {
        params.options = (params.options as string)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (a.type === "set_status" && params.status !== undefined) {
        params.status = Number(params.status);
      }
      void opt;
      return { type: a.type, params };
    });
}

function ActionListEditor({
  actions,
  setActions,
  dense,
}: {
  actions: EditAction[];
  /** Always called with a concrete next array (resolved against current `actions`). */
  setActions: (next: EditAction[]) => void;
  dense?: boolean;
}) {
  const add = () => setActions([...actions, { type: "send_text", params: {} }]);

  return (
    <div className={dense ? "space-y-1.5" : "space-y-2"}>
      {!dense ? (
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Actions
        </div>
      ) : null}
      {actions.map((a, idx) => {
        const opt = ACTION_OPTIONS.find((o) => o.type === a.type);
        const field = opt?.field;
        const fieldVal =
          field && a.params[field] != null
            ? Array.isArray(a.params[field])
              ? (a.params[field] as unknown[]).join(", ")
              : String(a.params[field])
            : "";
        return (
          <div key={idx} className="rounded-md border border-app bg-app-elevated p-1.5">
            <div className="flex items-center gap-1.5">
              <select
                value={a.type}
                onChange={(e) =>
                  setActions(
                    actions.map((x, i) => (i === idx ? { type: e.target.value, params: {} } : x)),
                  )
                }
                className="flex-1 rounded border border-app bg-surface px-1.5 py-1 text-xs text-app outline-none"
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.type} value={o.type}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setActions(actions.filter((_, i) => i !== idx))}
                className="rounded p-0.5 text-rose-500 hover:bg-rose-500/10"
                aria-label="Remove action"
              >
                <MiniIcon name="close" size={12} />
              </button>
            </div>
            {field ? (
              <input
                value={fieldVal}
                onChange={(e) =>
                  setActions(
                    actions.map((x, i) =>
                      i === idx ? { ...x, params: { ...x.params, [field]: e.target.value } } : x,
                    ),
                  )
                }
                placeholder={opt?.placeholder}
                className="mt-1 w-full rounded border border-app bg-surface px-1.5 py-1 text-xs text-app outline-none placeholder:text-faint"
              />
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="w-full rounded-md border border-dashed border-app px-2 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:border-tool-accent hover:text-tool-accent"
      >
        + Add action
      </button>
    </div>
  );
}

function BuilderModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app px-4 py-3">
          <h3 className="text-base font-semibold text-app">{title}</h3>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

function BuilderFooter({
  busy,
  onClose,
  onSave,
  saveLabel,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-app pt-3">
      <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
      <PrimaryButton onClick={onSave} loading={busy}>
        {saveLabel}
      </PrimaryButton>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
