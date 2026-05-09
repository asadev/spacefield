/**
 * Shared coupon edit form used by both `/admin/coupons/new` and the edit
 * page at `/admin/coupons/[code]`. The action callback is wired by the
 * caller to either createCoupon or updateCoupon.
 */

import { buttonClass, inputClass } from "../../_lib";
import { TIER_IDS } from "../../_types";
import type { CouponRow } from "../../_types";
import { isoToInputLocal } from "../_helpers";

type CouponFormProps = {
  /** Pass null for the create form. Pass the row for the edit form. */
  coupon: CouponRow | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
};

export default function CouponForm({
  coupon,
  action,
  submitLabel,
}: CouponFormProps) {
  const editing = coupon !== null;
  return (
    <form action={action} className="space-y-5">
      {editing && (
        <input type="hidden" name="code" value={coupon.code} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Code"
          hint={
            editing
              ? "Code is the primary key — not editable."
              : "Uppercase letters, digits, hyphen, underscore. 3–32 characters."
          }
        >
          <input
            type="text"
            name="code"
            required={!editing}
            disabled={editing}
            defaultValue={coupon?.code ?? ""}
            placeholder="WELCOME20"
            pattern="^[A-Z0-9_-]{3,32}$"
            className={`${inputClass} font-mono uppercase ${
              editing ? "opacity-60" : ""
            }`}
          />
        </Field>

        <Field
          label="Enabled"
          hint="Master switch. Off = the code rejects redemption."
        >
          <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={coupon?.enabled ?? true}
              className="h-4 w-4 rounded border-app accent-tool-accent"
            />
            <span>Coupon is on</span>
          </label>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          name="description"
          defaultValue={coupon?.description ?? ""}
          rows={3}
          className={inputClass}
          placeholder="Friendly description shown to admins."
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Kind"
          hint="What does this coupon do when redeemed?"
        >
          <select
            name="kind"
            defaultValue={coupon?.kind ?? "percent"}
            className={inputClass}
          >
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount (dollars)</option>
            <option value="tier_upgrade">Tier upgrade</option>
            <option value="free_months">Free months</option>
          </select>
        </Field>
        <Field
          label="Value"
          hint="percent: 0–100. fixed: dollars. free_months: months. tier_upgrade: ignored."
        >
          <input
            type="number"
            name="value"
            min={0}
            step="0.01"
            defaultValue={coupon?.value ?? 0}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Applies to tiers"
        hint="Select tiers this coupon is valid for. Leave all unchecked to allow any tier."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIER_IDS.map((t) => {
            const checked = coupon?.applies_to_tiers.includes(t) ?? false;
            return (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 text-sm text-app transition-colors hover:border-tool-accent has-[:checked]:border-tool-accent has-[:checked]:bg-tool-accent-soft"
              >
                <input
                  type="checkbox"
                  name="applies_to_tier"
                  value={t}
                  defaultChecked={checked}
                  className="h-4 w-4 rounded border-app accent-tool-accent"
                />
                <span className="font-mono text-xs">{t}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Max redemptions (total)"
          hint="Blank = unlimited."
        >
          <input
            type="number"
            name="max_redemptions"
            min={0}
            step={1}
            defaultValue={coupon?.max_redemptions ?? ""}
            className={inputClass}
          />
        </Field>
        <Field
          label="Per-user limit"
          hint="Max redemptions per user. Blank = unlimited."
        >
          <input
            type="number"
            name="per_user_limit"
            min={0}
            step={1}
            defaultValue={coupon?.per_user_limit ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Starts at" hint="Blank = available immediately.">
          <input
            type="datetime-local"
            name="starts_at"
            defaultValue={isoToInputLocal(coupon?.starts_at)}
            className={inputClass}
          />
        </Field>
        <Field label="Ends at" hint="Blank = no expiry.">
          <input
            type="datetime-local"
            name="ends_at"
            defaultValue={isoToInputLocal(coupon?.ends_at)}
            className={inputClass}
          />
        </Field>
      </div>

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
