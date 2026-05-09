"use client";

import { useState } from "react";

import type { OnboardingFlowRow } from "../../_types";
import { buttonClass, inputClass } from "./_styles";

/**
 * Edit-form for the flow metadata. The step list itself is rendered
 * separately (see `StepEditor`) — this form only handles display_name,
 * description, trigger_event, audience, status.
 *
 * Used by `/admin/onboarding/new` and `/admin/onboarding/[id]`. In create
 * mode the id field is editable and required; in edit mode the id is
 * shown as a locked label.
 */

const TRIGGER_PRESETS = [
  "first_login",
  "signup",
  "feature_unlock",
  "workspace_created",
  "tier_upgraded",
] as const;

export type FlowFormMode = "create" | "edit";

export type FlowFormProps = {
  mode: FlowFormMode;
  action: (formData: FormData) => void;
  flow?: OnboardingFlowRow | null;
};

const DEFAULT_FLOW = {
  id: "",
  display_name: "",
  description: "",
  trigger_event: "first_login",
  audience: "all",
  status: "draft" as const,
};

export default function FlowForm({ mode, action, flow }: FlowFormProps) {
  const initial = flow ?? DEFAULT_FLOW;

  const [id, setId] = useState(initial.id);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [description, setDescription] = useState(initial.description);
  const [triggerEvent, setTriggerEvent] = useState(initial.trigger_event);
  const [triggerCustom, setTriggerCustom] = useState(
    TRIGGER_PRESETS.includes(
      initial.trigger_event as (typeof TRIGGER_PRESETS)[number]
    )
      ? false
      : true
  );
  const [audience, setAudience] = useState(initial.audience);
  const [status, setStatus] = useState<"live" | "draft" | "archived">(
    initial.status
  );

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
            and per-user state — make it stable.
          </p>
        </header>

        {mode === "create" && (
          <Field label="Flow id" hint="lowercase, alphanum + . _ -">
            <input
              name="id"
              required
              maxLength={64}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. first_login_v1"
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
          <h2 className="text-sm font-semibold text-app">Trigger &amp; audience</h2>
          <p className="mt-0.5 text-xs text-muted">
            When the runtime should fire this flow and who should see it.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Trigger event"
            hint="Pick a preset or type a custom event name."
          >
            <div className="flex flex-col gap-2">
              <select
                value={triggerCustom ? "__custom__" : triggerEvent}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setTriggerCustom(true);
                  } else {
                    setTriggerCustom(false);
                    setTriggerEvent(e.target.value);
                  }
                }}
                className={inputClass}
              >
                {TRIGGER_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__custom__">custom…</option>
              </select>
              {triggerCustom && (
                <input
                  name="trigger_event"
                  required
                  value={triggerEvent}
                  onChange={(e) => setTriggerEvent(e.target.value)}
                  placeholder="custom_event_name"
                  className={`${inputClass} font-mono text-xs`}
                  spellCheck={false}
                  autoComplete="off"
                />
              )}
              {!triggerCustom && (
                <input type="hidden" name="trigger_event" value={triggerEvent} />
              )}
            </div>
          </Field>

          <Field label="Audience" hint='Free-form. Default "all".'>
            <input
              name="audience"
              maxLength={120}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="all"
              className={inputClass}
              autoComplete="off"
            />
          </Field>

          <Field label="Status">
            <select
              name="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "live" | "draft" | "archived")
              }
              className={inputClass}
            >
              <option value="draft">draft</option>
              <option value="live">live</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="submit" className={buttonClass}>
          {mode === "create" ? "Create flow" : "Save changes"}
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
