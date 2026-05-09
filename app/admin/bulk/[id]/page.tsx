import Link from "next/link";
import { notFound } from "next/navigation";

import { formatBulkDuration, getBulkOperation } from "@/lib/bulk";

import { fetchAuthUsersByIds, formatDateTime } from "../../_lib";
import type { BulkOperationRow } from "../../_types";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<BulkOperationRow["status"], string> = {
  pending: "bg-app-elevated text-secondary border border-app",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-500",
  cancelled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export default async function AdminBulkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const row = await getBulkOperation(id);
  if (!row) notFound();

  const userMap = row.actor_id
    ? await fetchAuthUsersByIds([row.actor_id])
    : new Map();
  const actorEmail = row.actor_id
    ? (userMap.get(row.actor_id)?.email ?? null)
    : null;

  const results = Array.isArray(row.results)
    ? (row.results as Array<{
        id: string;
        ok: boolean;
        error?: string | null;
        data?: unknown;
      }>)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/bulk"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All bulk operations
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">{row.operation}</h1>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
              {row.id}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Target {row.target_kind} · started {formatDateTime(row.started_at)}{" "}
              · {formatBulkDuration(row.started_at, row.finished_at)}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wide ${STATUS_CHIP[row.status]}`}
          >
            {row.status}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total" value={row.total.toLocaleString()} />
        <Stat
          label="Succeeded"
          value={row.succeeded.toLocaleString()}
          tone="emerald"
        />
        <Stat label="Failed" value={row.failed.toLocaleString()} tone="rose" />
        <Stat label="Actor" value={actorEmail ?? row.actor_id ?? "—"} mono />
      </div>

      {/* Results table */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-app">Per-target results</h2>
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Target id</th>
                <th className="px-3 py-2 text-left font-normal">Result</th>
                <th className="px-3 py-2 text-left font-normal">Error</th>
                <th className="px-3 py-2 text-left font-normal">Data</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-faint"
                  >
                    No results recorded.
                  </td>
                </tr>
              ) : (
                results.map((r, i) => (
                  <tr
                    key={`${i}:${r.id}`}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {r.id}
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500 dark:text-emerald-400">
                          ok
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-500">
                          fail
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-rose-500">
                      <span className="line-clamp-2 break-all">
                        {r.error ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-secondary">
                      <span className="line-clamp-2 break-all">
                        {r.data ? safeJson(r.data) : "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full payload */}
      <details className="rounded-xl border border-app bg-app-elevated">
        <summary className="cursor-pointer px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          Raw row JSON
        </summary>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-secondary">
          {safeJson(row)}
        </pre>
      </details>
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function Stat({
  label,
  value,
  tone = "default",
  mono,
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "rose";
  mono?: boolean;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-500"
        : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 break-all text-xl font-semibold tabular-nums ${toneCls} ${mono ? "font-mono text-base" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
