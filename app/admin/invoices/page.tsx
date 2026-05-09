import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  fetchAuthUsersByIds,
  formatDate,
  inputClass,
} from "../_lib";
import type { InvoiceRow, InvoiceStatus } from "../_types";
import { markPaid, voidInvoice } from "./_actions";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  formatMoneyCents,
  invoiceStatusChipClass,
  isInvoiceStatus,
  isOverdue,
} from "./_helpers";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  page?: string;
  status?: string;
  email?: string;
  from?: string;
  to?: string;
  overdue?: string;
};

type StatRow = Pick<
  InvoiceRow,
  "amount_cents" | "currency" | "status" | "created_at" | "due_date" | "total_cents" | "paid_at"
>;

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = isInvoiceStatus(sp.status) ? sp.status : "";
  const emailQ = (sp.email ?? "").trim();
  const fromDate = (sp.from ?? "").trim();
  const toDate = (sp.to ?? "").trim();
  const overdueOnly = (sp.overdue ?? "").trim() === "true";

  const admin = createAdminClient();

  let filterUserIds: string[] | null = null;
  if (emailQ) {
    const needle = emailQ.toLowerCase();
    const PAGE_SIZE = 200;
    const PAGES = 5;
    const resPages = await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        admin.auth.admin
          .listUsers({ page: i + 1, perPage: PAGE_SIZE })
          .catch(() => null)
      )
    );
    const ids: string[] = [];
    for (const r of resPages) {
      if (!r || r.error || !r.data?.users) continue;
      for (const u of r.data.users) {
        if ((u.email ?? "").toLowerCase().includes(needle)) {
          ids.push(u.id);
        }
      }
    }
    filterUserIds = ids;
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  const buildBase = () => {
    let query = admin.from("invoices").select("*", { count: "exact" });
    if (status) query = query.eq("status", status);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) {
      const t = new Date(toDate);
      if (!Number.isNaN(t.getTime())) {
        t.setUTCDate(t.getUTCDate() + 1);
        query = query.lt("created_at", t.toISOString().slice(0, 10));
      }
    }
    if (overdueOnly) {
      // Computed: due_date < today AND status NOT IN paid/void/refunded.
      query = query
        .lt("due_date", todayISO)
        .not("status", "in", "(paid,void,refunded)");
    }
    if (filterUserIds !== null) {
      if (filterUserIds.length === 0) {
        query = query.eq("user_id", "00000000-0000-0000-0000-000000000000");
      } else {
        query = query.in("user_id", filterUserIds);
      }
    }
    return query;
  };

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const [pageRes, statRes] = await Promise.all([
    buildBase().order("created_at", { ascending: false }).range(from, to),
    admin
      .from("invoices")
      .select(
        "amount_cents, currency, status, created_at, due_date, total_cents, paid_at"
      ),
  ]);

  const rows = (pageRes.data ?? []) as InvoiceRow[];
  const total = pageRes.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const stats = (statRes.data ?? []) as StatRow[];

  // Outstanding (sent + overdue), grouped by currency
  const outstandingByCurrency = new Map<string, number>();
  for (const r of stats) {
    const overdue = isOverdue(r.due_date, r.status);
    const counted =
      r.status === "sent" || r.status === "overdue" || (overdue && r.status === "draft");
    if (!counted) continue;
    const cur = (r.currency ?? "USD").toUpperCase();
    const amt = r.total_cents ?? r.amount_cents ?? 0;
    outstandingByCurrency.set(cur, (outstandingByCurrency.get(cur) ?? 0) + amt);
  }
  const outstandingTop = Array.from(outstandingByCurrency.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const outstandingSummary = outstandingTop
    ? formatMoneyCents(outstandingTop[1], outstandingTop[0]) +
      (outstandingByCurrency.size > 1
        ? ` (+${outstandingByCurrency.size - 1})`
        : "")
    : "—";

  // Paid this month
  const paidThisMonth = stats.filter(
    (r) => r.status === "paid" && r.paid_at && r.paid_at >= monthStartIso
  );
  const paidByCurrency = new Map<string, number>();
  for (const r of paidThisMonth) {
    const cur = (r.currency ?? "USD").toUpperCase();
    const amt = r.total_cents ?? r.amount_cents ?? 0;
    paidByCurrency.set(cur, (paidByCurrency.get(cur) ?? 0) + amt);
  }
  const paidTop = Array.from(paidByCurrency.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const paidSummary = paidTop
    ? formatMoneyCents(paidTop[1], paidTop[0]) +
      (paidByCurrency.size > 1 ? ` (+${paidByCurrency.size - 1})` : "")
    : "—";

  const draftCount = stats.filter((r) => r.status === "draft").length;
  const overdueCount = stats.filter(
    (r) => r.status === "overdue" || isOverdue(r.due_date, r.status)
  ).length;

  // Resolve emails for visible rows
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))
  );
  const emailMap = await fetchAuthUsersByIds(userIds);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Billing
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Invoices</h1>
          <p className="mt-0.5 text-xs text-muted">
            Issue, send, and reconcile invoices. Overdue is computed when
            <code className="font-mono"> due_date</code> is past and status
            isn&apos;t paid/void/refunded.
          </p>
        </div>
        <Link href="/admin/invoices/new" className={buttonClass}>
          + New invoice
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={outstandingSummary}
          tone="sky"
          mono
        />
        <StatCard
          label="Paid this month"
          value={paidSummary}
          tone="emerald"
          mono
        />
        <StatCard label="Draft" value={draftCount.toLocaleString()} tone="muted" />
        <StatCard
          label="Overdue"
          value={overdueCount.toLocaleString()}
          tone="rose"
        />
      </div>

      {/* Filters */}
      <form
        action="/admin/invoices"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-3 lg:grid-cols-[1fr_140px_140px_140px_120px_auto]"
      >
        <input
          type="search"
          name="email"
          defaultValue={emailQ}
          placeholder="Filter by user email"
          className={`${inputClass} h-9`}
        />
        <select name="status" defaultValue={status} className={`${inputClass} h-9`}>
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={fromDate}
          className={`${inputClass} h-9`}
          aria-label="From date"
        />
        <input
          type="date"
          name="to"
          defaultValue={toDate}
          className={`${inputClass} h-9`}
          aria-label="To date"
        />
        <label className="flex h-9 items-center gap-2 rounded-lg border border-app bg-app px-3 text-xs text-app">
          <input
            type="checkbox"
            name="overdue"
            value="true"
            defaultChecked={overdueOnly}
            className="h-4 w-4 rounded accent-tool-accent"
          />
          Overdue only
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
      </form>

      <p className="text-xs text-muted">
        {total.toLocaleString()} match{total === 1 ? "" : "es"} · page {page} of{" "}
        {totalPages}
      </p>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Number</th>
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Amount</th>
              <th className="px-3 py-2 text-left font-normal">Due</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No invoices match.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const email = row.user_id
                  ? emailMap.get(row.user_id)?.email ?? null
                  : null;
                const overdue = isOverdue(row.due_date, row.status);
                // If overdue but stored status is sent/draft, render as
                // "overdue" visually without changing the underlying row.
                const displayStatus: InvoiceStatus =
                  overdue && row.status !== "overdue" && row.status !== "paid"
                    ? "overdue"
                    : row.status;
                const amt = row.total_cents ?? row.amount_cents;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/invoices/${row.id}`}
                        className="font-mono text-xs font-semibold text-app hover:text-tool-accent"
                      >
                        {row.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.user_id ? (
                        <Link
                          href={`/admin/users/${row.user_id}`}
                          className="text-app hover:text-tool-accent"
                        >
                          {email ?? row.user_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-app">
                      {formatMoneyCents(amt, row.currency)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {row.due_date ? formatDate(row.due_date) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${invoiceStatusChipClass(
                          displayStatus
                        )}`}
                      >
                        {INVOICE_STATUS_LABELS[displayStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        {row.status !== "paid" && row.status !== "void" && (
                          <form action={markPaid} className="inline">
                            <input type="hidden" name="id" value={row.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
                            >
                              Mark paid
                            </button>
                          </form>
                        )}
                        {row.pdf_url && (
                          <a
                            href={row.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                          >
                            PDF
                          </a>
                        )}
                        {row.status !== "paid" && row.status !== "void" && (
                          <form action={voidInvoice} className="inline">
                            <input type="hidden" name="id" value={row.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                            >
                              Void
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/admin/invoices/${row.id}`}
                          className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        params={{
          status: status || undefined,
          email: emailQ || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          overdue: overdueOnly ? "true" : undefined,
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "sky" | "emerald" | "rose" | "muted";
  mono?: boolean;
}) {
  const toneCls =
    tone === "sky"
      ? "text-sky-500 dark:text-sky-400"
      : tone === "emerald"
        ? "text-emerald-500 dark:text-emerald-400"
        : tone === "rose"
          ? "text-rose-500"
          : tone === "muted"
            ? "text-secondary"
            : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 truncate text-2xl font-semibold tabular-nums ${toneCls} ${
          mono ? "font-mono text-base" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: Record<string, string | undefined>;
}) {
  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    sp.set("page", String(p));
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    return `/admin/invoices?${sp.toString()}`;
  };
  const linkCls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors bg-app-elevated text-app hover:border-tool-accent";
  const disabledCls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors pointer-events-none opacity-40 text-faint";
  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={linkCls}>
          ← Prev
        </Link>
      ) : (
        <span className={disabledCls}>← Prev</span>
      )}
      <span className="font-mono tabular-nums text-muted">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={buildHref(page + 1)} className={linkCls}>
          Next →
        </Link>
      ) : (
        <span className={disabledCls}>Next →</span>
      )}
    </div>
  );
}
