import type { WebhookDeliveryStatus } from "../../_types";

const LABEL: Record<WebhookDeliveryStatus, string> = {
  pending: "Pending",
  success: "Success",
  timeout: "Timeout",
  network_error: "Network",
  non_2xx: "Non-2xx",
  signing_skipped: "Unsigned",
  retry_scheduled: "Retrying",
  exhausted: "Exhausted",
};

const CLS: Record<WebhookDeliveryStatus, string> = {
  pending: "bg-app-elevated text-secondary border border-app",
  success: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  network_error: "bg-rose-500/15 text-rose-500",
  non_2xx: "bg-rose-500/15 text-rose-500",
  signing_skipped: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  retry_scheduled: "bg-tool-accent-soft text-tool-accent",
  exhausted: "bg-rose-500/15 text-rose-500",
};

export function DeliveryStatusChip({
  status,
}: {
  status: WebhookDeliveryStatus | string | null | undefined;
}) {
  const key = (status ?? "pending") as WebhookDeliveryStatus;
  const cls = CLS[key] ?? CLS.pending;
  const label = LABEL[key] ?? String(status ?? "—");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

export function EnabledChip({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        enabled
          ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400"
          : "bg-app-elevated text-secondary border border-app"
      }`}
    >
      {enabled ? "On" : "Off"}
    </span>
  );
}

export function EventChips({
  events,
  max,
}: {
  events: string[];
  max?: number;
}) {
  const list = events ?? [];
  const cap = max ?? 6;
  const shown = list.slice(0, cap);
  const overflow = list.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((e) => (
        <span
          key={e}
          className="inline-flex items-center rounded-md bg-app-elevated px-1.5 py-0.5 font-mono text-[10px] text-secondary border border-app"
        >
          {e}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex items-center rounded-md bg-app-elevated px-1.5 py-0.5 font-mono text-[10px] text-faint border border-app">
          +{overflow}
        </span>
      ) : null}
      {list.length === 0 ? (
        <span className="text-[10px] text-faint">none</span>
      ) : null}
    </div>
  );
}
