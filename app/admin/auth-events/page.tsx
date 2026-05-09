import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime, inputClass } from "../_lib";
import type { AuthEventName, AuthEventRow } from "../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

const EVENT_OPTIONS: AuthEventName[] = [
  "sign_in",
  "sign_out",
  "sign_up",
  "password_reset",
  "magic_link",
  "password_change",
  "email_change",
  "mfa_enabled",
  "mfa_disabled",
  "suspended",
  "unsuspended",
];

/**
 * Per the contract: sign_in green, sign_out gray, sign_up blue, others
 * amber. We pre-bake every enum value so we never fall through to a
 * dynamic class string Tailwind can't statically detect.
 */
const EVENT_COLORS: Record<AuthEventName, string> = {
  sign_in: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  sign_out: "bg-app-elevated text-secondary border border-app",
  sign_up: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  password_reset: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  magic_link: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  password_change: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  email_change: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  mfa_enabled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  mfa_disabled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  suspended: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  unsuspended: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function eventChipClass(event: string): string {
  return (
    EVENT_COLORS[event as AuthEventName] ??
    "bg-amber-500/15 text-amber-600 dark:text-amber-400"
  );
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function safeIsoStart(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function safeIsoEnd(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T23:59:59.999Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function AdminAuthEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    event?: string;
    user?: string;
    ip?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const eventQ = (sp.event ?? "").trim();
  const userQ = (sp.user ?? "").trim();
  const ipQ = (sp.ip ?? "").trim();
  const fromQ = (sp.from ?? "").trim();
  const toQ = (sp.to ?? "").trim();

  const fromIso = safeIsoStart(fromQ);
  const toIso = safeIsoEnd(toQ);

  const admin = createAdminClient();
  const offset = (page - 1) * PER_PAGE;

  let listQuery = admin
    .from("auth_events")
    .select(
      "id, user_id, email, event, ip, user_agent, metadata, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (eventQ) listQuery = listQuery.eq("event", eventQ);
  if (userQ) listQuery = listQuery.ilike("email", `%${userQ}%`);
  if (ipQ) listQuery = listQuery.ilike("ip", `%${ipQ}%`);
  if (fromIso) listQuery = listQuery.gte("created_at", fromIso);
  if (toIso) listQuery = listQuery.lte("created_at", toIso);

  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = startOfTodayIso();

  const [
    listRes,
    signInsRes,
    distinctTodayRes,
    signUpsRes,
    pwdResetsRes,
  ] = await Promise.all([
    listQuery,
    admin
      .from("auth_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "sign_in")
      .gte("created_at", oneDayAgo),
    admin
      .from("auth_events")
      .select("user_id, email")
      .gte("created_at", todayStart)
      .limit(5000),
    admin
      .from("auth_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "sign_up")
      .gte("created_at", sevenDaysAgo),
    admin
      .from("auth_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "password_reset")
      .gte("created_at", sevenDaysAgo),
  ]);

  const rows = (listRes.data ?? []) as AuthEventRow[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Backfill emails from auth.users for rows that didn't capture one at
  // event-write time (e.g., a sign-out row with a stale session cookie).
  const missingEmailIds = rows
    .filter((r) => !r.email && r.user_id)
    .map((r) => r.user_id as string);
  const authMap = await fetchAuthUsersByIds(missingEmailIds);

  const distinctSet = new Set<string>();
  for (const r of (distinctTodayRes.data ?? []) as Array<{
    user_id: string | null;
    email: string | null;
  }>) {
    const k = r.user_id ?? r.email;
    if (k) distinctSet.add(k);
  }

  const stats = {
    last24SignIns: signInsRes.count ?? 0,
    distinctUsersToday: distinctSet.size,
    signUps7d: signUpsRes.count ?? 0,
    passwordResets7d: pwdResetsRes.count ?? 0,
  };

  const baseParams = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (eventQ) p.set("event", eventQ);
    if (userQ) p.set("user", userQ);
    if (ipQ) p.set("ip", ipQ);
    if (fromQ) p.set("from", fromQ);
    if (toQ) p.set("to", toQ);
    if (page > 1) p.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    return p;
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Auth events
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Sign-in audit</h1>
        <p className="mt-0.5 text-xs text-muted">
          {total.toLocaleString()} total · page {page} of {totalPages}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sign-ins (24h)"
          value={stats.last24SignIns.toLocaleString()}
        />
        <StatCard
          label="Distinct users today"
          value={stats.distinctUsersToday.toLocaleString()}
        />
        <StatCard
          label="Sign-ups (7d)"
          value={stats.signUps7d.toLocaleString()}
        />
        <StatCard
          label="Password resets (7d)"
          value={stats.passwordResets7d.toLocaleString()}
        />
      </div>

      {/* Filters */}
      <form
        action="/admin/auth-events"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <Field label="Event">
          <select
            name="event"
            defaultValue={eventQ}
            className={`${inputClass} h-9 w-44`}
          >
            <option value="">Any</option>
            {EVENT_OPTIONS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </Field>
        <Field label="User email">
          <input
            type="search"
            name="user"
            defaultValue={userQ}
            placeholder="email contains…"
            className={`${inputClass} h-9 w-48`}
          />
        </Field>
        <Field label="IP">
          <input
            type="search"
            name="ip"
            defaultValue={ipQ}
            placeholder="ip contains…"
            className={`${inputClass} h-9 w-40`}
          />
        </Field>
        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={fromQ}
            className={`${inputClass} h-9 w-40`}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={toQ}
            className={`${inputClass} h-9 w-40`}
          />
        </Field>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/auth-events"
          className="h-9 rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted transition-colors hover:border-app hover:text-app"
        >
          Reset
        </Link>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">When</th>
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Event</th>
              <th className="px-3 py-2 text-left font-normal">IP</th>
              <th className="px-3 py-2 text-left font-normal">User agent</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-faint">
                  No events match.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const fallbackEmail =
                  r.user_id && authMap.get(r.user_id)?.email;
                const email = r.email ?? fallbackEmail ?? null;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-app">
                      <div
                        className="truncate"
                        title={email ?? ""}
                      >
                        {email ?? <span className="text-faint">—</span>}
                      </div>
                      {r.user_id && (
                        <div
                          className="truncate font-mono text-[10px] text-faint"
                          title={r.user_id}
                        >
                          {r.user_id.slice(0, 8)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${eventChipClass(
                          r.event
                        )}`}
                      >
                        {r.event}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {r.ip ?? <span className="text-faint">—</span>}
                    </td>
                    <td
                      className="px-3 py-2 text-xs text-secondary"
                      title={r.user_agent ?? ""}
                    >
                      {truncate(r.user_agent, 60)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink
          params={baseParams({ page: String(Math.max(1, page - 1)) })}
          disabled={page <= 1}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          params={baseParams({ page: String(Math.min(totalPages, page + 1)) })}
          disabled={page >= totalPages}
        >
          Next →
        </PageLink>
      </div>
    </div>
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
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-app">{value}</div>
    </div>
  );
}

function PageLink({
  params,
  disabled,
  children,
}: {
  params: URLSearchParams;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link
      href={`/admin/auth-events?${params.toString()}`}
      className={cls}
    >
      {children}
    </Link>
  );
}
