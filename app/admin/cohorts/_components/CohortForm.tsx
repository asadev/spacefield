/**
 * Shared cohort form for create + edit. Same shape; the action callback
 * decides which RPC to call. The id field is editable on create, locked
 * on edit (it's the primary key).
 */

import { buttonClass, inputClass } from "../../_lib";
import type { CohortRow } from "../../_types";

const DEFAULT_DEFINITION = `{
  "tier": "pro",
  "signed_up_after": "2026-01-01"
}`;

type Props = {
  cohort: CohortRow | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
};

export default function CohortForm({ cohort, action, submitLabel }: Props) {
  const editing = cohort !== null;
  const definitionText = cohort
    ? JSON.stringify(cohort.definition ?? {}, null, 2)
    : DEFAULT_DEFINITION;
  return (
    <form action={action} className="space-y-5">
      {editing && <input type="hidden" name="id" value={cohort.id} />}

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
            defaultValue={cohort?.id ?? ""}
            placeholder="paying-pro-2026"
            pattern="^[a-z][a-z0-9_-]{1,62}$"
            className={`${inputClass} font-mono ${editing ? "opacity-60" : ""}`}
          />
        </Field>
        <Field label="Display name" hint="Shown in admin tables and dropdowns.">
          <input
            type="text"
            name="display_name"
            required
            defaultValue={cohort?.display_name ?? ""}
            placeholder="Paying Pros (signed up in 2026)"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          name="description"
          rows={2}
          defaultValue={cohort?.description ?? ""}
          placeholder="Short note about who's in this segment."
          className={inputClass}
        />
      </Field>

      <Field
        label="Definition (JSON)"
        hint={
          "Object keys interpreted by recompute. Currently supports `tier`, " +
          "`signed_up_after`, `signed_up_before`. Other keys are stored but " +
          "ignored — TODO add `has_used_app`, `min_workspaces`, etc."
        }
      >
        <textarea
          name="definition"
          rows={8}
          spellCheck={false}
          defaultValue={definitionText}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <Field label="Enabled" hint="Disabled cohorts won't refresh on cron.">
        <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={cohort?.enabled ?? true}
            className="h-4 w-4 rounded border-app accent-tool-accent"
          />
          <span>Cohort is on</span>
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
