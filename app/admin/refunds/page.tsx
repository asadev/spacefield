import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../_lib";
import type { RefundRow, RefundStatus } from "../_types";
import { approveRefund, markProcessed, rejectRefund } from "./_actions";
import {
  REFUND_STATUSES,
  REFUND_STATUS_LABELS,
  diffMs,
  excerpt,
  formatDuration,
  formatMoneyCents,
  isRefundStatus,
  refundStatusChipClass,
} from "./_helpers";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  page?: string;
  status?: string;
  email?: string;
  currency?: string;
  from?: string;
  to?: string;
};

type StatRow = Pick<
  RefundRow,
  "amount_cents" | "currency" | "status" | "created_at" | "processed_at"
>;

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = isRefundStatus(sp.status) ? sp.status : "";
  const emailQ = (sp.email ?? "").trim();
  const currency = (sp.currency ?? "").trim().toUpperCase();
  const fromDate = (sp.from ?? "").trim();
  const toDate = (sp.to ?? "").trim();

  const admin = createAdminClient();

  // If user filtered by email, resolve to a list of user_ids first.
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

  const buildBase = () => {
    let query = admin.from("refunds").select("*", { count: "exact" });
    if (status) query = query.eq("status", status);
    if (currency) query = query.eq("currency", currency);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) {
      // include the entire 'to' day
      const t = new Date(toDate);
      if (!Number.isNaN(t.getTime())) {
        t.setUTCDate(t.getUTCDate() + 1);
        query = query.lt("created_at", t.toISOString().slice(0, 10));
      }
    }
    if (filterUserIds !== null) {
      if (filterUserIds.length === 0) {
        // No users matched — force empty.
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
      .from("refunds")
      .select("amount_cents, currency, status, created_at, processed_at"),
  ]);

  const rows = (pageRes.data ?? []) as RefundRow[];
  const total = pageRes.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const stats = (statRes.data ?? []) as StatRow[];

  // Pending count (any currency)
  const pendingCount = stats.filter((s) => s.status === "pending").length;

  // Total approved this month — group amount by currency to show top one,
  // because mixing currencies into a single sum is misleading.
  const approvedThisMonth = stats.filter(
    (s) => s.status === "approved" && s.created_at >= monthStartIso
  );
  const approvedByCurrency = new Map<string, number>();
  for (const r of approvedThisMonth) {
    const cur = (r.currency ?? "USD").toUpperCase();
    approvedByCurrency.set(cur, (approvedByCurrency.get(cur) ?? 0) + (r.amount_cents ?? 0));
  }
  const approvedTopCurrency = Array.from(approvedByCurrency.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const approvedSummary = approvedTopCurrency
    ? formatMoneyCents(approvedTopCurrency[1], approvedTopCurrency[0]) +
      (approvedByCurrency.size > 1 ? ` (+${approvedByCurrency.size - 1})` : "")
    : "—";

  // Total processed (sum amount_cents grouped by currency, all-time)
  const processedAll = stats.filter((s) => s.status === "processed");
  const processedByCurrency = new Map<string, number>();
  for (const r of processedAll) {
    const cur = (r.currency ?? "USD").toUpperCase();
    processedByCurrency.set(cur, (processedByCurrency.get(cur) ?? 0) + (r.amount_cents ?? 0));
  }
  const processedTopCurrency = Array.from(processedByCurrency.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const processedSummary = processedTopCurrency
    ? formatMoneyCents(processedTopCurrency[1], processedTopCurrency[0]) +
      (processedByCurrency.size > 1 ? ` (+${processedByCurrency.size - 1})` : "")
    : "—";

  // Avg processing time (created -> processed)
  const processedTimes = stats
    .filter((s) => s.status === "processed" && s.processed_at)
    .map((s) => diffMs(s.created_at, s.processed_at))
    .filter((n): n is number => n !== null);
  const avgProcessingMs =
    processedTimes.length > 0
      ? processedTimes.reduce((a, b) => a + b, 0) / processedTimes.length
      : null;

  // Resolve emails for visible refund rows.
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
          <h1 className="mt-1 text-xl font-semibold text-app">Refunds</h1>
          <p className="mt-0.5 text-xs text-muted">
            Review and process customer refund requests. Workflow:
            pending → approved → processed (or rejected/failed).
          </p>
        </div>
        <Link href="/admin/refunds/new" className={buttonClass}>
          + New refund
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending" value={pendingCount.toLocaleString()} tone="amber" />
        <StatCard
          label="Approved this month"
          value={approvedSummary}
          tone="sky"
          mono
        />
        <StatCard
          label="Processed (total)"
          value={processedSummary}
          tone="emerald"
          mono
        />
        <StatCard
          label="Avg processing time"
          value={formatDuration(avgProcessingMs)}
          tone="muted"
        />
      </div>

      {/* Filters */}
      <form
        action="/admin/refunds"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-3 lg:grid-cols-[1fr_140px_120px_140px_140px_auto]"
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
          {REFUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REFUND_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="currency"
          defaultValue={currency}
          placeholder="USD"
          maxLength={3}
          className={`${inputClass} h-9 font-mono uppercase`}
        />
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
              <th className="px-3 py-2 text-left font-normal">Created</th>
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Amount</th>
              <th className="px-3 py-2 text-left font-normal">Reason</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No refunds match.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const email = row.user_id
                  ? emailMap.get(row.user_id)?.email ?? null
                  : null;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(row.created_at)}
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
                      {formatMoneyCents(row.amount_cents, row.currency)}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {excerpt(row.reason, 60) || (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${refundStatusChipClass(
                          row.status
                        )}`}
                      >
                        {REFUND_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        {row.status === "pending" && (
                          <form action={approveRefund} className="inline">
                            <input type="hidden" name="id" value={row.id} />
                            <ActionButton tone="sky" label="Approve" />
                          </form>
                        )}
                        {row.status === "approved" && (
                          <QuickProcess id={row.id} />
                        )}
                        {(row.status === "pending" ||
                          row.status === "approved") && (
                          <QuickReject id={row.id} />
                        )}
                        <Link
                          href={`/admin/refunds/${row.id}`}
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
          currency: currency || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
        }}
      />
    </div>
  );
}

function ActionButton({
  tone,
  label,
}: {
  tone: "sky" | "emerald" | "rose";
  label: string;
}) {
  const cls =
    tone === "sky"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-500 hover:bg-sky-500/20"
      : tone === "emerald"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
        : "border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20";
  return (
    <button
      type="submit"
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}

function QuickProcess({ id }: { id: string }) {
  return (
    <form action={markProcessed} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="external_refund_id"
        required
        placeholder="ext id"
        className="h-7 w-24 rounded-md border border-app bg-app px-2 font-mono text-[10px] text-app outline-none focus:border-tool-accent"
      />
      <ActionButton tone="emerald" label="Process" />
    </form>
  );
}

function QuickReject({ id }: { id: string }) {
  return (
    <form action={rejectRefund} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="notes"
        required
        placeholder="reject note"
        className="h-7 w-24 rounded-md border border-app bg-app px-2 text-[10px] text-app outline-none focus:border-tool-accent"
      />
      <ActionButton tone="rose" label="Reject" />
    </form>
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
  tone?: "default" | "amber" | "sky" | "emerald" | "rose" | "muted";
  mono?: boolean;
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "sky"
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
    return `/admin/refunds?${sp.toString()}`;
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
