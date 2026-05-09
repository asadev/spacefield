"use client";

import { useState } from "react";

import type {
  OnboardingStepKind,
  OnboardingStepRow,
} from "../../_types";
import KindChipClient from "./KindChipClient";
import { buttonGhostClass, inputClass } from "./_styles";

/**
 * Step editor for an `onboarding_flows` row. Renders existing steps as
 * cards (each card is its own form for inline edit + reorder + delete via
 * server actions) and an add-step form at the bottom.
 *
 * All mutations go through server actions passed in by the parent page.
 */

const KIND_OPTIONS: OnboardingStepKind[] = [
  "welcome",
  "tour",
  "form",
  "video",
  "checklist",
  "call-to-action",
];

export type StepEditorProps = {
  flowId: string;
  steps: OnboardingStepRow[];
  addStep: (formData: FormData) => void;
  updateStep: (formData: FormData) => void;
  deleteStep: (formData: FormData) => void;
  moveStep: (formData: FormData) => void;
};

export default function StepEditor({
  flowId,
  steps,
  addStep,
  updateStep,
  deleteStep,
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
            <StepCard
              key={step.id}
              step={step}
              index={idx}
              total={steps.length}
              updateStep={updateStep}
              deleteStep={deleteStep}
              moveStep={moveStep}
            />
          ))
        )}
      </ol>

      <AddStepForm flowId={flowId} addStep={addStep} />
    </div>
  );
}

/* ──────────────────── per-step card ──────────────────── */

function StepCard({
  step,
  index,
  total,
  updateStep,
  deleteStep,
  moveStep,
}: {
  step: OnboardingStepRow;
  index: number;
  total: number;
  updateStep: (formData: FormData) => void;
  deleteStep: (formData: FormData) => void;
  moveStep: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);

  const configText = (() => {
    try {
      const cfg = step.config ?? {};
      if (Object.keys(cfg).length === 0) return "{}";
      return JSON.stringify(cfg, null, 2);
    } catch {
      return "{}";
    }
  })();

  return (
    <li className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[10px] tabular-nums uppercase tracking-wide text-secondary">
              step {index + 1}
            </span>
            <KindChipClient kind={step.kind} />
            {step.cta_label && (
              <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] text-tool-accent">
                CTA: {trim(step.cta_label, 24)}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm font-medium text-app">{step.title}</div>
          {step.body && (
            <div className="mt-1 max-w-2xl whitespace-pre-line text-xs text-secondary">
              {step.body}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <form action={moveStep} className="inline">
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              title="Move up"
              disabled={index === 0}
              className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:opacity-30"
            >
              ↑
            </button>
          </form>
          <form action={moveStep} className="inline">
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              title="Move down"
              disabled={index === total - 1}
              className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:opacity-30"
            >
              ↓
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
          >
            {open ? "Close" : "Edit"}
          </button>
          <form action={deleteStep} className="inline">
            <input type="hidden" name="step_id" value={step.id} />
            <button
              type="submit"
              title="Delete step"
              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-500 transition-opacity hover:opacity-80"
            >
              ✕
            </button>
          </form>
        </div>
      </div>

      {open && (
        <form
          action={updateStep}
          className="mt-4 space-y-3 rounded-lg border border-dashed border-app bg-app/40 p-3"
        >
          <input type="hidden" name="step_id" value={step.id} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Kind">
              <select
                name="kind"
                defaultValue={step.kind}
                className={inputClass}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={step.title}
                className={inputClass}
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="Body">
            <textarea
              name="body"
              rows={3}
              defaultValue={step.body ?? ""}
              className={`${inputClass} resize-y`}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="CTA label (optional)">
              <input
                name="cta_label"
                maxLength={120}
                defaultValue={step.cta_label ?? ""}
                placeholder="Get started"
                className={inputClass}
                autoComplete="off"
              />
            </Field>
            <Field label="CTA href (optional)">
              <input
                name="cta_href"
                maxLength={400}
                defaultValue={step.cta_href ?? ""}
                placeholder="/dashboard"
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </div>
          <Field
            label="Config (JSON object)"
            hint="Free-form metadata for the runtime — selectors, video URLs, etc."
          >
            <ConfigField defaultValue={configText} />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Save step
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/* ──────────────────── add-step form ──────────────────── */

function AddStepForm({
  flowId,
  addStep,
}: {
  flowId: string;
  addStep: (formData: FormData) => void;
}) {
  return (
    <form
      action={addStep}
      className="space-y-3 rounded-xl border border-dashed border-app bg-app/40 p-4"
    >
      <input type="hidden" name="flow_id" value={flowId} />
      <header>
        <h3 className="text-sm font-semibold text-app">Add step</h3>
        <p className="mt-0.5 text-xs text-muted">
          Steps run in order. Pick a kind, write a title and body, and the
          runtime will render the corresponding UI.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Kind">
          <select name="kind" defaultValue="welcome" className={inputClass}>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title (required)">
          <input
            name="title"
            required
            maxLength={200}
            placeholder="Welcome aboard"
            className={inputClass}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Body">
        <textarea
          name="body"
          rows={3}
          placeholder="Short intro copy. Markdown ok."
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="CTA label (optional)">
          <input
            name="cta_label"
            maxLength={120}
            placeholder="Get started"
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label="CTA href (optional)">
          <input
            name="cta_href"
            maxLength={400}
            placeholder="/dashboard"
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>

      <Field
        label="Config (JSON object — optional)"
        hint="Use {} or leave blank if there's nothing to add."
      >
        <ConfigField defaultValue="{}" />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="submit" className={buttonGhostClass}>
          + Add step
        </button>
      </div>
    </form>
  );
}

/* ──────────────────── helpers ──────────────────── */

function ConfigField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  function onChange(text: string) {
    setValue(text);
    if (!text.trim()) {
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("must be a JSON object");
      } else {
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <textarea
        name="config"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-y font-mono text-xs`}
        spellCheck={false}
      />
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </>
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

function trim(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
