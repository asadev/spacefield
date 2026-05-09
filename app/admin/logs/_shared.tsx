import Link from "next/link";

export const PER_PAGE = 50;

export type LogTab = "webhooks" | "agent_runs" | "credits" | "approvals";

export const TABS: ReadonlyArray<{ id: LogTab; label: string }> = [
  { id: "webhooks", label: "Webhook deliveries" },
  { id: "agent_runs", label: "Agent runs" },
  { id: "credits", label: "Credit events" },
  { id: "approvals", label: "Approval queue" },
];

export function isLogTab(v: unknown): v is LogTab {
  return v === "webhooks" || v === "agent_runs" || v === "credits" || v === "approvals";
}

/**
 * Parse a yyyy-mm-dd query value into an ISO timestamp covering that
 * day. `from` snaps to start-of-day, `to` to end-of-day. Returns null
 * when the value isn't a valid date string.
 */
export function parseDateBoundary(
  value: string | undefined,
  edge: "from" | "to"
): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${edge === "from" ? "00:00:00.000Z" : "23:59:59.999Z"}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* ──────────────────── pagination ──────────────────── */

/**
 * Build a query string preserving every existing filter, optionally
 * overriding individual keys. Pass `null` for a value to remove the key.
 */
export function buildQuery(
  base: Record<string, string | undefined>,
  overrides: Record<string, string | number | null | undefined> = {}
): string {
  const merged: Record<string, string | undefined> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = String(v);
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function Pagination({
  page,
  total,
  perPage,
  baseParams,
}: {
  page: number;
  total: number;
  perPage: number;
  baseParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const prev = page <= 1;
  const next = page >= totalPages;
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors";
  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {prev ? (
        <span className={`${cls} pointer-events-none opacity-40 text-faint`}>
          ← Prev
        </span>
      ) : (
        <Link
          href={`/admin/logs${buildQuery(baseParams, { page: page - 1 })}`}
          className={`${cls} bg-app-elevated text-app hover:border-tool-accent`}
        >
          ← Prev
        </Link>
      )}
      <span className="font-mono tabular-nums text-muted">
        {page} / {totalPages}
        <span className="ml-2 text-faint">·</span>
        <span className="ml-2 text-faint">{total.toLocaleString()} rows</span>
      </span>
      {next ? (
        <span className={`${cls} pointer-events-none opacity-40 text-faint`}>
          Next →
        </span>
      ) : (
        <Link
          href={`/admin/logs${buildQuery(baseParams, { page: page + 1 })}`}
          className={`${cls} bg-app-elevated text-app hover:border-tool-accent`}
        >
          Next →
        </Link>
      )}
    </div>
  );
}

/* ──────────────────── status chips ──────────────────── */

export function WebhookStatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
    timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    network_error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    non_2xx: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    signing_skipped:
      "bg-app-elevated text-secondary border border-app",
    unknown: "bg-app-elevated text-secondary border border-app",
  };
  const cls = map[status] ?? "bg-app-elevated text-secondary border border-app";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

export function AgentRunStatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
    error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    denied: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  const cls = map[status] ?? "bg-app-elevated text-secondary border border-app";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

export function NeutralChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary">
      {children}
    </span>
  );
}

/* ──────────────────── small helpers ──────────────────── */

export function shortId(id: string | null | undefined, take = 8): string {
  if (!id) return "—";
  return id.length > take ? `${id.slice(0, take)}…` : id;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}
