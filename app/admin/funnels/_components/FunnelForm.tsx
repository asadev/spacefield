/**
 * Shared funnel form for create + edit. Steps live as a JSON textarea —
 * matches the v3 contract's "drag-step builder is a K-area concern" note.
 * Here we keep it editable but textual; admins paste an array of
 * { name, event_kind, match }.
 */

import { buttonClass, inputClass } from "../../_lib";
import type { FunnelRow } from "../../_types";
import { asFunnelSteps, DEFAULT_FUNNEL_STEPS } from "../_helpers";

type Props = {
  funnel: FunnelRow | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
};

export default function FunnelForm({ funnel, action, submitLabel }: Props) {
  const editing = funnel !== null;
  const stepsText = funnel
    ? JSON.stringify(asFunnelSteps(funnel.steps), null, 2)
    : JSON.stringify(DEFAULT_FUNNEL_STEPS, null, 2);

  return (
    <form action={action} className="space-y-5">
      {editing && <input type="hidden" name="id" value={funnel.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="ID"
          hint={
            editing
              ? "ID is the primary key — not editable."
              : "Lowercase letters, digits, hyphen, underscore. 2–63 characters."
          }
        >
          <input
            type="text"
            name="id"
            required={!editing}
            disabled={editing}
            defaultValue={funnel?.id ?? ""}
            placeholder="signup-to-pro"
            pattern="^[a-z][a-z0-9_-]{1,62}$"
            className={`${inputClass} font-mono ${editing ? "opacity-60" : ""}`}
          />
        </Field>
        <Field label="Display name" hint="Shown in admin tables.">
          <input
            type="text"
            name="display_name"
            required
            defaultValue={funnel?.display_name ?? ""}
            placeholder="Sign-up → Pro"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          name="description"
          rows={2}
          defaultValue={funnel?.description ?? ""}
          placeholder="Notes about what this funnel measures."
          className={inputClass}
        />
      </Field>

      <Field
        label="Steps (JSON array)"
        hint={
          "Each step: { name, event_kind, match }. The conversion view counts " +
          "distinct users where funnel_events.step_index = i in the date range. " +
          "max 12 steps."
        }
      >
        <textarea
          name="steps"
          rows={14}
          spellCheck={false}
          defaultValue={stepsText}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <Field label="Enabled" hint="Disabled funnels stop accepting new events.">
        <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={funnel?.enabled ?? true}
            className="h-4 w-4 rounded border-app accent-tool-accent"
          />
          <span>Funnel is on</span>
        </label>
      </Field>

      <div className="pt-2">
        <button type="submit" className={buttonClass}>
          {submitLabel}
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
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
