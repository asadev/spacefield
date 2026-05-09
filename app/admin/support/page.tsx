import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../_lib";
import type {
  SupportTicketPriority,
  SupportTicketRow,
  SupportTicketStatus,
} from "../_types";
import {
  PRIORITY_CHIP,
  PRIORITY_RANK,
  STATUS_CHIP,
  STATUS_RANK,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "./_helpers";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  page?: string;
  status?: string;
  priority?: string;
  assigned?: string;
  q?: string;
};

function isStatus(v: string): v is SupportTicketStatus {
  return (TICKET_STATUSES as ReadonlyArray<string>).includes(v);
}

function isPriority(v: string): v is SupportTicketPriority {
  return (TICKET_PRIORITIES as ReadonlyArray<string>).includes(v);
}

export default async function AdminSupportInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const statusFilter = (sp.status ?? "").trim();
  const priorityFilter = (sp.priority ?? "").trim();
  const assignedFilter = (sp.assigned ?? "").trim();
  const q = (sp.q ?? "").trim();

  const admin = createAdminClient();

  // Pull stats independent of the filtered list — admins want the
  // platform-wide numbers in the header regardless of filter.
  const todayIso = new Date(
    new Date().setHours(0, 0, 0, 0)
  ).toISOString();

  const [openCnt, inProgressCnt, urgentCnt, resolvedTodayCnt] =
    await Promise.all([
      admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .then((r) => r.count ?? 0),
      admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress")
        .then((r) => r.count ?? 0),
      admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("priority", "urgent")
        .not("status", "in", "(resolved,closed)")
        .then((r) => r.count ?? 0),
      admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("resolved_at", todayIso)
        .then((r) => r.count ?? 0),
    ]);

  // Build the filtered query.
  let query = admin
    .from("support_tickets")
    .select("*", { count: "exact" });

  if (statusFilter && isStatus(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (priorityFilter && isPriority(priorityFilter)) {
    query = query.eq("priority", priorityFilter);
  }
  if (q) query = query.ilike("subject", `%${q}%`);

  // The assigned filter accepts either an admin email (we resolve to a
  // user id) or "unassigned".
  if (assignedFilter === "unassigned") {
    query = query.is("assigned_to", null);
  } else if (assignedFilter) {
    // Resolve to user id if it looks like an email.
    if (assignedFilter.includes("@")) {
      const { data: profileMatch } = await admin
        .from("profiles")
        .select("user_id")
        .ilike("user_id", assignedFilter)
        .maybeSingle();
      if (profileMatch?.user_id) {
        query = query.eq("assigned_to", profileMatch.user_id);
      } else {
        // Fall back to scanning auth.users via the admin API. Cheap
        // because we only need a single id.
        const { listAuthUsers } = await import("../_lib");
        const r = await listAuthUsers({ emailLike: assignedFilter });
        const exact = r.rows.find(
          (u) => (u.email ?? "").toLowerCase() === assignedFilter.toLowerCase()
        );
        if (exact) query = query.eq("assigned_to", exact.id);
        else query = query.eq("assigned_to", "00000000-0000-0000-0000-000000000000");
      }
    } else {
      query = query.eq("assigned_to", assignedFilter);
    }
  }

  // We can't statically order by status enum the way the spec wants
  // (open first, urgent first, then last_response_at desc) because
  // Postgres has no built-in for arbitrary enum order without CASE. So
  // we paginate by created_at desc on the server, then re-sort the
  // current page on the JS side. Good enough for 50 rows.
  query = query
    .order("last_response_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  const { data, count } = await query;
  const rawRows = (data ?? []) as SupportTicketRow[];

  // JS-side sort: status rank → priority rank → last_response_at desc.
  const rows = [...rawRows].sort((a, b) => {
    const sa = STATUS_RANK[a.status] ?? 99;
    const sb = STATUS_RANK[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    const la = a.last_response_at ? Date.parse(a.last_response_at) : 0;
    const lb = b.last_response_at ? Date.parse(b.last_response_at) : 0;
    return lb - la;
  });

  // Resolve assigned_to + user emails for display.
  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.assigned_to, r.user_id])
        .filter((v): v is string => Boolean(v))
    )
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Support inbox</h1>
          <p className="mt-0.5 text-xs text-muted">
            {total.toLocaleString()} matching · page {page} of {totalPages}
          </p>
        </div>
        <Link
          href="/admin/support/impersonations"
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Impersonation log →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={openCnt} tone="emerald" />
        <StatCard label="In progress" value={inProgressCnt} />
        <StatCard label="Urgent (open)" value={urgentCnt} tone="rose" />
        <StatCard label="Resolved today" value={resolvedTodayCnt} tone="muted" />
      </div>

      <form
        action="/admin/support"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
            Status
          </label>
          <select
            name="status"
            defaultValue={statusFilter}
            className={`${inputClass} h-9 w-36`}
          >
            <option value="">All</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
            Priority
          </label>
          <select
            name="priority"
            defaultValue={priorityFilter}
            className={`${inputClass} h-9 w-32`}
          >
            <option value="">All</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
            Assigned (email or &quot;unassigned&quot;)
          </label>
          <input
            name="assigned"
            defaultValue={assignedFilter}
            placeholder="admin@example.com"
            className={`${inputClass} h-9 w-56`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
            Subject
          </label>
          <input
            name="q"
            defaultValue={q}
            placeholder="search subject…"
            className={`${inputClass} h-9 w-72`}
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        {(statusFilter || priorityFilter || assignedFilter || q) && (
          <Link
            href="/admin/support"
            className="h-9 rounded-lg px-2 text-xs text-faint hover:text-app"
            style={{ lineHeight: "2.25rem" }}
          >
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Subject</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Priority</th>
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Assigned</th>
              <th className="px-3 py-2 text-left font-normal">Last reply</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-faint">
                  No tickets match.
                </td>
              </tr>
            ) : (
              rows.map((t) => {
                const userEmail = t.user_id
                  ? userMap.get(t.user_id)?.email ?? null
                  : null;
                const assignedEmail = t.assigned_to
                  ? userMap.get(t.assigned_to)?.email ?? null
                  : null;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="max-w-md px-3 py-2">
                      <Link
                        href={`/admin/support/${t.id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        <span className="line-clamp-1">{t.subject}</span>
                      </Link>
                      {t.category && (
                        <span className="ml-2 text-[10px] text-faint">
                          · {t.category}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[t.status]}`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${PRIORITY_CHIP[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {userEmail ?? (t.user_id ? `${t.user_id.slice(0, 8)}…` : "—")}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {assignedEmail ?? (t.assigned_to ? `${t.assigned_to.slice(0, 8)}…` : (
                        <span className="text-faint">unassigned</span>
                      ))}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {t.last_response_at
                        ? formatDateTime(t.last_response_at)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(t.created_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink
          page={page - 1}
          disabled={page <= 1}
          searchParams={{ ...sp }}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          page={page + 1}
          disabled={page >= totalPages}
          searchParams={{ ...sp }}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "rose" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-500 dark:text-rose-400"
        : tone === "muted"
          ? "text-secondary"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  searchParams,
  children,
}: {
  page: number;
  disabled?: boolean;
  searchParams: SearchParams;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.priority) params.set("priority", searchParams.priority);
  if (searchParams.assigned) params.set("assigned", searchParams.assigned);
  if (searchParams.q) params.set("q", searchParams.q);
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/support?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}
