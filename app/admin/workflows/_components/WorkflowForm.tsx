"use client";

import { useState } from "react";

import type { AgentWorkflowRow } from "../../_types";
import { buttonClass, inputClass } from "./_styles";

/**
 * Edit-form for the workflow metadata. The step list itself is rendered
 * separately (see `StepEditor`) — this form only handles display_name,
 * description, status, trigger_kind, and trigger_config (JSON).
 *
 * Used by both `/admin/workflows/new` and `/admin/workflows/[id]`. In
 * create mode the id field is editable and required; in edit mode the id
 * is shown as a locked label.
 */

export type WorkflowFormMode = "create" | "edit";

export type WorkflowFormProps = {
  mode: WorkflowFormMode;
  action: (formData: FormData) => void;
  workflow?: AgentWorkflowRow | null;
};

const DEFAULT_WORKFLOW = {
  id: "",
  display_name: "",
  description: "",
  status: "draft" as const,
  trigger_kind: "manual" as const,
  trigger_config: {} as Record<string, unknown>,
};

export default function WorkflowForm({
  mode,
  action,
  workflow,
}: WorkflowFormProps) {
  const initial = workflow ?? DEFAULT_WORKFLOW;

  const [id, setId] = useState(initial.id);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState<"live" | "draft" | "disabled">(
    initial.status
  );
  const [triggerKind, setTriggerKind] = useState<"manual" | "event" | "cron">(
    initial.trigger_kind
  );
  const [triggerConfig, setTriggerConfig] = useState<string>(() => {
    const cfg = initial.trigger_config ?? {};
    if (Object.keys(cfg).length === 0) return "{}";
    try {
      return JSON.stringify(cfg, null, 2);
    } catch {
      return "{}";
    }
  });
  const [triggerConfigError, setTriggerConfigError] = useState<string | null>(
    null
  );

  function validateTriggerConfig(text: string) {
    setTriggerConfig(text);
    if (!text.trim()) {
      setTriggerConfigError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setTriggerConfigError("must be a JSON object");
      } else {
        setTriggerConfigError(null);
      }
    } catch (e) {
      setTriggerConfigError((e as Error).message);
    }
  }

  return (
    <form
      action={action}
      className="space-y-6 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && (
        <input type="hidden" name="id" value={initial.id} />
      )}

      <section className="space-y-4">
        <header>
          <h2 className="text-sm font-semibold text-app">Identity</h2>
          <p className="mt-0.5 text-xs text-muted">
            Identifier and human labels. The id is referenced in audit logs
            and step output variables — make it stable.
          </p>
        </header>

        {mode === "create" && (
          <Field label="Workflow id" hint="lowercase, alphanum + . _ -">
            <input
              name="id"
              required
              maxLength={64}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. lead_intake_v1"
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}

        <Field label="Display name" hint="What admins see in lists.">
          <input
            name="display_name"
            required
            maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field label="Description" hint="One-paragraph summary.">
          <textarea
            name="description"
            rows={2}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </Field>
      </section>

      <hr className="border-app" />

      <section className="space-y-4">
        <header>
          <h2 className="text-sm font-semibold text-app">Trigger</h2>
          <p className="mt-0.5 text-xs text-muted">
            How the workflow gets started. <em>manual</em>: runs on admin /
            user dispatch. <em>event</em>: runs from an event-bus emit (use
            <code className="font-mono"> trigger_config.event </code>to set
            the listener). <em>cron</em>: runs on a schedule (use
            <code className="font-mono"> trigger_config.schedule </code>with
            a cron expression).
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Trigger kind">
            <select
              name="trigger_kind"
              value={triggerKind}
              onChange={(e) =>
                setTriggerKind(
                  e.target.value as "manual" | "event" | "cron"
                )
              }
              className={inputClass}
            >
              <option value="manual">manual</option>
              <option value="event">event</option>
              <option value="cron">cron</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              name="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "live" | "draft" | "disabled")
              }
              className={inputClass}
            >
              <option value="draft">draft</option>
              <option value="live">live</option>
              <option value="disabled">disabled</option>
            </select>
          </Field>
        </div>

        <Field
          label="Trigger config (JSON object)"
          hint={
            triggerKind === "cron"
              ? 'Example: { "schedule": "0 9 * * *" }'
              : triggerKind === "event"
                ? 'Example: { "event": "workspace.member.added" }'
                : "Optional. Free-form JSON for the runtime to consume."
          }
        >
          <textarea
            name="trigger_config"
            rows={4}
            value={triggerConfig}
            onChange={(e) => validateTriggerConfig(e.target.value)}
            className={`${inputClass} resize-y font-mono text-xs`}
            spellCheck={false}
          />
          {triggerConfigError && (
            <p className="mt-1 text-xs text-rose-500">
              {triggerConfigError}
            </p>
          )}
        </Field>
      </section>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          className={buttonClass}
          disabled={!!triggerConfigError}
        >
          {mode === "create" ? "Create workflow" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}
