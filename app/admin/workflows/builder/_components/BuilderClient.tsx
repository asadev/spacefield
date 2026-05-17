"use client";

import { useState, useTransition } from "react";

import {
  emptyWorkflowDefinition,
  validateWorkflowDefinition,
  type WorkflowCondition,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowTriggerKind,
} from "@/lib/workflows/types";

import { deleteWorkflow, saveWorkflow, toggleEnabled } from "./_actions";

/**
 * Visual workflow builder — form-based editor that produces a
 * WorkflowDefinition JSON and saves to `public.workflows`.
 *
 * This is intentionally NOT a drag-drop canvas — that's a much bigger
 * piece of work (a11y, keyboard, layout engine, etc). What you get
 * instead: trigger picker + conditions list + steps list, where steps
 * can be reordered with Up/Down buttons and any step can be removed.
 * Once the contract is stable, swapping in a real canvas is a UI-only
 * change since the persisted shape doesn't move.
 *
 * The "AI generate" hook calls /api/admin/workflows/generate with the
 * admin's natural-language prompt and replaces the in-memory draft
 * with whatever JSON comes back. Nothing is saved until the admin
 * clicks Save.
 */

export interface BuilderWorkspace {
  id: string;
  name: string;
}

export interface BuilderWorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_kind: WorkflowTriggerKind;
  enabled: boolean;
  definition: WorkflowDefinition;
  updated_at: string;
}

interface Props {
  workspaces: BuilderWorkspace[];
  workflows: BuilderWorkflowRow[];
}

type StepKind = WorkflowStep["kind"];

const STEP_LABELS: Record<StepKind, string> = {
  create_task: "Create task",
  send_webhook: "Send webhook",
  post_comment: "Post comment",
  wait: "Wait",
  custom_code: "Custom code (admin)",
};

const COND_OPS: WorkflowCondition["op"][] = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "exists",
];

