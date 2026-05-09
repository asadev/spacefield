import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../../_lib";
import { createInvoice } from "../_actions";

export const dynamic = "force-dynamic";

const SAMPLE_LINE_ITEMS = `[
  {
    "description": "Pro plan — May 2026",
    "quantity": 1,
    "unit_amount_cents": 9900
  }
]`;

export default function NewInvoicePage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/invoices"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Invoices
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New invoice</h1>
        <p className="mt-0.5 text-xs text-muted">
          Create a draft invoice. Subtotal/tax/total are computed from
          line items + tax rate.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <form action={createInvoice} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="User UUID" required>
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

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Currency" required>
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
            <Field label="Due date" hint="YYYY-MM-DD">
              <input
                type="date"
                name="due_date"
                className={inputClass}
              />
            </Field>
            <Field label="Tax rate" hint="Decimal — 0.05 = 5%. Default 0.">
              <input
                type="number"
                name="tax_rate"
                min={0}
                max={1}
                step="0.0001"
                defaultValue="0"
                className={`${inputClass} font-mono`}
              />
            </Field>
          </div>

          <Field
            label="Line items (JSON)"
            hint="Array of { description, quantity, unit_amount_cents }. Cents are integers."
            required
          >
            <textarea
              name="line_items"
              required
              defaultValue={SAMPLE_LINE_ITEMS}
              rows={10}
              className={`${inputClass} font-mono text-xs`}
              spellCheck={false}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link href="/admin/invoices" className={buttonGhostClass}>
              Cancel
            </Link>
            <button type="submit" className={buttonClass}>
              Create invoice
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
