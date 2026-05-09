"use client";

import { useState } from "react";

import type { ProductTourRow } from "../../_types";
import { buttonClass, inputClass } from "./_styles";

/**
 * Edit-form for a product_tours row.
 *
 *   display_name, description, trigger_route, trigger_kind, steps (JSON
 *   textarea — array of `{ target_selector, title, body, placement }`),
 *   status.
 *
 * Validation: steps JSON must parse + be an array. The server action
 * re-validates each step (target_selector + title required).
 *
 * Used by `/admin/tours/new` and `/admin/tours/[id]`. In create mode the
 * id field is editable and required; in edit mode the id is hidden.
 */

export type TourFormMode = "create" | "edit";

export type TourFormProps = {
  mode: TourFormMode;
  action: (formData: FormData) => void;
  tour?: ProductTourRow | null;
};

const PLACEHOLDER_STEPS = `[
  {
    "target_selector": "#sidebar-toggle",
    "title": "Sidebar",
    "body": "Click here to toggle the sidebar.",
    "placement": "right"
  }
]`;

const DEFAULT_TOUR = {
  id: "",
  display_name: "",
  description: "",
  trigger_route: "",
  trigger_kind: "manual" as const,
  status: "draft" as const,
  steps: [] as unknown[],
};

export default function TourForm({ mode, action, tour }: TourFormProps) {
  const initial = tour
    ? {
        id: tour.id,
        display_name: tour.display_name,
        description: tour.description,
        trigger_route: tour.trigger_route ?? "",
        trigger_kind: tour.trigger_kind,
        status: tour.status,
        steps: tour.steps ?? [],
      }
    : DEFAULT_TOUR;

  const [id, setId] = useState(initial.id);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [description, setDescription] = useState(initial.description);
  const [triggerRoute, setTriggerRoute] = useState(initial.trigger_route);
  const [triggerKind, setTriggerKind] = useState<
    "manual" | "first_visit" | "feature_flag" | "dom_query"
  >(initial.trigger_kind);
  const [status, setStatus] = useState<"live" | "draft" | "archived">(
    initial.status
  );

  const initialStepsText = (() => {
    if (!Array.isArray(initial.steps) || initial.steps.length === 0) {
      return mode === "create" ? PLACEHOLDER_STEPS : "[]";
    }
    try {
      return JSON.stringify(initial.steps, null, 2);
    } catch {
      return "[]";
    }
  })();

  const [stepsText, setStepsText] = useState(initialStepsText);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [stepsCount, setStepsCount] = useState<number | null>(() => {
    if (!Array.isArray(initial.steps)) return 0;
    return initial.steps.length;
  });

  function validateSteps(text: string) {
    setStepsText(text);
    if (!text.trim()) {
      setStepsError(null);
      setStepsCount(0);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setStepsError("must be a JSON array");
        setStepsCount(null);
        return;
      }
      // Light shape check — server re-validates.
      for (let i = 0; i < parsed.length; i += 1) {
        const s = parsed[i];
        if (!s || typeof s !== "object" || Array.isArray(s)) {
          setStepsError(`steps[${i}]: must be an object`);
          setStepsCount(null);
          return;
        }
        const obj = s as Record<string, unknown>;
        if (typeof obj.target_selector !== "string" || !obj.target_selector.trim()) {
          setStepsError(`steps[${i}]: missing target_selector`);
          setStepsCount(null);
          return;
        }
        if (typeof obj.title !== "string" || !obj.title.trim()) {
          setStepsError(`steps[${i}]: missing title`);
          setStepsCount(null);
          return;
        }
      }
      setStepsError(null);
      setStepsCount(parsed.length);
    } catch (e) {
      setStepsError((e as Error).message);
      setStepsCount(null);
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
            and the runtime — make it stable.
          </p>
        </header>

        {mode === "create" && (
          <Field label="Tour id" hint="lowercase, alphanum + . _ -">
            <input
              name="id"
              required
              maxLength={64}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. dashboard_intro_v1"
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
            How the tour starts.{" "}
            <em>manual</em>: only on explicit dispatch.{" "}
            <em>first_visit</em>: on the user&apos;s first visit to{" "}
            <code className="font-mono">trigger_route</code>.{" "}
            <em>feature_flag</em>: when a flag is on.{" "}
            <em>dom_query</em>: when a selector matches.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Trigger kind">
            <select
              name="trigger_kind"
              value={triggerKind}
              onChange={(e) =>
                setTriggerKind(
                  e.target.value as
                    | "manual"
                    | "first_visit"
                    | "feature_flag"
                    | "dom_query"
                )
              }
              className={inputClass}
            >
              <option value="manual">manual</option>
              <option value="first_visit">first_visit</option>
              <option value="feature_flag">feature_flag</option>
              <option value="dom_query">dom_query</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              name="status"
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as "live" | "draft" | "archived"
                )
              }
              className={inputClass}
            >
              <option value="draft">draft</option>
              <option value="live">live</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </div>

        <Field
          label="Trigger route"
          hint="Pathname the runtime watches. Optional for manual tours."
        >
          <input
            name="trigger_route"
            maxLength={400}
            value={triggerRoute}
            onChange={(e) => setTriggerRoute(e.target.value)}
            placeholder="/dashboard"
            className={`${inputClass} font-mono text-xs`}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      </section>

      <hr className="border-app" />

      <section className="space-y-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app">Steps (JSON)</h2>
            <p className="mt-0.5 text-xs text-muted">
              Array of{" "}
              <code className="font-mono text-[10px]">
                {`{ target_selector, title, body, placement }`}
              </code>
              . Placement is one of <code>top | bottom | left | right | center</code>.
            </p>
          </div>
          <div className="text-[11px] text-muted">
            {stepsCount === null ? (
              <span className="text-rose-500">invalid</span>
            ) : (
              <span>
                {stepsCount} step{stepsCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </header>

        <textarea
          name="steps"
          rows={14}
          value={stepsText}
          onChange={(e) => validateSteps(e.target.value)}
          className={`${inputClass} resize-y font-mono text-xs`}
          spellCheck={false}
        />
        {stepsError && (
          <p className="text-xs text-rose-500">{stepsError}</p>
        )}
      </section>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          className={buttonClass}
          disabled={!!stepsError}
        >
          {mode === "create" ? "Create tour" : "Save changes"}
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
