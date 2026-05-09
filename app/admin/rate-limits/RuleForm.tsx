import {
  buttonClass,
  buttonGhostClass,
  inputClass,
} from "../_lib";
import { RATE_LIMIT_SCOPES, SCOPE_LABEL } from "./_helpers";

import type { RateLimitRuleRow } from "../_types";

/**
 * Server-rendered form shared by /admin/rate-limits/new and /[id].
 * The scope select is a plain <select> — switching scope is intentionally
 * a save-and-reload affair (same as the alerts editor) to keep the form
 * stateless. Helper labels above each input explain when the field is
 * relevant.
 */
export default function RuleForm({
  rule,
  action,
  submitLabel,
}: {
  rule: Partial<RateLimitRuleRow> | null;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const scope = rule?.scope ?? "global";
  return (
    <form action={action} className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      {rule?.id && <input type="hidden" name="id" value={rule.id} />}

      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <Field label="Scope" hint="Determines which scope_value field is used.">
          <select
            name="scope"
            defaultValue={scope}
            className={inputClass}
          >
            {RATE_LIMIT_SCOPES.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Scope value"
          hint="Required for tier/user/workspace. Tier id (free/pro/team/enterprise) or a UUID. Leave empty for global or route."
        >
          <input
            type="text"
            name="scope_value"
            defaultValue={rule?.scope_value ?? ""}
            placeholder="e.g. pro  •  or workspace UUID"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field
        label="Route pattern"
        hint="Required when scope=route. Glob-style: `/api/*`, `/api/share/*/accept`. Ignored otherwise."
      >
        <input
          type="text"
          name="route_pattern"
          defaultValue={rule?.route_pattern ?? ""}
          placeholder="/api/share/*"
          className={`${inputClass} font-mono`}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Limit count" hint="Requests allowed per window.">
          <input
            type="number"
            name="limit_count"
            defaultValue={rule?.limit_count ?? 60}
            min={1}
            max={10_000_000}
            step={1}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </Field>
        <Field label="Window (seconds)" hint="Window length the limit resets over.">
          <input
            type="number"
            name="window_sec"
            defaultValue={rule?.window_sec ?? 60}
            min={1}
            max={60 * 60 * 24}
            step={1}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </Field>
        <Field
          label="Burst (optional)"
          hint="Soft over-limit allowed for short bursts. Empty = no burst."
        >
          <input
            type="number"
            name="burst_count"
            defaultValue={rule?.burst_count ?? ""}
            min={1}
            max={10_000_000}
            step={1}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-app bg-app p-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={rule?.enabled ?? true}
          className="h-4 w-4 rounded border-app accent-tool-accent"
        />
        <span className="text-sm text-app">Enabled</span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
        <a href="/admin/rate-limits" className={buttonGhostClass}>
          Cancel
        </a>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
