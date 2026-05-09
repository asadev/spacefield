import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../_lib";
import { runRequest } from "./_actions";
import {
  EXPORT_KIND_CHIP_COLORS,
  EXPORT_KIND_LABELS,
  EXPORT_KINDS,
  EXPORT_STATUS_CHIP_COLORS,
  EXPORT_STATUSES,
  type DataExportKind,
  type DataExportStatus,
} from "./_helpers";

import type { DataExportRequestRow } from "../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  status?: string;
  kind?: string;
  q?: string;
  page?: string;
};

export default async function AdminDataExportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const status = (EXPORT_STATUSES as readonly string[]).includes(
    sp.status ?? ""
  )
    ? (sp.status as DataExportStatus)
    : null;
  const kind = (EXPORT_KINDS as readonly string[]).includes(sp.kind ?? "")
    ? (sp.kind as DataExportKind)
    : null;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PER_PAGE;

  const admin = createAdminClient();

  let query = admin
    .from("data_export_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (status) query = query.eq("status", status);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.ilike("notes", `%${q}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DataExportRequestRow[];

  // Resolve user emails.
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((u): u is string => Boolean(u)))
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  // Status counts.
  const counts = await Promise.all(
    EXPORT_STATUSES.map(async (s) => {
      const { count: c } = await admin
        .from("data_export_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      return { status: s, count: c ?? 0 };
    })
  );

  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Security · GDPR
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Data exports &amp; deletion requests
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            GDPR exports, account deletions and per-workspace exports. The
            row drives the status machine; the actual file generation is
            an environmental follow-up.
          </p>
        </div>
        <Link href="/admin/data-exports/new" className={buttonClass}>
          + New request
        </Link>
      </div>

      {/* Status counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {counts.map((c) => {
          const params = new URLSearchParams();
          params.set("status", c.status);
          if (kind) params.set("kind", kind);
          const isActive = status === c.status;
          return (
            <Link
              key={c.status}
              href={`/admin/data-exports?${params.toString()}`}
              className={`rounded-xl border p-4 transition-colors ${
                isActive
                  ? "border-tool-accent bg-tool-accent-soft"
                  : "border-app bg-app-elevated hover:border-tool-accent"
              }`}
            >
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                {c.status}
              </div>
              <div
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  c.status === "ready"
                    ? "text-emerald-500"
                    : c.status === "failed"
                      ? "text-rose-500"
                      : c.status === "running"
                        ? "text-blue-500"
                        : c.status === "pending"
                          ? "text-amber-500"
                          : "text-secondary"
                }`}
              >
                {c.count.toLocaleString()}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <form
        method="get"
        action="/admin/data-exports"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <select
          name="status"
          defaultValue={status ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any status</option>
          {EXPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="kind"
          defaultValue={kind ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any kind</option>
          {EXPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {EXPORT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Notes contain..."
          className={`${inputClass} h-9`}
        />
        <button type="submit" className={buttonGhostClass}>
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
              <th className="px-3 py-2 text-left font-normal">Expires</th>
              <th className="px-3 py-2 text-left font-normal">Notes</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-faint">
                  No requests match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const userEmail = r.user_id
                  ? userMap.get(r.user_id)?.email ?? null
                  : null;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          EXPORT_KIND_CHIP_COLORS[r.kind]
                        }`}
                      >
                        {EXPORT_KIND_LABELS[r.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-secondary">
                      {userEmail ?? r.user_id?.slice(0, 8) ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          EXPORT_STATUS_CHIP_COLORS[r.status]
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.expires_at)}
                    </td>
                    <td className="px-3 py-2 max-w-md truncate text-xs text-secondary">
                      {r.notes ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === "pending" && r.kind !== "deletion" && (
                          <form action={runRequest} className="inline-flex">
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-500 transition-colors hover:bg-blue-500/20"
                            >
                              Run
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/admin/data-exports/${r.id}`}
                          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          Open
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} requests
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(sp, page - 1)}
                className={buttonGhostClass}
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageHref(sp, page + 1)}
                className={buttonGhostClass}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildPageHref(sp: SearchParams, page: number): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.kind) params.set("kind", sp.kind);
  if (sp.q) params.set("q", sp.q);
  params.set("page", String(page));
  return `/admin/data-exports?${params.toString()}`;
}
