"use client";

/* Send history — log of outbound sends with status & target.
 *
 * For bulk sends each row aggregates per-contact deliveries. Click the row
 * to open the breakdown drawer (GET /api/whatsapp/history/:id). */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHistory,
  fetchHistoryDetail,
  type WaHistoryRow,
  type WaJobLogEntry,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  SecondaryButton,
  formatPhone,
  formatRelative,
  formatStatusIcon,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

const TARGETS: ReadonlyArray<{ key: "" | "contact" | "group" | "list"; label: string }> = [
  { key: "", label: "All" },
  { key: "contact", label: "Contacts" },
  { key: "group", label: "Groups" },
  { key: "list", label: "Lists" },
];

const STATUSES: ReadonlyArray<{ key: ""; label: string } | { key: WaHistoryRow["status"]; label: string }> = [
  { key: "", label: "Any" },
  { key: "delivered", label: "Delivered" },
  { key: "read", label: "Read" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "queued", label: "Queued" },
];

const STATUS_TONE: Record<WaHistoryRow["status"], "success" | "warn" | "danger" | "info" | "neutral"> = {
  queued: "neutral",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "danger",
  mixed: "warn",
};

export default function SendHistoryTab({ workspaceId, compact }: Props) {
  const [rows, setRows] = useState<WaHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    target_type: "" | "contact" | "group" | "list";
    status: "" | WaHistoryRow["status"];
    from: string;
    to: string;
  }>({ target_type: "", status: "", from: "", to: "" });
  const [drawer, setDrawer] = useState<WaHistoryRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchHistory(workspaceId, {
      target_type: filters.target_type || undefined,
      status: filters.status || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setRows([]);
      return;
    }
    setRows(res.data);
  }, [filters, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    let delivered = 0;
    let failed = 0;
    let total = 0;
    for (const r of rows) {
      total += r.total_contacts;
      delivered += r.delivered_count;
      failed += r.failed_count;
    }
    return { delivered, failed, total };
  }, [rows]);

  return (
    <div className="flex h-full flex-col bg-app">
      <div className="shrink-0 space-y-2 border-b border-app bg-app-elevated p-3">
        <div className={`flex flex-wrap items-end gap-2`}>
          <FilterField label="Target">
            <select
              value={filters.target_type}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  target_type: e.target.value as typeof f.target_type,
                }))
              }
              className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app"
            >
              {TARGETS.map((t) => (
                <option key={t.key || "all"} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: e.target.value as typeof f.status,
                }))
              }
              className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app"
            >
              {STATUSES.map((s) => (
                <option key={s.key || "any"} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="From">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app"
            />
          </FilterField>
          <FilterField label="To">
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app"
            />
          </FilterField>
          <div className="ml-auto">
            <SecondaryButton onClick={refresh} disabled={loading}>
              <MiniIcon name="refresh" /> Refresh
            </SecondaryButton>
          </div>
        </div>
        {!compact && rows.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-[0.65rem] font-mono text-faint">
            <span>Window total: {summary.total}</span>
            <span className="text-emerald-600 dark:text-emerald-300">
              Delivered: {summary.delivered}
            </span>
            <span className="text-rose-600 dark:text-rose-300">
              Failed: {summary.failed}
            </span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-faint">loading…</div>
        ) : error ? (
          <div className="p-3">
            <ErrorBlock body={error} onRetry={refresh} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            kicker="whatsapp.history"
            compact={compact}
            title="No sends in this window"
            body={
              <span>
                Send your first WhatsApp message from any tab, then return here
                to see the delivery breakdown.
              </span>
            }
          />
        ) : compact ? (
          <ul role="list" className="divide-y divide-app">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDrawer(r)}
                  className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-surface"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-app">
                      {r.target_name ?? formatPhone(r.target_id)}
                    </span>
                    <Pill tone={STATUS_TONE[r.status]}>
                      {formatStatusIcon(r.status)} {r.status}
                    </Pill>
                  </div>
                  <div className="truncate text-xs text-secondary">
                    {r.message_preview}
                  </div>
                  <div className="flex items-center justify-between text-[0.6rem] text-faint">
                    <span>{formatRelative(r.created_at)}</span>
                    <span>
                      {r.delivered_count}/{r.total_contacts}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-app-elevated text-faint">
              <tr>
                <Th>Sent</Th>
                <Th>Target</Th>
                <Th>Message</Th>
                <Th>Status</Th>
                <Th>Delivered</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setDrawer(r)}
                  className="cursor-pointer border-t border-app hover:bg-surface"
                >
                  <Td>{formatRelative(r.created_at)}</Td>
                  <Td>
                    <div className="font-medium text-app">
                      {r.target_name ?? formatPhone(r.target_id)}
                    </div>
                    <div className="font-mono text-[0.6rem] text-faint">
                      {r.target_type}
                    </div>
                  </Td>
                  <Td>
                    <div className="line-clamp-2 max-w-md text-secondary">
                      {r.message_preview}
                    </div>
                  </Td>
                  <Td>
                    <Pill tone={STATUS_TONE[r.status]}>
                      {formatStatusIcon(r.status)} {r.status}
                    </Pill>
                  </Td>
                  <Td>
                    <span className="font-mono">
                      {r.delivered_count}/{r.total_contacts}
                    </span>
                    {r.failed_count > 0 ? (
                      <span className="ml-1 text-rose-600 dark:text-rose-300">
                        · {r.failed_count} failed
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawer ? (
        <HistoryDrawer
          workspaceId={workspaceId}
          row={drawer}
          onClose={() => setDrawer(null)}
        />
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-mono text-[0.55rem] uppercase tracking-[0.16em] font-normal">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function HistoryDrawer({
  workspaceId,
  row,
  onClose,
}: {
  workspaceId: string;
  row: WaHistoryRow;
  onClose: () => void;
}) {
  const [log, setLog] = useState<WaJobLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetchHistoryDetail(workspaceId, row.id);
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLog(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [row.id, workspaceId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-app">
                {row.target_name ?? formatPhone(row.target_id)}
              </h3>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-secondary">
                <Pill tone={STATUS_TONE[row.status]}>{row.status}</Pill>
                <span>{formatRelative(row.created_at)}</span>
                <span>
                  {row.delivered_count}/{row.total_contacts} delivered
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-secondary hover:bg-surface"
              aria-label="Close"
            >
              <MiniIcon name="close" />
            </button>
          </div>
          {row.full_message ? (
            <div className="mt-3 max-h-32 overflow-y-auto rounded-md border border-app bg-surface p-2 text-sm text-app">
              <pre className="whitespace-pre-wrap break-words font-sans">
                {row.full_message}
              </pre>
            </div>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h4 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            Per-contact delivery
          </h4>
          {loading ? (
            <div className="text-xs text-faint">loading…</div>
          ) : error ? (
            <ErrorBlock body={error} />
          ) : log === null || log.length === 0 ? (
            <div className="text-xs text-faint">
              {row.target_type === "contact"
                ? "Single send — no per-contact breakdown."
                : "No per-contact log available."}
            </div>
          ) : (
            <ul role="list" className="divide-y divide-app">
              {log.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-app">
                      {entry.contact_name ?? "—"}
                    </div>
                    <div className="truncate font-mono text-[0.65rem] text-faint">
                      {formatPhone(entry.contact_phone)}
                    </div>
                    {entry.error_message ? (
                      <div className="mt-0.5 text-[0.65rem] text-rose-600 dark:text-rose-300">
                        {entry.error_message}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right text-[0.65rem]">
                    <Pill
                      tone={
                        entry.status === "failed"
                          ? "danger"
                          : entry.status === "delivered" || entry.status === "read"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {entry.status}
                    </Pill>
                    <div className="mt-1 text-faint">{formatRelative(entry.sent_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
