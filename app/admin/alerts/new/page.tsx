import Link from "next/link";

import {
  buttonClass,
  buttonGhostClass,
  inputClass,
} from "../../_lib";
import { createAlert } from "../_actions";
import {
  ACTION_CHANNELS,
  CONDITION_FIELDS,
  CONDITION_LABELS,
  CONDITION_TYPES,
  type ConditionField,
} from "../_helpers";

import type { AlertConditionType } from "../../_types";

export const dynamic = "force-dynamic";

type SearchParams = {
  condition_type?: string;
};

export default async function NewAlertPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const type = (
    CONDITION_TYPES as readonly string[]
  ).includes(sp.condition_type ?? "")
    ? (sp.condition_type as AlertConditionType)
    : "signup_drop";

  const fields = CONDITION_FIELDS[type] ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/alerts"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Alerts
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New alert</h1>
        <p className="mt-0.5 text-xs text-muted">
          Fields adjust per condition type. Switching the dropdown
          re-renders the form below it without saving.
        </p>
      </div>

      {/* Type-switcher (GET, no save) */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Condition type</h2>
        <form
          method="get"
          action="/admin/alerts/new"
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <select
            name="condition_type"
            defaultValue={type}
            className={inputClass}
          >
            {CONDITION_TYPES.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonGhostClass}>
            Switch type
          </button>
        </form>
      </section>

      {/* Save form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Details</h2>

        <form action={createAlert} className="mt-4 space-y-4">
          <input type="hidden" name="condition_type" value={type} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Sign-ups dropped 30% in 24h"
                className={inputClass}
              />
            </Field>
            <Field label="Enabled">
              <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked
                  className="h-4 w-4 rounded border-app accent-tool-accent"
                />
                <span>Active immediately</span>
              </label>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              placeholder="Why this matters and who owns it."
              className={inputClass}
            />
          </Field>

          <ConditionParamsSection type={type} fields={fields} />

          <Field
            label="Action channels"
            hint="Where the alert fires."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {ACTION_CHANNELS.map((ch) => (
                <label
                  key={ch}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-app bg-app p-3 text-sm transition-colors hover:border-tool-accent has-[:checked]:border-tool-accent has-[:checked]:bg-tool-accent-soft"
                >
                  <input
                    type="checkbox"
                    name="action_channels"
                    value={ch}
                    defaultChecked={ch === "email"}
                    className="h-4 w-4 accent-tool-accent"
                  />
                  <span className="font-mono text-xs text-app">{ch}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Recipients"
            hint="One per line."
          >
            <textarea
              name="action_recipients"
              rows={4}
              spellCheck={false}
              placeholder={"you@example.com\n+10000000000"}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <Field
            label="Cooldown (minutes)"
            hint="Minimum gap between consecutive firings."
          >
            <input
              type="number"
              name="cooldown_minutes"
              min={1}
              max={1440}
              step={1}
              defaultValue={30}
              className={`${inputClass} max-w-[160px]`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Create alert
            </button>
            <Link href="/admin/alerts" className={buttonGhostClass}>
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConditionParamsSection({
  type,
  fields,
}: {
  type: AlertConditionType;
  fields: ConditionField[];
}) {
  return (
    <Field
      label={`Condition params — ${CONDITION_LABELS[type]}`}
      hint="Per-type settings. Saved as JSONB. Falls back to the JSON textarea if you'd rather edit raw."
    >
      <div className="space-y-3 rounded-lg border border-app bg-app p-3">
        {fields.length === 0 ? (
          <div className="text-xs text-faint">No structured fields for this type.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => {
              if (f.type === "textarea") {
                return (
                  <div key={f.key} className="md:col-span-2">
                    <div className="text-[11px] text-muted">{f.label}</div>
                    <textarea
                      name={`cp_${f.key}`}
                      defaultValue={f.defaultValue ?? ""}
                      placeholder={f.placeholder}
                      rows={4}
                      className={`${inputClass} mt-1 font-mono text-xs`}
                    />
                    {f.hint && (
                      <div className="mt-1 text-[11px] text-faint">
                        {f.hint}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={f.key}>
                  <div className="text-[11px] text-muted">{f.label}</div>
                  <input
                    type={f.type}
                    name={`cp_${f.key}`}
                    defaultValue={f.defaultValue ?? ""}
                    placeholder={f.placeholder}
                    className={`${inputClass} mt-1`}
                  />
                  {f.hint && (
                    <div className="mt-1 text-[11px] text-faint">
                      {f.hint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-muted">
            Or edit raw JSON
          </summary>
          <textarea
            name="condition_params_json"
            placeholder='{"threshold_percent":30,"window_hours":24}'
            rows={6}
            spellCheck={false}
            className={`${inputClass} mt-2 font-mono text-[11px]`}
          />
          <div className="mt-1 text-[11px] text-faint">
            If non-empty, overrides the structured fields above.
          </div>
        </details>
      </div>
    </Field>
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
