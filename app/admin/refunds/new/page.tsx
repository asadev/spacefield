import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../../_lib";
import { createRefund } from "../_actions";

export const dynamic = "force-dynamic";

export default function NewRefundPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/refunds"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Refunds
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New refund</h1>
        <p className="mt-0.5 text-xs text-muted">
          Create a manual refund row. Starts in <code className="font-mono">pending</code>.
          You&apos;ll be redirected to the detail page after save where you
          can approve and process it.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <form action={createRefund} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="User UUID" required hint="auth.users.id">
              <input
                type="text"
                name="user_id"
                required
                placeholder="00000000-0000-0000-0000-000000000000"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
            <Field label="Workspace UUID" hint="optional">
              <input
                type="text"
                name="workspace_id"
                placeholder="(blank if not workspace-scoped)"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Amount (cents)" required hint="Whole number, e.g. 1999 for $19.99">
              <input
                type="number"
                name="amount_cents"
                required
                min={0}
                step={1}
                defaultValue="0"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Currency" required hint="ISO 4217 — USD, EUR, AED">
              <input
                type="text"
                name="currency"
                required
                defaultValue="USD"
                maxLength={3}
                pattern="[A-Za-z]{3}"
                className={`${inputClass} font-mono uppercase`}
              />
            </Field>
          </div>

          <Field label="Reason" hint="What the customer said">
            <textarea
              name="reason"
              rows={3}
              className={inputClass}
              placeholder="Refund requested via support ticket #1234"
            />
          </Field>

          <Field label="Notes" hint="Internal admin notes">
            <textarea
              name="notes"
              rows={3}
              className={inputClass}
              placeholder="Initial review pending"
            />
          </Field>

          <Field
            label="External payment ID"
            hint="Original payment id from Stripe/Paddle. Optional, but enables auto-link to invoice."
          >
            <input
              type="text"
              name="external_payment_id"
              className={`${inputClass} font-mono text-xs`}
              placeholder="pi_3Op1234..."
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link href="/admin/refunds" className={buttonGhostClass}>
              Cancel
            </Link>
            <button type="submit" className={buttonClass}>
              Create refund
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-medium text-app">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
        {hint && <span className="text-[10px] text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
