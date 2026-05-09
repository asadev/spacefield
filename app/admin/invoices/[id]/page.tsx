import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDate,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { InvoiceRow, RefundRow } from "../../_types";
import {
  markPaid,
  sendInvoice,
  updateInvoice,
  voidInvoice,
} from "../_actions";
import {
  INVOICE_STATUS_LABELS,
  formatMoneyCents,
  invoiceStatusChipClass,
  isOverdue,
} from "../_helpers";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorkspaceLite = { id: string; name: string | null };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const admin = createAdminClient();
  const { data: invoiceData } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const invoice = (invoiceData as InvoiceRow | null) ?? null;
  if (!invoice) notFound();

  const userIds = invoice.user_id ? [invoice.user_id] : [];

  const [emailMap, wsRes, relatedRefundsRes] = await Promise.all([
    fetchAuthUsersByIds(userIds),
    invoice.workspace_id
      ? admin
          .from("workspaces")
          .select("id, name")
          .eq("id", invoice.workspace_id)
          .maybeSingle()
      : Promise.resolve({ data: null as WorkspaceLite | null, error: null }),
    invoice.user_id
      ? admin
          .from("refunds")
          .select("*")
          .eq("user_id", invoice.user_id)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as RefundRow[], error: null }),
  ]);

  const userEmail = invoice.user_id
    ? emailMap.get(invoice.user_id)?.email ?? null
    : null;
  const workspace = (wsRes.data as WorkspaceLite | null) ?? null;
  const refunds = ((relatedRefundsRes.data as RefundRow[] | null) ?? []) as RefundRow[];

  const overdue = isOverdue(invoice.due_date, invoice.status);
  const displayStatus =
    overdue && invoice.status !== "overdue" && invoice.status !== "paid"
      ? "overdue"
      : invoice.status;

  const taxRate =
    typeof (invoice.metadata as Record<string, unknown> | null)?.tax_rate ===
    "number"
      ? (invoice.metadata as Record<string, unknown>).tax_rate as number
      : 0;
  const lineItemsJSON = JSON.stringify(invoice.line_items ?? [], null, 2);

  const canMarkPaid = invoice.status !== "paid" && invoice.status !== "void";
  const canVoid = invoice.status !== "paid" && invoice.status !== "void";
  const canSend = invoice.status !== "paid" && invoice.status !== "void";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/invoices"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-app">
            {invoice.number}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${invoiceStatusChipClass(
              displayStatus
            )}`}
          >
            {INVOICE_STATUS_LABELS[displayStatus]}
          </span>
          <span className="font-mono text-base font-semibold tabular-nums text-app">
            {formatMoneyCents(
              invoice.total_cents ?? invoice.amount_cents,
              invoice.currency
            )}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            id <code className="font-mono">{invoice.id.slice(0, 8)}</code>
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(invoice.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(invoice.updated_at)}
          </span>
          {invoice.paid_at && (
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-emerald-500">
              paid {formatDateTime(invoice.paid_at)}
            </span>
          )}
          {invoice.due_date && (
            <span className="rounded-md border border-app bg-app px-2 py-1">
              due {formatDate(invoice.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Customer */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Customer</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="User">
            {invoice.user_id ? (
              <Link
                href={`/admin/users/${invoice.user_id}`}
                className="text-app hover:text-tool-accent"
              >
                {userEmail ?? invoice.user_id.slice(0, 8)}
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Detail>
          <Detail label="Workspace">
            {invoice.workspace_id ? (
              <Link
                href={`/admin/workspaces/${invoice.workspace_id}`}
                className="text-app hover:text-tool-accent"
              >
                {workspace?.name ?? invoice.workspace_id.slice(0, 8)}
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Detail>
          <Detail label="External invoice id">
            {invoice.external_invoice_id ? (
              <code className="font-mono text-xs text-app">
                {invoice.external_invoice_id}
              </code>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Detail>
        </div>
      </section>

      {/* Money breakdown */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Money</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="Subtotal"
            value={formatMoneyCents(
              invoice.subtotal_cents ?? 0,
              invoice.currency
            )}
            mono
          />
          <Card
            label="Tax"
            value={formatMoneyCents(invoice.tax_cents ?? 0, invoice.currency)}
            mono
          />
          <Card
            label="Total"
            value={formatMoneyCents(
              invoice.total_cents ?? invoice.amount_cents,
              invoice.currency
            )}
            tone="violet"
            mono
          />
          <Card
            label="Currency"
            value={invoice.currency}
            mono
          />
        </div>
      </section>

      {/* Workflow */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Workflow</h2>
        <p className="mt-0.5 text-xs text-muted">
          Send marks <code className="font-mono">status=sent</code>; the
          actual email is sent by an environmental worker. Mark paid records
          payment timestamp.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canSend && (
            <form action={sendInvoice} className="inline">
              <input type="hidden" name="id" value={invoice.id} />
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-500 transition-colors hover:bg-sky-500/20"
              >
                Send
              </button>
            </form>
          )}
          {canMarkPaid && (
            <form action={markPaid} className="inline">
              <input type="hidden" name="id" value={invoice.id} />
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
              >
                Mark paid
              </button>
            </form>
          )}
          {canVoid && (
            <form action={voidInvoice} className="inline">
              <input type="hidden" name="id" value={invoice.id} />
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
              >
                Void
              </button>
            </form>
          )}
          {invoice.pdf_url && (
            <a
              href={invoice.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-app bg-app px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
            >
              Open PDF
            </a>
          )}
          {!canSend && !canMarkPaid && !canVoid && (
            <p className="text-xs text-faint">
              Terminal status reached — no further actions.
            </p>
          )}
        </div>
      </section>

      {/* Edit */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit invoice</h2>
        <p className="mt-0.5 text-xs text-muted">
          Editing line items recomputes subtotal/tax/total on save.
          Tax rate is a decimal (e.g. <code className="font-mono">0.05</code>{" "}
          for 5%).
        </p>
        <form action={updateInvoice} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={invoice.id} />

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Due date" hint="YYYY-MM-DD">
              <input
                type="date"
                name="due_date"
                defaultValue={invoice.due_date ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Tax rate" hint="0–1 (e.g. 0.05 = 5%)">
              <input
                type="number"
                name="tax_rate"
                min={0}
                max={1}
                step="0.0001"
                defaultValue={taxRate}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="External invoice id" hint="Stripe/Paddle id">
              <input
                type="text"
                name="external_invoice_id"
                defaultValue={invoice.external_invoice_id ?? ""}
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
          </div>

          <Field
            label="Line items (JSON)"
            hint="Array of { description, quantity, unit_amount_cents }"
          >
            <textarea
              name="line_items"
              defaultValue={lineItemsJSON}
              rows={10}
              spellCheck={false}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <Field label="PDF url" hint="Direct link to a generated PDF">
            <input
              type="url"
              name="pdf_url"
              defaultValue={invoice.pdf_url ?? ""}
              className={inputClass}
              placeholder="https://..."
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
          </div>
        </form>
      </section>

      {/* Related refunds */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Related refunds</h2>
        <p className="mt-0.5 text-xs text-muted">
          Refunds attached to the same user. Up to 20 most recent.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Created</th>
                <th className="px-3 py-2 text-left font-normal">Amount</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {refunds.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-faint">
                    No refunds for this user.
                  </td>
                </tr>
              ) : (
                refunds.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-app">
                      {formatMoneyCents(r.amount_cents, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] uppercase text-muted">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/refunds/${r.id}`}
                        className="text-[11px] text-secondary hover:text-tool-accent"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div>
        <Link href="/admin/invoices" className={buttonGhostClass}>
          Back to invoices
        </Link>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-app bg-app p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1 truncate text-sm">{children}</div>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "violet";
  mono?: boolean;
}) {
  const toneCls = tone === "violet" ? "text-tool-accent" : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 truncate font-semibold tabular-nums ${toneCls} ${
          mono ? "font-mono text-base" : "text-2xl"
        }`}
      >
        {value}
      </div>
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
