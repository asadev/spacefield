import { buttonClass, buttonGhostClass, inputClass } from "../_lib";

import type { IpRuleRow } from "../_types";

/**
 * Server-rendered shared form for /admin/ip-rules/new and /[id].
 * Date input expects YYYY-MM-DD; the action promotes it to end-of-day
 * UTC so a rule "expires April 30" actually applies through April 30.
 */
export default function IpRuleForm({
  rule,
  action,
  submitLabel,
}: {
  rule: Partial<IpRuleRow> | null;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const expiresAtDate = rule?.expires_at
    ? new Date(rule.expires_at).toISOString().slice(0, 10)
    : "";

  return (
    <form action={action} className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      {rule?.id && <input type="hidden" name="id" value={rule.id} />}

      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field label="CIDR" hint="IPv4. /N optional. Examples: 1.2.3.4 or 10.0.0.0/24.">
          <input
            type="text"
            name="cidr"
            required
            defaultValue={rule?.cidr ?? ""}
            placeholder="10.0.0.0/24"
            pattern="^\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?$"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Action">
          <select
            name="action"
            defaultValue={rule?.action ?? "block"}
            className={inputClass}
          >
            <option value="block">Block</option>
            <option value="allow">Allow</option>
          </select>
        </Field>
      </div>

      <Field
        label="Reason"
        hint="Why was this rule added? Shown in the index for context."
      >
        <input
          type="text"
          name="reason"
          defaultValue={rule?.reason ?? ""}
          placeholder="e.g. abuse from this prefix on 2026-04-22"
          className={inputClass}
        />
      </Field>

      <Field
        label="Expires at"
        hint="Optional date the rule auto-expires. Leave empty for no expiry."
      >
        <input
          type="date"
          name="expires_at"
          defaultValue={expiresAtDate}
          className={`${inputClass} max-w-[220px] font-mono`}
        />
      </Field>

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
        <a href="/admin/ip-rules" className={buttonGhostClass}>
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
