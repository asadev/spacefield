import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import type { SurveyRow } from "../_types";
import { createSurvey, deleteSurvey, updateSurvey } from "./_actions";

const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual (admin trigger only)" },
  { value: "signup", label: "On user signup" },
  { value: "milestone", label: "On milestone (config: { event, threshold })" },
  { value: "recurring", label: "Recurring (config: { every_days, max_per_user })" },
] as const;

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "archived", label: "Archived" },
] as const;

const QUESTIONS_PLACEHOLDER = `[
  {
    "id": "nps",
    "type": "nps",
    "label": "How likely are you to recommend us?",
    "required": true
  },
  {
    "id": "rating",
    "type": "rating",
    "label": "How was your experience?",
    "required": false
  },
  {
    "id": "feedback",
    "type": "text",
    "label": "Anything else to share?",
    "required": false
  }
]`;

async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createSurvey(formData);
}

async function updateAction(formData: FormData): Promise<void> {
  "use server";
  await updateSurvey(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  "use server";
  await deleteSurvey(formData);
}

function jsonStringify(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

export function SurveyForm({
  mode,
  survey,
}: {
  mode: "create" | "edit";
  survey: SurveyRow | null;
}) {
  const action = mode === "create" ? createAction : updateAction;
  const submitLabel = mode === "create" ? "Create survey" : "Save changes";

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && survey && (
        <input type="hidden" name="id" value={survey.id} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "create" && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Survey id (slug)
            </span>
            <input
              type="text"
              name="id"
              required
              maxLength={64}
              placeholder="nps-q2-2026"
              pattern="[a-z0-9][a-z0-9_\-]*"
              className={`${inputClass} font-mono`}
            />
            <span className="text-[10px] text-faint">
              Lowercase, digits, dashes, underscores. Cannot be changed later.
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Display name
          </span>
          <input
            type="text"
            name="display_name"
            defaultValue={survey?.display_name ?? ""}
            required
            maxLength={140}
            placeholder="Q2 NPS check"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Description
          </span>
          <textarea
            name="description"
            defaultValue={survey?.description ?? ""}
            rows={2}
            placeholder="What this survey measures and how the data is used."
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Questions (JSON array)
          </span>
          <textarea
            name="questions"
            defaultValue={jsonStringify(survey?.questions, "")}
            rows={14}
            placeholder={QUESTIONS_PLACEHOLDER}
            spellCheck={false}
            className={`${inputClass} resize-y font-mono text-xs`}
          />
          <span className="text-[10px] text-faint">
            Each entry: <code>{`{ id, type: 'nps'|'rating'|'text'|'multi-choice', label, options?, required }`}</code>.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Trigger kind
          </span>
          <select
            name="trigger_kind"
            defaultValue={survey?.trigger_kind ?? "manual"}
            className={inputClass}
          >
            {TRIGGER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Status
          </span>
          <select
            name="status"
            defaultValue={survey?.status ?? "draft"}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Trigger config (JSON object)
          </span>
          <textarea
            name="trigger_config"
            defaultValue={jsonStringify(survey?.trigger_config, "{}")}
            rows={4}
            placeholder='{"every_days": 30, "max_per_user": 1}'
            spellCheck={false}
            className={`${inputClass} resize-y font-mono text-xs`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Audience
          </span>
          <input
            type="text"
            name="audience"
            defaultValue={survey?.audience ?? "all"}
            maxLength={64}
            placeholder="all | tier | allowlist | etc."
            className={inputClass}
          />
          <span className="text-[10px] text-faint">
            Free text — convention is &ldquo;all&rdquo;, &ldquo;tier&rdquo;,
            &ldquo;allowlist&rdquo;.
          </span>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Audience config (JSON object)
          </span>
          <textarea
            name="audience_config"
            defaultValue={jsonStringify(survey?.audience_config, "{}")}
            rows={3}
            placeholder='{"tiers": ["pro","team"]}'
            spellCheck={false}
            className={`${inputClass} resize-y font-mono text-xs`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/admin/surveys" className={buttonGhostClass}>
          Cancel
        </Link>
        <button type="submit" className={buttonClass}>
          {submitLabel}
        </button>
      </div>

      {mode === "edit" && survey && (
        <details className="rounded-lg border border-app bg-app p-3">
          <summary className="cursor-pointer text-xs text-muted">
            Danger zone
          </summary>
          <form action={deleteAction} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="id" value={survey.id} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
            >
              Delete survey
            </button>
            <span className="text-[11px] text-muted">
              Permanent. Responses are also deleted (cascade).
            </span>
          </form>
        </details>
      )}
    </form>
  );
}
