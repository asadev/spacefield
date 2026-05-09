import Link from "next/link";
import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../_lib";
import { revokeTokenAction } from "./_actions";

import type { ApiTokenRow } from "../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const FLASH_COOKIE = "sf_admin_token_flash";

type WorkspaceRow = { id: string; name: string | null };

type SearchParams = {
  page?: string;
  q?: string;
  workspace?: string;
  status?: "all" | "active" | "revoked" | "expired";
  just_minted?: string;
};

export default async function AdminApiTokensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const workspaceFilter = (sp.workspace ?? "").trim();
  const status = (["all", "active", "revoked", "expired"].includes(sp.status ?? "")
    ? sp.status
    : "all") as "all" | "active" | "revoked" | "expired";

  const admin = createAdminClient();

  // Build the base query. Filters apply server-side where possible. The
  // email filter is handled in two passes (auth.users substring then
  // intersect with the token rows) since auth.users can't be joined.
  let query = admin
    .from("api_tokens")
    .select(
      "id, user_id, workspace_id, name, prefix, scopes, expires_at, last_used_at, last_used_ip, created_at, revoked_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (workspaceFilter) {
    if (workspaceFilter === "_global") {
      query = query.is("workspace_id", null);
    } else {
      query = query.eq("workspace_id", workspaceFilter);
    }
  }

  if (status === "active") {
    query = query.is("revoked_at", null);
  } else if (status === "revoked") {
    query = query.not("revoked_at", "is", null);
  }
  // "expired" is post-filtered below since the SQL `expires_at < now()`
  // reads cleaner there alongside the JS view filtering.

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  // If we have an email filter, we have to widen the query: pull all
  // matching users first, then constrain to their ids. We deliberately
  // don't paginate the auth-side scan — listAuthUsers already caps that.
  let userIdFilter: string[] | null = null;
  if (q) {
    const { rows } = await import("../_lib").then((m) =>
      m.listAuthUsers({ emailLike: q, perPage: 200 })
    );
    userIdFilter = rows.map((r) => r.id);
    if (userIdFilter.length === 0) {
      // No user matches; bail out with an empty result without hitting
      // the tokens table — `.in('user_id', [])` is a Postgres error in
      // some clients.
      return renderEmpty({ q, page, status, workspaceFilter });
    }
    query = query.in("user_id", userIdFilter);
  }

  const { data: tokenRowsRaw, count: totalCount, error } = await query.range(
    from,
    to
  );
  if (error) throw new Error(error.message);

  let tokenRows = (tokenRowsRaw ?? []) as ApiTokenRow[];

  if (status === "expired") {
    const now = Date.now();
    tokenRows = tokenRows.filter(
      (r) => r.expires_at && new Date(r.expires_at).getTime() < now
    );
  }

  const total = totalCount ?? tokenRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // User email lookup
  const userIds = Array.from(new Set(tokenRows.map((r) => r.user_id)));
  const usersMap = await fetchAuthUsersByIds(userIds);

  // Workspace name lookup
  const wsIds = Array.from(
    new Set(
      tokenRows.map((r) => r.workspace_id).filter((x): x is string => Boolean(x))
    )
  );
  const wsMap = new Map<string, string>();
  if (wsIds.length > 0) {
    const { data: wsRows } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    for (const w of (wsRows ?? []) as WorkspaceRow[]) {
      wsMap.set(w.id, w.name ?? "—");
    }
  }

  // Workspace dropdown options — distinct workspace_ids in the table
  // plus a "global" sentinel.
  const { data: distinctWsRows } = await admin
    .from("api_tokens")
    .select("workspace_id")
    .not("workspace_id", "is", null)
    .limit(500);
  const distinctWsIds = Array.from(
    new Set(
      ((distinctWsRows ?? []) as { workspace_id: string | null }[])
        .map((r) => r.workspace_id)
        .filter((x): x is string => Boolean(x))
    )
  );
  let dropdownWs: WorkspaceRow[] = [];
  if (distinctWsIds.length > 0) {
    const { data } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", distinctWsIds);
    dropdownWs = (data ?? []) as WorkspaceRow[];
  }

  // Read + clear the just-minted cookie if present.
  const jar = await cookies();
  let flash: { id: string; raw: string } | null = null;
  if (sp.just_minted) {
    const cookie = jar.get(FLASH_COOKIE)?.value;
    if (cookie) {
      try {
        const parsed = JSON.parse(cookie) as { id: string; raw: string };
        if (parsed.id === sp.just_minted) flash = parsed;
      } catch {
        // ignore
      }
      // Clear the cookie so a refresh hides the panel.
      jar.set(FLASH_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 0,
        path: "/admin/api-tokens",
      });
    }
  }

  // Stats
  const now = Date.now();
  const stats = {
    total,
    active: tokenRows.filter(
      (r) =>
        !r.revoked_at &&
        (!r.expires_at || new Date(r.expires_at).getTime() > now)
    ).length,
    revoked: tokenRows.filter((r) => r.revoked_at).length,
    expired: tokenRows.filter(
      (r) =>
        !r.revoked_at &&
        r.expires_at &&
        new Date(r.expires_at).getTime() <= now
    ).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">API tokens</h1>
          <p className="mt-0.5 text-xs text-muted">
            Programmatic access to the platform. Tokens are SHA-256 hashed
            on disk; the raw value is shown once at mint time.
          </p>
        </div>
        <Link href="/admin/api-tokens/new" className={buttonClass}>
          + Mint token
        </Link>
      </div>

      {flash && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
            Save now — won&apos;t be shown again
          </div>
          <h2 className="mt-1 text-sm font-semibold text-app">
            Token minted
          </h2>
          <p className="mt-1 text-xs text-muted">
            This is the only time the raw token will be displayed. Copy it
            into 1Password or hand it to the user now. After this page
            navigates away, only the prefix is visible.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs text-app">
            {flash.raw}
          </pre>
          <div className="mt-2 text-[11px] text-muted">
            Token id <span className="font-mono">{flash.id}</span> · prefix{" "}
            <span className="font-mono">{flash.raw.slice(0, 8)}</span>
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} accent="emerald" />
        <StatCard label="Revoked" value={stats.revoked} accent="rose" />
        <StatCard label="Expired" value={stats.expired} accent="amber" />
      </div>

      {/* Filters */}
      <form
        action="/admin/api-tokens"
        method="get"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-[2fr_1.5fr_1fr_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="User email substring"
          className={`${inputClass} h-9`}
        />
        <select
          name="workspace"
          defaultValue={workspaceFilter}
          className={`${inputClass} h-9`}
        >
          <option value="">Any workspace</option>
          <option value="_global">Global (no workspace)</option>
          {dropdownWs.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name || w.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className={`${inputClass} h-9`}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
        <button type="submit" className={buttonGhostClass}>
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Token</th>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
              <th className="px-3 py-2 text-left font-normal">Scopes</th>
              <th className="px-3 py-2 text-left font-normal">Expires</th>
              <th className="px-3 py-2 text-left font-normal">Last used</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokenRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-faint">
                  No tokens match.
                </td>
              </tr>
            ) : (
              tokenRows.map((t) => {
                const u = usersMap.get(t.user_id);
                const wsName = t.workspace_id
                  ? wsMap.get(t.workspace_id) ?? t.workspace_id.slice(0, 8)
                  : "—";
                const expired =
                  !t.revoked_at &&
                  t.expires_at &&
                  new Date(t.expires_at).getTime() <= now;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <div
                        className="font-mono text-[10px] tabular-nums text-faint"
                        title={t.id}
                      >
                        {t.id.slice(0, 8)}
                      </div>
                      <div className="font-mono text-xs text-secondary">
                        {t.prefix}…
                      </div>
                    </td>
                    <td className="px-3 py-2 text-app">{t.name}</td>
                    <td className="px-3 py-2">
                      {u?.email ? (
                        <Link
                          href={`/admin/users/${t.user_id}`}
                          className="text-secondary hover:text-tool-accent"
                        >
                          {u.email}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-faint">
                          {t.user_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {t.workspace_id ? (
                        <Link
                          href={`/admin/workspaces/${t.workspace_id}`}
                          className="text-secondary hover:text-tool-accent"
                        >
                          {wsName}
                        </Link>
                      ) : (
                        <span className="text-xs text-faint">global</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(t.scopes ?? []).length === 0 ? (
                          <span className="text-xs text-faint">—</span>
                        ) : (
                          (t.scopes ?? []).map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-tool-accent"
                            >
                              {s}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(t.expires_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs tabular-nums text-secondary">
                        {formatDateTime(t.last_used_at)}
                      </div>
                      {t.last_used_ip && (
                        <div className="font-mono text-[10px] text-faint">
                          {t.last_used_ip}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {t.revoked_at ? (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                          revoked
                        </span>
                      ) : expired ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                          expired
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!t.revoked_at && (
                        <form action={revokeTokenAction} className="inline">
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                          >
                            Revoke
                          </button>
                        </form>
                      )}
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
          page={page - 1}
          disabled={page <= 1}
          q={q}
          workspace={workspaceFilter}
          status={status}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          page={page + 1}
          disabled={page >= totalPages}
          q={q}
          workspace={workspaceFilter}
          status={status}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function renderEmpty({
  q,
  page,
  status,
  workspaceFilter,
}: {
  q: string;
  page: number;
  status: string;
  workspaceFilter: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">API tokens</h1>
        </div>
        <Link href="/admin/api-tokens/new" className={buttonClass}>
          + Mint token
        </Link>
      </div>
      <div className="rounded-xl border border-app bg-app-elevated px-4 py-10 text-center text-sm text-faint">
        No tokens match.
        <div className="mt-1 font-mono text-[11px]">
          q={q} · ws={workspaceFilter || "—"} · status={status} · page={page}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "rose" | "amber";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "rose"
        ? "text-rose-500"
        : accent === "amber"
          ? "text-amber-500"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  q,
  workspace,
  status,
  children,
}: {
  page: number;
  disabled?: boolean;
  q?: string;
  workspace?: string;
  status?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (workspace) params.set("workspace", workspace);
  if (status && status !== "all") params.set("status", status);
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/api-tokens?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}
