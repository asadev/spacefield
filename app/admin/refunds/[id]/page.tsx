import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { InvoiceRow, RefundRow } from "../../_types";
import {
  approveRefund,
  markFailed,
  markProcessed,
  rejectRefund,
  updateRefund,
} from "../_actions";
import {
  REFUND_STATUS_LABELS,
  diffMs,
  formatDuration,
  formatMoneyCents,
  refundStatusChipClass,
} from "../_helpers";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorkspaceLite = { id: string; name: string | null };

export default async function RefundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const admin = createAdminClient();
  const { data: refundData } = await admin
    .from("refunds")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const refund = (refundData as RefundRow | null) ?? null;
  if (!refund) notFound();

  const userIds = refund.user_id ? [refund.user_id] : [];
  if (refund.approved_by) userIds.push(refund.approved_by);

  const [emailMap, wsRes, relatedInvoiceRes] = await Promise.all([
    fetchAuthUsersByIds(userIds),
    refund.workspace_id
      ? admin
          .from("workspaces")
          .select("id, name")
          .eq("id", refund.workspace_id)
          .maybeSingle()
      : Promise.resolve({ data: null as WorkspaceLite | null, error: null }),
    refund.external_payment_id
      ? admin
          .from("invoices")
          .select("id, number, amount_cents, currency, status, total_cents")
          .eq("external_invoice_id", refund.external_payment_id)
          .maybeSingle()
      : Promise.resolve({ data: null as InvoiceRow | null, error: null }),
  ]);

  const userEmail = refund.user_id
    ? emailMap.get(refund.user_id)?.email ?? null
    : null;
  const approverEmail = refund.approved_by
    ? emailMap.get(refund.approved_by)?.email ?? null
    : null;
  const workspace = (wsRes.data as WorkspaceLite | null) ?? null;
  const relatedInvoice = (relatedInvoiceRes.data as InvoiceRow | null) ?? null;

  const processingTime = diffMs(refund.created_at, refund.processed_at);

  const canApprove = refund.status === "pending";
  const canProcess = refund.status === "approved";
  const canReject = refund.status === "pending" || refund.status === "approved";
  const canFail =
    refund.status !== "processed" && refund.status !== "rejected";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/refunds"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Refunds
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-app">
            {formatMoneyCents(refund.amount_cents, refund.currency)}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${refundStatusChipClass(
              refund.status
            )}`}
          >
            {REFUND_STATUS_LABELS[refund.status]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            id <code className="font-mono">{refund.id.slice(0, 8)}</code>
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(refund.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(refund.updated_at)}
          </span>
        </div>
      </div>

      {/* User card */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">User</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Email">
            {refund.user_id ? (
              <Link
                href={`/admin/users/${refund.user_id}`}
                className="text-app hover:text-tool-accent"
              >
                {userEmail ?? refund.user_id.slice(0, 8)}
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Detail>
          <Detail label="Workspace">
            {refund.workspace_id ? (
              <Link
                href={`/admin/workspaces/${refund.workspace_id}`}
                className="text-app hover:text-tool-accent"
              >
                {workspace?.name ?? refund.workspace_id.slice(0, 8)}
              </Link>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Detail>
          <Detail label="External payment id">
            {refund.external_payment_id ? (
              <code className="font-mono text-xs text-app">
                {refund.external_payment_id}
              </code>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Detail>
        </div>
      </section>

      {/* Workflow timeline */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Timeline</h2>
        <ul className="mt-3 space-y-2 text-xs">
          <TimelineItem
            label="Created"
            ts={refund.created_at}
            done
          />
          <TimelineItem
            label={`Approved${approverEmail ? ` by ${approverEmail}` : ""}`}
            ts={
              refund.status === "approved" ||
              refund.status === "processed"
                ? refund.updated_at
                : null
            }
            done={
              refund.status === "approved" ||
              refund.status === "processed"
            }
            missing={
              refund.status === "rejected" ||
              refund.status === "failed"
            }
          />
          <TimelineItem
            label="Processed"
            ts={refund.processed_at}
            done={refund.status === "processed"}
            missing={
              refund.status === "rejected" ||
              refund.status === "failed"
            }
          />
          {refund.status === "rejected" && (
            <TimelineItem
              label="Rejected"
              ts={refund.updated_at}
              done
              tone="rose"
            />
          )}
          {refund.status === "failed" && (
            <TimelineItem
              label="Failed"
              ts={refund.updated_at}
              done
              tone="rose"
            />
          )}
        </ul>
        {processingTime !== null && (
          <div className="mt-3 text-[11px] text-muted">
            Total processing time:{" "}
            <span className="font-mono text-app">
              {formatDuration(processingTime)}
            </span>
          </div>
        )}
        {refund.external_refund_id && (
          <div className="mt-1 text-[11px] text-muted">
            External refund id:{" "}
            <code className="font-mono text-app">
              {refund.external_refund_id}
            </code>
          </div>
        )}
      </section>

      {/* Action workflow */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Workflow actions</h2>
        <p className="mt-0.5 text-xs text-muted">
          Drive the refund through pending → approved → processed.
          Rejections require notes.
        </p>

        <div className="mt-4 space-y-3">
          {canApprove && (
            <form
              action={approveRefund}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={refund.id} />
              <span className="text-xs text-secondary">
                Approve this refund and set you as approver:
              </span>
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-500 transition-colors hover:bg-sky-500/20"
              >
                Approve
              </button>
            </form>
          )}

          {canProcess && (
            <form
              action={markProcessed}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={refund.id} />
              <span className="text-xs text-secondary">
                Mark processed with external refund id:
              </span>
              <input
                type="text"
                name="external_refund_id"
                required
                placeholder="re_3Op1234..."
                className={`${inputClass} h-8 w-56 font-mono text-xs`}
              />
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
              >
                Mark processed
              </button>
            </form>
          )}

          {canReject && (
            <form
              action={rejectRefund}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={refund.id} />
              <span className="text-xs text-secondary">Reject — notes required:</span>
              <input
                type="text"
                name="notes"
                required
                placeholder="Reason for rejection"
                className={`${inputClass} h-8 w-72`}
              />
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
              >
                Reject
              </button>
            </form>
          )}

          {canFail && (
            <form
              action={markFailed}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={refund.id} />
              <span className="text-xs text-secondary">
                Mark failed — provider returned an error:
              </span>
              <input
                type="text"
                name="notes"
                placeholder="Failure reason (optional)"
                className={`${inputClass} h-8 w-72`}
              />
              <button
                type="submit"
                className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
              >
                Mark failed
              </button>
            </form>
          )}

          {!canApprove && !canProcess && !canReject && !canFail && (
            <p className="text-xs text-faint">
              No further actions available — terminal status reached.
            </p>
          )}
        </div>
      </section>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit details</h2>
        <p className="mt-0.5 text-xs text-muted">
          Reason, notes, and the external payment id can always be edited.
          Amount and currency are immutable after creation.
        </p>
        <form action={updateRefund} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={refund.id} />

          <Field label="Reason">
            <textarea
              name="reason"
              defaultValue={refund.reason ?? ""}
              rows={3}
              className={inputClass}
              placeholder="Customer-stated reason"
            />
          </Field>

          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={refund.notes ?? ""}
              rows={3}
              className={inputClass}
              placeholder="Internal admin notes"
            />
          </Field>

          <Field label="External payment id">
            <input
              type="text"
              name="external_payment_id"
              defaultValue={refund.external_payment_id ?? ""}
              className={`${inputClass} font-mono text-xs`}
              placeholder="pi_..."
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
          </div>
        </form>
      </section>

      {/* Related invoice */}
      {relatedInvoice && (
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">Related invoice</h2>
          <p className="mt-0.5 text-xs text-muted">
            Matched on <code className="font-mono">external_payment_id</code> →{" "}
            <code className="font-mono">invoices.external_invoice_id</code>.
          </p>
          <Link
            href={`/admin/invoices/${relatedInvoice.id}`}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app bg-app p-3 transition-colors hover:border-tool-accent"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-xs text-app">
                {relatedInvoice.number}
              </span>
              <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] uppercase text-muted">
                {relatedInvoice.status}
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums text-app">
              {formatMoneyCents(
                relatedInvoice.total_cents ?? relatedInvoice.amount_cents,
                relatedInvoice.currency
              )}
            </span>
          </Link>
        </section>
      )}

      <div>
        <Link href="/admin/refunds" className={buttonGhostClass}>
          Back to refunds
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

function TimelineItem({
  label,
  ts,
  done,
  missing,
  tone = "default",
}: {
  label: string;
  ts: string | null | undefined;
  done?: boolean;
  missing?: boolean;
  tone?: "default" | "rose";
}) {
  const dotCls = done
    ? tone === "rose"
      ? "bg-rose-500"
      : "bg-emerald-500"
    : missing
      ? "bg-faint/30"
      : "bg-amber-500";
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${dotCls}`}
      />
      <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
        <span className={done ? "text-app" : "text-secondary"}>{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {ts ? formatDateTime(ts) : missing ? "skipped" : "pending"}
        </span>
      </div>
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-app">{label}</div>
      {children}
    </label>
  );
}
