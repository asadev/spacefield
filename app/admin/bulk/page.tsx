import Link from "next/link";

import {
  formatBulkDuration,
  listBulkOperations,
} from "@/lib/bulk";

import { fetchAuthUsersByIds, formatDateTime } from "../_lib";
import type { BulkOperationRow } from "../_types";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<BulkOperationRow["status"], string> = {
  pending: "bg-app-elevated text-secondary border border-app",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-500",
  cancelled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function AdminBulkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "all").toLowerCase();
  const validStatus =
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "pending"
      ? status
      : "all";

  const rows = await listBulkOperations({
    limit: 200,
    status: validStatus as BulkOperationRow["status"] | "all",
  });

  // Resolve actor emails.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))
  );
  const userMap = await fetchAuthUsersByIds(actorIds);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Ops
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Bulk operations
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Records of every batch admin action. Inserted automatically by the{" "}
          <code className="font-mono text-[11px] text-secondary">runBulk()</code>
          {" "}helper. Click a row for full per-target results.
        </p>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = validStatus === opt.key;
          const params = new URLSearchParams();
          if (opt.key !== "all") params.set("status", opt.key);
          const href = `/admin/bulk${
            params.toString() ? `?${params.toString()}` : ""
          }`;
          return (
            <Link
              key={opt.key}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-tool-accent bg-tool-accent text-white"
                  : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Started</th>
              <th className="px-3 py-2 text-left font-normal">Operation</th>
              <th className="px-3 py-2 text-left font-normal">Target</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
              <th className="px-3 py-2 text-right font-normal">OK</th>
              <th className="px-3 py-2 text-right font-normal">Fail</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Duration</th>
              <th className="px-3 py-2 text-left font-normal">Actor</th>
              <th className="px-3 py-2 text-right font-normal">View</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-faint">
                  No bulk operations yet.
                </td>
              </tr>
            ) : (
              rows.map((b) => {
                const u = b.actor_id ? userMap.get(b.actor_id) : null;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(b.started_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/bulk/${b.id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        {b.operation}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {b.target_kind}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-app">
                      {b.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-emerald-500 dark:text-emerald-400">
                      {b.succeeded.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-rose-500">
                      {b.failed.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[b.status]}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatBulkDuration(b.started_at, b.finished_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {u?.email ?? b.actor_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/bulk/${b.id}`}
                        className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
