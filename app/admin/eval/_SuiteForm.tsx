import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import { SCORING_LABELS, SCORING_METHODS, TARGET_KINDS } from "./_helpers";

import type {
  EvalScoringMethod,
  EvalSuiteRow,
  EvalTargetKind,
} from "../_types";

/**
 * Shared form for creating and editing an eval suite. Used by both the
 * `/new` page and the `/[id]` edit page. Server-component — wired to a
 * server action via the `action` prop.
 *
 * The cases editor is a JSON textarea (per spec). When the suite is
 * brand-new, defaults to an example case that demonstrates the shape.
 */

export type SuiteFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  suite?: EvalSuiteRow;
  targets: {
    agents: { id: string; display_name: string }[];
    skills: { id: string; display_name: string }[];
    workflows: { id: string; display_name: string }[];
  };
  selectedKind: EvalTargetKind;
};

const EXAMPLE_CASES = JSON.stringify(
  [
    {
      name: "happy path",
      input: "What's the weather in Dubai?",
      expected: "It's hot.",
    },
  ],
  null,
  2
);

export default function SuiteForm({
  mode,
  action,
  suite,
  targets,
  selectedKind,
}: SuiteFormProps) {
  const isEdit = mode === "edit";
  const idValue = suite?.id ?? "";
  const targetOptions =
    selectedKind === "agent"
      ? targets.agents
      : selectedKind === "skill"
        ? targets.skills
        : targets.workflows;
  const casesText = suite
    ? JSON.stringify(suite.cases ?? [], null, 2)
    : EXAMPLE_CASES;

  return (
    <form action={action} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={idValue} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Suite ID"
          hint="Lowercase letters, digits, hyphens, underscores. Cannot change."
        >
          <input
            type="text"
            name="id"
            required
            defaultValue={idValue}
            disabled={isEdit}
            placeholder="agent-greeting-quality"
            pattern="^[a-z][a-z0-9_-]*$"
            className={`${inputClass} font-mono ${
              isEdit ? "opacity-60" : ""
            }`}
          />
        </Field>
        <Field label="Display name">
          <input
            type="text"
            name="display_name"
            required
            defaultValue={suite?.display_name ?? ""}
            placeholder="Agent greeting quality"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          name="description"
          rows={2}
          defaultValue={suite?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Target kind">
          {/* GET form on the new page re-renders with new dropdown — for
              the edit page we still allow changing it but the dropdown
              uses the suite's current kind by default. The selector is
              also a GET so changing it on `/new?target_kind=skill` will
              re-render the candidate list below. */}
          <select
            name="target_kind"
            defaultValue={selectedKind}
            className={inputClass}
          >
            {TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Target ID"
          hint="The agent / skill / workflow this suite tests."
        >
          <select
            name="target_id"
            defaultValue={suite?.target_id ?? ""}
            className={inputClass}
          >
            <option value="">— Choose {selectedKind} —</option>
            {targetOptions.length === 0 ? (
              <option value="" disabled>
                (no {selectedKind}s registered)
              </option>
            ) : (
              targetOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name} ({t.id})
                </option>
              ))
            )}
          </select>
        </Field>
      </div>

      <Field label="Scoring method">
        <select
          name="scoring_method"
          defaultValue={suite?.scoring_method ?? "exact"}
          className={inputClass}
        >
          {SCORING_METHODS.map((m) => (
            <option key={m} value={m}>
              {SCORING_LABELS[m as EvalScoringMethod]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Cases (JSON array)"
        hint="An array of {name, input, expected}. Input/expected can be any JSON value."
      >
        <textarea
          name="cases"
          rows={12}
          spellCheck={false}
          defaultValue={casesText}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <Field label="Enabled">
        <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={suite ? suite.enabled : true}
            className="h-4 w-4 rounded border-app accent-tool-accent"
          />
          <span>Suite is enabled</span>
        </label>
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="submit" className={buttonClass}>
          {isEdit ? "Save changes" : "Create suite"}
        </button>
        <Link href="/admin/eval" className={buttonGhostClass}>
          Cancel
        </Link>
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
