import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * /admin/waitlist — paginated table of pre-launch waitlist_signups.
 *
 * Search by email substring (case-insensitive on the stored
 * email_lower). CSV export is available at /admin/waitlist/export with
 * the same `q` filter applied.
 */

const PER_PAGE = 50;

type WaitlistRow = {
  id: string;
  email: string;
  email_lower: string;
  role: string | null;
  source: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
};

export default async function AdminWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();

  const admin = createAdminClient();
  const offset = (page - 1) * PER_PAGE;

  let listQuery = admin
    .from("waitlist_signups")
    .select(
      "id, email, email_lower, role, source, ip_hash, user_agent, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (q) {
    const needle = q.toLowerCase().replace(/[%,]/g, "");
    listQuery = listQuery.ilike("email_lower", `%${needle}%`);
  }

  // Stats: total + last 24h count.
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [listRes, totalRes, last24Res, last7Res, roleRes] = await Promise.all([
    listQuery,
    admin.from("waitlist_signups").select("id", { count: "exact", head: true }),
    admin
      .from("waitlist_signups")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24),
    admin
      .from("waitlist_signups")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d),
    admin
      .from("waitlist_signups")
      .select("role")
      .not("role", "is", null)
      .limit(5000),
  ]);

  const rows = (listRes.data ?? []) as WaitlistRow[];
  const totalFiltered = listRes.count ?? 0;
  const totalAll = totalRes.count ?? 0;
  const last24 = last24Res.count ?? 0;
  const last7d = last7Res.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));

  const roleCounts = new Map<string, number>();
  for (const r of (roleRes.data ?? []) as Array<{ role: string | null }>) {
    if (!r.role) continue;
    roleCounts.set(r.role, (roleCounts.get(r.role) ?? 0) + 1);
  }
  const topRoles = Array.from(roleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  const exportHref = exportParams.toString()
    ? `/admin/waitlist/export?${exportParams.toString()}`
    : "/admin/waitlist/export";

  const pageParams = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    return params.toString() ? `/admin/waitlist?${params.toString()}` : "/admin/waitlist";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Pre-launch
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Waitlist signups</h1>
          <p className="mt-0.5 text-xs text-muted">
            Pre-launch email collection from{" "}
            <Link
              href="/waitlist"
              className="text-tool-accent hover:underline"
            >
              /waitlist
            </Link>
            . {totalAll.toLocaleString()} total · page {page} of {totalPages}.
          </p>
        </div>
        <a
          href={exportHref}
          className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
        >
          Export CSV{q ? " (filtered)" : ""}
        </a>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={totalAll.toLocaleString()} />
        <StatCard label="Last 24h" value={last24.toLocaleString()} />
        <StatCard label="Last 7d" value={last7d.toLocaleString()} />
        <div className="rounded-xl border border-app bg-app-elevated p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Top roles
          </div>
          {topRoles.length === 0 ? (
            <div className="mt-2 text-xs text-faint">None reported.</div>
          ) : (
            <ul className="mt-2 space-y-1">
              {topRoles.map(([role, count]) => (
                <li
                  key={role}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate text-secondary" title={role}>
                    {role}
                  </span>
                  <span className="font-mono tabular-nums text-app">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Filter */}
      <form
        action="/admin/waitlist"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            Search email
          </span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="contains…"
            className={`${inputClass} h-9 w-64`}
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        {q ? (
          <Link
            href="/admin/waitlist"
            className="h-9 rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted transition-colors hover:border-app hover:text-app"
          >
            Reset
          </Link>
        ) : null}
        <span className="ml-auto text-[11px] text-faint">
          {totalFiltered.toLocaleString()} match{q ? " filter" : ""}
        </span>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Email</th>
              <th className="px-3 py-2 text-left font-normal">Role</th>
              <th className="px-3 py-2 text-left font-normal">Source</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
              <th className="px-3 py-2 text-left font-normal">IP hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-faint">
                  {q
                    ? "No signups match this filter."
                    : "No signups yet. /waitlist is live but the table is empty."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2 text-xs text-app">
                    <div
                      className="line-clamp-1 break-all font-mono"
                      title={r.email}
                    >
                      {r.email_lower || r.email}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    {r.role ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    {r.source ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-faint">
                    {r.ip_hash ? r.ip_hash.slice(0, 12) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink href={pageParams(Math.max(1, page - 1))} disabled={page <= 1}>
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          href={pageParams(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next →
        </PageLink>
      </div>
    </div>
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
  href,
  disabled,
  children,
}: {
  href: string;
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
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