export default function BuilderClient({ workspaces, workflows }: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    workflows[0]?.id ?? "__new__"
  );
  const initialWs =
    workflows[0]?.workspace_id ?? workspaces[0]?.id ?? "";
  const [draft, setDraft] = useState<WorkflowDefinition>(() => {
    if (workflows[0]) return workflows[0].definition;
    return emptyWorkflowDefinition(initialWs);
  });
  const [triggerKind, setTriggerKind] = useState<WorkflowTriggerKind>(
    workflows[0]?.trigger_kind ?? "manual"
  );
  const [enabled, setEnabled] = useState<boolean>(workflows[0]?.enabled ?? true);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiBusy, setAiBusy] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function selectWorkflow(id: string) {
    setSelectedId(id);
    setSaveErrors([]);
    setSaveMsg(null);
    if (id === "__new__") {
      setDraft(emptyWorkflowDefinition(workspaces[0]?.id ?? ""));
      setTriggerKind("manual");
      setEnabled(true);
      return;
    }
    const found = workflows.find((w) => w.id === id);
    if (found) {
      setDraft(found.definition);
      setTriggerKind(found.trigger_kind);
      setEnabled(found.enabled);
    }
  }

  function patchDraft(p: Partial<WorkflowDefinition>) {
    setDraft((prev) => ({ ...prev, ...p }));
  }

  function addStep(kind: StepKind) {
    const step = buildEmptyStep(kind);
    setDraft((prev) => ({ ...prev, steps: [...prev.steps, step] }));
  }

  function removeStep(i: number) {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, idx) => idx !== i),
    }));
  }

  function moveStep(i: number, dir: -1 | 1) {
    setDraft((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.steps.length) return prev;
      const next = [...prev.steps];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...prev, steps: next };
    });
  }

  function patchStep(i: number, patch: Partial<WorkflowStep>) {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((s, idx) =>
        idx === i ? ({ ...s, ...patch } as WorkflowStep) : s
      ),
    }));
  }

  function addCondition() {
    setDraft((prev) => ({
      ...prev,
      conditions: [
        ...(prev.conditions ?? []),
        { left: "", op: "eq", right: "" },
      ],
    }));
  }

  function removeCondition(i: number) {
    setDraft((prev) => ({
      ...prev,
      conditions: (prev.conditions ?? []).filter((_, idx) => idx !== i),
    }));
  }

  function patchCondition(i: number, patch: Partial<WorkflowCondition>) {
    setDraft((prev) => ({
      ...prev,
      conditions: (prev.conditions ?? []).map((c, idx) =>
        idx === i ? { ...c, ...patch } : c
      ),
    }));
  }

  async function runAiGenerate() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await fetch("/api/admin/workflows/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          workspace_id: draft.workspace_id,
        }),
      });
      const payload = (await r.json()) as
        | { ok: true; definition: WorkflowDefinition }
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error);
      setDraft(payload.definition);
      setTriggerKind(payload.definition.trigger.kind);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiBusy(false);
    }
  }

  function handleSave() {
    setSaveErrors([]);
    setSaveMsg(null);
    const inlineErrors = validateWorkflowDefinition({
      ...draft,
      trigger: { ...draft.trigger, kind: triggerKind },
    });
    if (inlineErrors.length > 0) {
      setSaveErrors(inlineErrors);
      return;
    }
    startTransition(async () => {
      const res = await saveWorkflow({
        id: selectedId === "__new__" ? undefined : selectedId,
        workspace_id: draft.workspace_id,
        name: draft.name,
        description: draft.description,
        trigger_kind: triggerKind,
        enabled,
        definition: { ...draft, trigger: { ...draft.trigger, kind: triggerKind } },
      });
      if (!res.ok) {
        setSaveErrors(res.errors);
      } else {
        setSaveMsg("Saved.");
      }
    });
  }

  function handleDelete() {
    if (selectedId === "__new__") return;
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    startTransition(async () => {
      const r = await deleteWorkflow(selectedId);
      if (r.ok) {
        setSelectedId("__new__");
        setDraft(emptyWorkflowDefinition(workspaces[0]?.id ?? ""));
        setSaveMsg("Deleted.");
      } else {
        setSaveErrors([r.error ?? "delete failed"]);
      }
    });
  }

  function handleToggle() {
    if (selectedId === "__new__") return;
    startTransition(async () => {
      const next = !enabled;
      const r = await toggleEnabled(selectedId, next);
      if (r.ok) setEnabled(next);
      else setSaveErrors([r.error ?? "toggle failed"]);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_1fr]">
      {/* ── Left rail: existing workflows + AI generator ── */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-app bg-app-elevated p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Workflows
          </div>
          <button
            type="button"
            onClick={() => selectWorkflow("__new__")}
            className={
              "mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs " +
              (selectedId === "__new__"
                ? "bg-tool-accent/15 text-tool-accent"
                : "text-secondary hover:bg-app/40")
            }
          >
            + New workflow
          </button>
          <ul className="mt-2 space-y-1">
            {workflows.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => selectWorkflow(w.id)}
                  className={
                    "block w-full truncate rounded-md px-2 py-1.5 text-left text-xs " +
                    (selectedId === w.id
                      ? "bg-tool-accent/15 text-tool-accent"
                      : "text-secondary hover:bg-app/40")
                  }
                  title={w.name}
                >
                  <span className="truncate">{w.name}</span>
                  {!w.enabled && (
                    <span className="ml-1 text-[10px] text-faint">(off)</span>
                  )}
                </button>
              </li>
            ))}
            {workflows.length === 0 && (
              <li className="px-2 py-1 text-[11px] text-faint">
                No workflows yet.
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-app bg-app-elevated p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            AI generator
          </div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder='e.g. "When a new high-priority task is created, post a comment and send a Slack webhook"'
            rows={4}
            className="mt-2 w-full rounded-md border border-app bg-app px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          />
          <button
            type="button"
            onClick={runAiGenerate}
            disabled={aiBusy || !aiPrompt.trim()}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {aiBusy ? "Generating…" : "Generate draft"}
          </button>
          {aiError && (
            <div className="mt-2 rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-500">
              {aiError}
            </div>
          )}
          <p className="mt-2 text-[10px] text-faint">
            Drafts are not saved automatically — click Save below once
            you&apos;re happy.
          </p>
        </div>
      </aside>

      {/* ── Right pane: editor ── */}
      <section className="space-y-4">
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Workspace">
              <select
                value={draft.workspace_id}
                onChange={(e) => patchDraft({ workspace_id: e.target.value })}
                className="input"
              >
                {workspaces.length === 0 && (
                  <option value="">— no workspaces —</option>
                )}
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" className="md:col-span-2">
              <textarea
                value={draft.description ?? ""}
                onChange={(e) => patchDraft({ description: e.target.value })}
                rows={2}
                className="input"
              />
            </Field>
            <Field label="Trigger">
              <select
                value={triggerKind}
                onChange={(e) =>
                  setTriggerKind(e.target.value as WorkflowTriggerKind)
                }
                className="input"
              >
                <option value="manual">manual</option>
                <option value="schedule">schedule (cron)</option>
                <option value="event">event</option>
              </select>
            </Field>
            <Field label="Enabled">
              <label className="inline-flex items-center gap-2 text-xs text-app">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Workflow runs on trigger
              </label>
            </Field>
          </div>
        </div>

        {/* Conditions */}
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                Conditions
              </div>
              <div className="text-xs text-muted">
                All conditions must match (implicit AND).
              </div>
            </div>
            <button
              type="button"
              onClick={addCondition}
              className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary hover:border-tool-accent hover:text-app"
            >
              + Condition
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(draft.conditions ?? []).map((c, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_8rem_1fr_auto] items-center gap-2"
              >
                <input
                  value={c.left}
                  onChange={(e) => patchCondition(i, { left: e.target.value })}
                  placeholder="payload.field"
                  className="input"
                />
                <select
                  value={c.op}
                  onChange={(e) =>
                    patchCondition(i, {
                      op: e.target.value as WorkflowCondition["op"],
                    })
                  }
                  className="input"
                >
                  {COND_OPS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <input
                  value={String(c.right ?? "")}
                  onChange={(e) => patchCondition(i, { right: e.target.value })}
                  placeholder="value"
                  className="input"
                />
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-rose-400 hover:border-rose-400"
                >
                  ×
                </button>
              </li>
            ))}
            {(!draft.conditions || draft.conditions.length === 0) && (
              <li className="text-[11px] text-faint">No conditions — fires on every trigger.</li>
            )}
          </ul>
        </div>

        {/* Steps */}
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                Steps
              </div>
              <div className="text-xs text-muted">
                Run top-to-bottom. Use Up/Down to reorder.
              </div>
            </div>
            <div className="flex gap-1">
              {(Object.keys(STEP_LABELS) as StepKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addStep(k)}
                  className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary hover:border-tool-accent hover:text-app"
                >
                  + {STEP_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <ol className="mt-3 space-y-2">
            {draft.steps.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-app bg-app p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-faint">
                    Step {i + 1} · {STEP_LABELS[s.kind]}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(i, -1)}
                      className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-secondary hover:border-tool-accent"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(i, 1)}
                      className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-secondary hover:border-tool-accent"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-rose-400 hover:border-rose-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <StepEditor step={s} onPatch={(p) => patchStep(i, p)} />
                </div>
              </li>
            ))}
            {draft.steps.length === 0 && (
              <li className="rounded-lg border border-dashed border-app p-4 text-center text-[11px] text-faint">
                No steps yet — click a button above to add one.
              </li>
            )}
          </ol>
        </div>

        {/* Definition preview + actions */}
        <details className="rounded-xl border border-app bg-app-elevated p-4">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted">
            JSON preview
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-app p-3 text-[11px] text-secondary">
            {JSON.stringify(
              { ...draft, trigger: { ...draft.trigger, kind: triggerKind }, enabled },
              null,
              2
            )}
          </pre>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-md bg-tool-accent px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {selectedId !== "__new__" && (
            <>
              <button
                type="button"
                onClick={handleToggle}
                disabled={pending}
                className="rounded-md border border-app bg-app px-3 py-2 text-xs text-secondary hover:border-tool-accent hover:text-app disabled:opacity-40"
              >
                {enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-400 hover:border-rose-400 disabled:opacity-40"
              >
                Delete
              </button>
            </>
          )}
          {saveMsg && (
            <span className="text-[11px] text-emerald-400">{saveMsg}</span>
          )}
          {saveErrors.length > 0 && (
            <ul className="ml-2 list-disc pl-5 text-[11px] text-rose-400">
              {saveErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <style jsx>{`
        :global(.input) {
          height: 2.25rem;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border-app, rgba(148, 163, 184, 0.2));
          background: var(--bg-app, transparent);
          padding: 0.375rem 0.625rem;
          font-size: 0.8125rem;
          color: inherit;
          outline: none;
        }
        :global(.input:focus) {
          border-color: var(--tool-accent, #6366f1);
        }
        :global(textarea.input) {
          height: auto;
          min-height: 2.5rem;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────── helpers ────────────────────────── */

function buildEmptyStep(kind: StepKind): WorkflowStep {
  if (kind === "create_task") {
    return { kind: "create_task", payload: { title: "" } };
  }
  if (kind === "send_webhook") {
    return { kind: "send_webhook", url: "", body: "" };
  }
  if (kind === "post_comment") {
    return {
      kind: "post_comment",
      entity: { type: "task", id: "" },
      body: "",
    };
  }
  if (kind === "custom_code") {
    return {
      kind: "custom_code",
      code: "// (trigger, ctx) => any\nreturn { ok: true };",
      timeout_ms: 5000,
    };
  }
  return { kind: "wait", seconds: 60 };
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={
        "flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted " +
        (className ?? "")
      }
    >
      {label}
      {children}
    </label>
  );
}

function StepEditor({
  step,
  onPatch,
}: {
  step: WorkflowStep;
  onPatch: (p: Partial<WorkflowStep>) => void;
}) {
  if (step.kind === "create_task") {
    const payload = step.payload;
    return (
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2">
          <input
            value={payload.title}
            onChange={(e) =>
              onPatch({
                payload: { ...payload, title: e.target.value },
              } as Partial<WorkflowStep>)
            }
            className="input"
          />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <textarea
            value={payload.description ?? ""}
            onChange={(e) =>
              onPatch({
                payload: { ...payload, description: e.target.value },
              } as Partial<WorkflowStep>)
            }
            rows={2}
            className="input"
          />
        </Field>
        <Field label="Priority">
          <select
            value={payload.priority ?? "normal"}
            onChange={(e) =>
              onPatch({
                payload: {
                  ...payload,
                  priority: e.target.value as "low" | "normal" | "high",
                },
              } as Partial<WorkflowStep>)
            }
            className="input"
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
          </select>
        </Field>
        <Field label="Project (optional)">
          <input
            value={payload.project_name ?? ""}
            onChange={(e) =>
              onPatch({
                payload: { ...payload, project_name: e.target.value },
              } as Partial<WorkflowStep>)
            }
            placeholder="e.g. Inbox"
            className="input"
          />
        </Field>
      </div>
    );
  }

  if (step.kind === "send_webhook") {
    return (
      <div className="space-y-2">
        <Field label="URL">
          <input
            value={step.url}
            onChange={(e) => onPatch({ url: e.target.value } as Partial<WorkflowStep>)}
            placeholder="https://hooks.example.com/..."
            className="input"
          />
        </Field>
        <Field label="Body (JSON or text)">
          <textarea
            value={step.body}
            onChange={(e) => onPatch({ body: e.target.value } as Partial<WorkflowStep>)}
            rows={3}
            className="input"
          />
        </Field>
      </div>
    );
  }

  if (step.kind === "post_comment") {
    return (
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field label="Entity type">
          <input
            value={step.entity.type}
            onChange={(e) =>
              onPatch({
                entity: { ...step.entity, type: e.target.value },
              } as Partial<WorkflowStep>)
            }
            placeholder="task, deal, contact…"
            className="input"
          />
        </Field>
        <Field label="Entity id">
          <input
            value={step.entity.id}
            onChange={(e) =>
              onPatch({
                entity: { ...step.entity, id: e.target.value },
              } as Partial<WorkflowStep>)
            }
            placeholder="uuid or external ref"
            className="input"
          />
        </Field>
        <Field label="Body" className="md:col-span-2">
          <textarea
            value={step.body}
            onChange={(e) => onPatch({ body: e.target.value } as Partial<WorkflowStep>)}
            rows={3}
            className="input"
          />
        </Field>
      </div>
    );
  }

  if (step.kind === "custom_code") {
    return (
      <div className="space-y-2">
        <Field label="JS body (admin-only, untrusted sandbox)">
          <textarea
            value={step.code}
            onChange={(e) => onPatch({ code: e.target.value } as Partial<WorkflowStep>)}
            rows={6}
            className="input font-mono text-xs"
            placeholder={"// (trigger, ctx) => any\nreturn { ok: true };"}
          />
        </Field>
        <Field label="Timeout (ms, 50–30000)">
          <input
            type="number"
            min={50}
            max={30000}
            value={step.timeout_ms ?? 5000}
            onChange={(e) =>
              onPatch({ timeout_ms: Number(e.target.value) } as Partial<WorkflowStep>)
            }
            className="input"
          />
        </Field>
        <Field label="Output variable (optional)">
          <input
            value={step.output_var ?? ""}
            onChange={(e) => onPatch({ output_var: e.target.value } as Partial<WorkflowStep>)}
            placeholder="my_result"
            className="input"
          />
        </Field>
      </div>
    );
  }

  // wait
  return (
    <Field label="Seconds">
      <input
        type="number"
        min={0}
        value={step.seconds}
        onChange={(e) =>
          onPatch({ seconds: Number(e.target.value) } as Partial<WorkflowStep>)
        }
        className="input"
      />
    </Field>
  );
}
