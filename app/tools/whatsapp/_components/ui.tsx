"use client";

/* Shared mini-UI for WhatsApp tabs — kept inline so each tab stays
 * self-contained without dragging in product-wide design primitives. */

import type { ReactNode } from "react";

export const ICONS: Record<string, string> = {
  // Connection / status
  check:
    "M9 16.2L4.8 12l-1.4 1.4L9 19l11-11-1.4-1.4L9 16.2z",
  refresh:
    "M12 4a8 8 0 017.6 5.5H17v2h6V5h-2v3.3A10 10 0 002 12h2a8 8 0 018-8zm0 16a8 8 0 01-7.6-5.5H7v-2H1v6.5h2v-3.3A10 10 0 0022 12h-2a8 8 0 01-8 8z",
  warning:
    "M12 2L1 21h22L12 2zm0 4l8.5 14.5h-17L12 6zm-1 5v5h2v-5h-2zm0 6v2h2v-2h-2z",
  qr: "M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z",
  // Messages
  send: "M2 12l20-9-9 20-2-8-9-3z",
  paperclip:
    "M16.5 6L9 13.5a3.5 3.5 0 005 5L19 13l1.5 1.5-5 5a5.5 5.5 0 11-8-8L15 4l1.5 2z",
  emoji:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-3 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-7.5 5.5a5.5 5.5 0 009 0L17.5 17a4.5 4.5 0 01-6 0H7.5z",
  // Lists / groups
  list: "M4 6h2v2H4V6zm4 0h12v2H8V6zM4 11h2v2H4v-2zm4 0h12v2H8v-2zM4 16h2v2H4v-2zm4 0h12v2H8v-2z",
  users:
    "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z",
  close:
    "M6.4 4.95L4.95 6.4 10.6 12l-5.65 5.6 1.45 1.45L12 13.4l5.6 5.65 1.45-1.45L13.4 12l5.65-5.6L17.6 4.95 12 10.6 6.4 4.95z",
  search:
    "M10 2a8 8 0 105.3 14L21 21.6l1.4-1.4-5.6-5.6A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z",
  // Jobs / history
  pause: "M6 4h4v16H6V4zm8 0h4v16h-4V4z",
  play: "M8 5v14l11-7L8 5z",
  stop: "M6 6h12v12H6V6z",
  trash:
    "M9 3v1H4v2h16V4h-5V3H9zm-3 5l1 13h10l1-13H6zm3 2h2v9H9v-9zm4 0h2v9h-2v-9z",
  inbox:
    "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v9h4a3 3 0 006 0h4V5H5zm0 11v3h14v-3h-4a5 5 0 01-10 0H5z",
};

export function MiniIcon({ name, size = 14 }: { name: string; size?: number }) {
  const path = ICONS[name] ?? ICONS.list;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

type Tone = "neutral" | "success" | "warn" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-app bg-surface text-secondary",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
};

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  kicker,
  title,
  body,
  cta,
  compact,
}: {
  kicker: string;
  title: string;
  body: ReactNode;
  cta?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-app p-6">
      <div
        className="w-full rounded-xl border border-dashed border-app bg-app-elevated p-6 text-center"
        style={{ maxWidth: compact ? "100%" : 480 }}
      >
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          {kicker}
        </div>
        <h3 className="mt-2 text-base font-semibold text-app">{title}</h3>
        <div className="mt-2 text-sm text-secondary">{body}</div>
        {cta ? <div className="mt-4">{cta}</div> : null}
      </div>
    </div>
  );
}

export function ErrorBlock({
  title = "Something went wrong",
  body,
  onRetry,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
      <div className="flex items-center gap-2">
        <MiniIcon name="warning" />
        <span className="font-medium">{title}</span>
      </div>
      <p className="mt-1 break-words text-xs opacity-80">{body}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1 rounded border border-rose-500/40 bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
        >
          <MiniIcon name="refresh" /> Retry
        </button>
      ) : null}
    </div>
  );
}

export function PrimaryButton({
  type = "button",
  onClick,
  disabled,
  children,
  loading,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent transition-colors enabled:hover:bg-tool-accent enabled:hover:text-app-elevated disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "…" : children}
    </button>
  );
}

export function SecondaryButton({
  type = "button",
  onClick,
  disabled,
  children,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-app bg-surface px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors enabled:hover:bg-app-elevated enabled:hover:text-app disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function DangerButton({
  type = "button",
  onClick,
  disabled,
  children,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-rose-700 transition-colors enabled:hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
    >
      {children}
    </button>
  );
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "Unknown";
  const cleaned = String(phone).replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length > 4) return `+${cleaned}`;
  return cleaned;
}

export function formatStatusIcon(
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "mixed"
): string {
  switch (status) {
    case "queued":
      return "…";
    case "sent":
      return "✓";
    case "delivered":
      return "✓✓";
    case "read":
      return "✓✓"; // colored blue via classes at the call site
    case "failed":
      return "✗";
    case "mixed":
      return "·";
    default:
      return "?";
  }
}

/** Estimate how long sending to N contacts will take given a per-hour cap.
 * Falls back to 50/hr when cap is unknown. Returns a human string. */
export function estimateSendDuration(count: number, hourlyCap?: number | null): string {
  if (count <= 0) return "—";
  const cap = hourlyCap && hourlyCap > 0 ? hourlyCap : 50;
  const hours = count / cap;
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} min`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}
