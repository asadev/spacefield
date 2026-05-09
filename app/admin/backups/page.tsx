import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatBytes,
  formatDateTime,
  inputClass,
} from "../_lib";
import { markCompleted, markFailed, triggerBackup } from "./_actions";
import {
  BACKUP_KIND_CHIP_COLORS,
  BACKUP_KIND_LABELS,
  BACKUP_KINDS,
  BACKUP_SCOPE_CHIP_COLORS,
  BACKUP_SCOPES,
  BACKUP_STATUS_CHIP_COLORS,
  BACKUP_STATUSES,
  durationLabel,
  type BackupKind,
  type BackupScope,
  type BackupStatus,
} from "./_helpers";

import type { BackupSnapshotRow } from "../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  kind?: string;
  scope?: string;
  status?: string;
  page?: string;
};

export default async function AdminBackupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const kind = (BACKUP_KINDS as readonly string[]).includes(sp.kind ?? "")
    ? (sp.kind as BackupKind)
    : null;
  const scope = (BACKUP_SCOPES as readonly string[]).includes(sp.scope ?? "")
    ? (sp.scope as BackupScope)
    : null;
  const status = (BACKUP_STATUSES as readonly string[]).includes(
    sp.status ?? ""
  )
    ? (sp.status as BackupStatus)
    : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PER_PAGE;

  const admin = createAdminClient();

  let query = admin
    .from("backup_snapshots")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (kind) query = query.eq("kind", kind);
  if (scope) query = query.eq("scope", scope);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BackupSnapshotRow[];

  // Stat-card aggregates — pull a small unfiltered window for the stats
  // so they're stable even when the table is filtered.
  const [{ data: lastSuccessRows }, { count: totalSnapshots }] =
    await Promise.all([
      admin
        .from("backup_snapshots")
        .select("started_at, finished_at")
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(1),
      admin
        .from("backup_snapshots")
        .select("id", { count: "exact", head: true }),
    ]);
  // Sum bytes across completed snapshots (limit to 1k newest to keep
  // the read bounded).
  const { data: byteRows } = await admin
    .from("backup_snapshots")
    .select("size_bytes")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1000);
  const totalBytes = ((byteRows ?? []) as { size_bytes: number | null }[])
    .reduce((acc, r) => acc + (Number(r.size_bytes) || 0), 0);

  const lastSuccess =
    (lastSuccessRows ?? [])[0] as
      | { started_at: string; finished_at: string | null }
      | undefined;

  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops · Disaster recovery
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Backup snapshots
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Manual, scheduled and pre-migration database snapshots. The
            actual backup mechanism is environmental — this view tracks
            the status machine + audit log.
          </p>
        </div>
        <TriggerBackupForm />
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Last successful backup"
          value={
            lastSuccess
              ? formatDateTime(
                  lastSuccess.finished_at ?? lastSuccess.started_at
                )
              : "—"
          }
          accent="emerald"
        />
        <StatCard
          label="Total snapshots"
          value={(totalSnapshots ?? 0).toLocaleString()}
        />
        <StatCard
          label="Total bytes (completed)"
          value={formatBytes(totalBytes)}
          accent="violet"
        />
      </div>

      {/* Filters */}
      <form
        method="get"
        action="/admin/backups"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <select
          name="kind"
          defaultValue={kind ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any kind</option>
          {BACKUP_KINDS.map((k) => (
            <option key={k} value={k}>
              {BACKUP_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          name="scope"
          defaultValue={scope ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any scope</option>
          {BACKUP_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any status</option>
          {BACKUP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
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
              <th className="px-3 py-2 text-left font-normal">When</th>
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">Scope</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Size</th>
              <th className="px-3 py-2 text-left font-normal">Duration</th>
              <th className="px-3 py-2 text-left font-normal">Storage</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-faint">
                  No snapshots match these filters. Trigger a manual one
                  above to seed.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(r.started_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        BACKUP_KIND_CHIP_COLORS[r.kind]
                      }`}
                    >
                      {BACKUP_KIND_LABELS[r.kind]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        BACKUP_SCOPE_CHIP_COLORS[r.scope]
                      }`}
                    >
                      {r.scope}
                    </span>
                    {r.scope_target && (
                      <span className="ml-1 font-mono text-[10px] text-faint">
                        {r.scope_target}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        BACKUP_STATUS_CHIP_COLORS[r.status]
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {r.size_bytes ? formatBytes(r.size_bytes) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {durationLabel(r.started_at, r.finished_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-secondary">
                    {r.storage_url ? (
                      <span
                        className="block max-w-xs truncate"
                        title={r.storage_url}
                      >
                        {r.storage_url}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(r.status === "pending" || r.status === "running") && (
                      <div className="flex items-center justify-end gap-1">
                        <CompleteForm id={r.id} />
                        <FailForm id={r.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} snapshots
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

function TriggerBackupForm() {
  return (
    <form
      action={triggerBackup}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="trigger-scope"
          className="text-[0.6rem] uppercase tracking-[0.18em] text-muted"
        >
          Scope
        </label>
        <select
          id="trigger-scope"
          name="scope"
          defaultValue="full"
          className={`${inputClass} h-9`}
        >
          {BACKUP_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="trigger-target"
          className="text-[0.6rem] uppercase tracking-[0.18em] text-muted"
        >
          Target (optional)
        </label>
        <input
          id="trigger-target"
          type="text"
          name="scope_target"
          placeholder="workspace UUID or table name"
          className={`${inputClass} h-9`}
        />
      </div>
      <button type="submit" className={buttonClass}>
        + Trigger backup
      </button>
    </form>
  );
}

function CompleteForm({ id }: { id: string }) {
  return (
    <form action={markCompleted} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input
        type="number"
        name="size_bytes"
        placeholder="bytes"
        min={0}
        className={`${inputClass} h-7 w-24 text-[11px]`}
      />
      <button
        type="submit"
        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
      >
        Complete
      </button>
    </form>
  );
}

function FailForm({ id }: { id: string }) {
  return (
    <form action={markFailed} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="reason"
        placeholder="reason"
        className={`${inputClass} h-7 w-24 text-[11px]`}
      />
      <button
        type="submit"
        className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
      >
        Fail
      </button>
    </form>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "amber" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "violet"
          ? "text-tool-accent"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accentClass}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function buildPageHref(sp: SearchParams, page: number): string {
  const params = new URLSearchParams();
  if (sp.kind) params.set("kind", sp.kind);
  if (sp.scope) params.set("scope", sp.scope);
  if (sp.status) params.set("status", sp.status);
  params.set("page", String(page));
  return `/admin/backups?${params.toString()}`;
}
