"use client";

import { useState } from "react";

import type { PickerOption } from "../_data";
import { buttonClass, buttonGhostClass, inputClass } from "./_styles";

/**
 * Step editor for an `agent_workflows` row. Renders the existing steps as
 * cards (reorder + delete via server-action forms) and an add-step form
 * at the bottom.
 *
 * Steps are stored as `{ kind, skill_id?, tool_name?, prompt_id?,
 *   condition?, output_var? }`.
 */

export type WorkflowStep = {
  kind: "skill" | "tool" | "branch" | "prompt";
  skill_id?: string;
  tool_name?: string;
  prompt_id?: string;
  condition?: string;
  output_var?: string;
};

export type StepEditorProps = {
  workflowId: string;
  steps: WorkflowStep[];
  skillOptions: PickerOption[];
  promptOptions: PickerOption[];
  /** Server actions, passed in from the page. */
  addStep: (formData: FormData) => void;
  removeStep: (formData: FormData) => void;
  moveStep: (formData: FormData) => void;
};

export default function StepEditor({
  workflowId,
  steps,
  skillOptions,
  promptOptions,
  addStep,
  removeStep,
  moveStep,
}: StepEditorProps) {
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {steps.length === 0 ? (
          <li className="rounded-xl border border-dashed border-app bg-app/40 p-6 text-center text-xs text-faint">
            No steps yet. Use the form below to add the first step.
          </li>
        ) : (
          steps.map((step, idx) => (
            <li
              key={`${idx}-${step.kind}`}
              className="rounded-xl border border-app bg-app-elevated p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[10px] tabular-nums uppercase tracking-wide text-secondary">
                      step {idx + 1}
                    </span>
                    <KindLabel kind={step.kind} />
                    {step.condition && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                        if {trim(step.condition, 32)}
                      </span>
                    )}
                    {step.output_var && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-500">
                        →&nbsp;{step.output_var}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-app">
                    <StepBody step={step} skillOptions={skillOptions} promptOptions={promptOptions} />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={moveStep} className="inline">
                    <input type="hidden" name="id" value={workflowId} />
                    <input type="hidden" name="index" value={idx} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      title="Move up"
                      disabled={idx === 0}
                      className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:opacity-30"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveStep} className="inline">
                    <input type="hidden" name="id" value={workflowId} />
                    <input type="hidden" name="index" value={idx} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      title="Move down"
                      disabled={idx === steps.length - 1}
                      className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </form>
                  <form action={removeStep} className="inline">
                    <input type="hidden" name="id" value={workflowId} />
                    <input type="hidden" name="index" value={idx} />
                    <button
                      type="submit"
                      title="Remove step"
                      className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-500 transition-opacity hover:opacity-80"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))
        )}
      </ol>

      <AddStepForm
        workflowId={workflowId}
        skillOptions={skillOptions}
        promptOptions={promptOptions}
        addStep={addStep}
      />
    </div>
  );
}

function StepBody({
  step,
  skillOptions,
  promptOptions,
}: {
  step: WorkflowStep;
  skillOptions: PickerOption[];
  promptOptions: PickerOption[];
}) {
  if (step.kind === "skill") {
    const skill = skillOptions.find((s) => s.id === step.skill_id);
    return (
      <span>
        Run skill{" "}
        <code className="rounded border border-app bg-app px-1 py-0.5 font-mono text-xs">
          {step.skill_id}
        </code>
        {skill && (
          <span className="ml-2 text-xs text-faint">— {skill.label}</span>
        )}
      </span>
    );
  }
  if (step.kind === "tool") {
    return (
      <span>
        Call tool{" "}
        <code className="rounded border border-app bg-app px-1 py-0.5 font-mono text-xs">
          {step.tool_name}
        </code>
        {step.skill_id && (
          <span className="ml-2 text-xs text-faint">
            from skill <code className="font-mono">{step.skill_id}</code>
          </span>
        )}
      </span>
    );
  }
  if (step.kind === "prompt") {
    const prompt = promptOptions.find((p) => p.id === step.prompt_id);
    return (
      <span>
        Render prompt{" "}
        <code className="rounded border border-app bg-app px-1 py-0.5 font-mono text-xs">
          {step.prompt_id}
        </code>
        {prompt && (
          <span className="ml-2 text-xs text-faint">— {prompt.label}</span>
        )}
      </span>
    );
  }
  if (step.kind === "branch") {
    return (
      <span className="text-secondary">
        Branch on condition{" "}
        <code className="rounded border border-app bg-app px-1 py-0.5 font-mono text-xs">
          {step.condition}
        </code>
      </span>
    );
  }
  return <span className="text-faint">unknown step</span>;
}

function KindLabel({ kind }: { kind: WorkflowStep["kind"] }) {
  const styles: Record<WorkflowStep["kind"], string> = {
    skill: "bg-tool-accent-soft text-tool-accent",
    tool: "bg-emerald-500/15 text-emerald-500",
    branch: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    prompt: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[kind]}`}
    >
      {kind}
    </span>
  );
}

function trim(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function AddStepForm({
  workflowId,
  skillOptions,
  promptOptions,
  addStep,
}: {
  workflowId: string;
  skillOptions: PickerOption[];
  promptOptions: PickerOption[];
  addStep: (formData: FormData) => void;
}) {
  const [kind, setKind] = useState<WorkflowStep["kind"]>("skill");

  return (
    <form
      action={addStep}
      className="space-y-3 rounded-xl border border-dashed border-app bg-app/40 p-4"
    >
      <input type="hidden" name="id" value={workflowId} />
      <header>
        <h3 className="text-sm font-semibold text-app">Add step</h3>
        <p className="mt-0.5 text-xs text-muted">
          Steps run in order. Branches use the <code>condition</code> to
          decide whether the following step runs. Output vars expose values
          to later steps as <code>{`{{var}}`}</code>.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Kind">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as WorkflowStep["kind"])}
            className={inputClass}
          >
            <option value="skill">skill</option>
            <option value="tool">tool</option>
            <option value="prompt">prompt</option>
            <option value="branch">branch</option>
          </select>
        </Field>
        <Field label="Output var (optional)">
          <input
            name="output_var"
            placeholder="result"
            className={inputClass}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      </div>

      {kind === "skill" && (
        <Field label="Skill">
          <select
            name="skill_id"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Pick a skill…
            </option>
            {skillOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {s.id}
                {s.hint ? ` (${s.hint})` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {kind === "tool" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Tool name (required)">
            <input
              name="tool_name"
              required
              placeholder="snake_case"
              className={inputClass}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Owning skill (optional)">
            <select
              name="skill_id"
              defaultValue=""
              className={inputClass}
            >
              <option value="">— none —</option>
              {skillOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.id}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {kind === "prompt" && (
        <Field label="Prompt">
          <select
            name="prompt_id"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Pick a prompt…
            </option>
            {promptOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.id}
                {p.hint ? ` (${p.hint})` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {kind === "branch" && (
        <Field
          label="Condition (required)"
          hint="Free-form expression evaluated by the runtime, e.g. result.score > 0.7"
        >
          <input
            name="condition"
            required
            placeholder="result.score > 0.7"
            className={`${inputClass} font-mono text-xs`}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      )}

      {kind !== "branch" && (
        <Field
          label="Condition (optional)"
          hint="If set, only run this step when the expression is truthy."
        >
          <input
            name="condition"
            placeholder="last.status === 'success'"
            className={`${inputClass} font-mono text-xs`}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="submit" className={buttonGhostClass}>
          + Add step
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
