import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import Avatar from "../_components/Avatar";
import {
  formatDate,
  inputClass,
  listAuthUsers,
  tierBadgeClass,
} from "../_lib";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type ProfileRow = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  created_at: string;
};

type SubRow = {
  user_id: string;
  tier_id: string;
  status: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();

  const { rows: authUsers, total } = await listAuthUsers({
    page,
    perPage: PER_PAGE,
    emailLike: q || undefined,
  });
  const ids = authUsers.map((u) => u.id);

  const admin = createAdminClient();

  // Profiles + subscriptions for these ids
  const [profilesRes, subsRes] = await Promise.all([
    ids.length
      ? admin
          .from("profiles")
          .select("user_id, username, full_name, avatar_url, is_admin, created_at")
          .in("user_id", ids)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    ids.length
      ? admin
          .from("subscriptions")
          .select("user_id, tier_id, status")
          .in("user_id", ids)
      : Promise.resolve({ data: [] as SubRow[], error: null }),
  ]);

  const profiles = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
  );
  const subs = new Map(
    ((subsRes.data ?? []) as SubRow[]).map((s) => [s.user_id, s])
  );

  // Username filter (server-side ilike, client-side intersection)
  let displayRows = authUsers;
  if (q) {
    const needle = q.toLowerCase();
    displayRows = authUsers.filter((u) => {
      if ((u.email ?? "").toLowerCase().includes(needle)) return true;
      const p = profiles.get(u.id);
      const uname = (p?.username ?? "").toLowerCase();
      return uname.includes(needle);
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Users
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">All users</h1>
          <p className="mt-0.5 text-xs text-muted">
            {total.toLocaleString()} total · page {page} of {totalPages}
          </p>
        </div>
        <form action="/admin/users" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by email or username"
            className={`${inputClass} h-9 w-72`}
          />
          <button
            type="submit"
            className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Email</th>
              <th className="px-3 py-2 text-left font-normal">Tier</th>
              <th className="px-3 py-2 text-left font-normal">Role</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-faint">
                  {q ? "No matches." : "No users yet."}
                </td>
              </tr>
            ) : (
              displayRows.map((u) => {
                const p = profiles.get(u.id);
                const s = subs.get(u.id);
                const name = p?.full_name || p?.username || u.email || u.id.slice(0, 8);
                return (
                  <tr
                    key={u.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="flex items-center gap-2 text-app"
                      >
                        <Avatar
                          url={p?.avatar_url ?? null}
                          fallback={name}
                          size={24}
                        />
                        <span className="font-medium hover:text-tool-accent">
                          {name}
                        </span>
                        {p?.username && (
                          <span className="text-xs text-faint">
                            @{p.username}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tierBadgeClass(s?.tier_id)}`}
                      >
                        {s?.tier_id ?? "free"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {p?.is_admin ? (
                        <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                          admin
                        </span>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDate(u.created_at || p?.created_at)}
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
        <PageLink page={page - 1} disabled={page <= 1} q={q}>
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          page={page + 1}
          disabled={page >= totalPages}
          q={q}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  q,
  children,
}: {
  page: number;
  disabled?: boolean;
  q?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/users?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}
