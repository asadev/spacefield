"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Lightweight UI primitives shared across Phase 2A surfaces:
 *   - Icon (same path family as Shell.tsx)
 *   - Toast / ToastHost
 *   - Modal / SlideOver shells
 *   - Field input wrappers used by quick-add forms
 *
 * Foundation tokens only (`bg-app`, `border-app`, `text-secondary`, etc.).
 * No emojis; SVG icons only.
 * ───────────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// ── Icons ───────────────────────────────────────────────────────────────

const ICON_PATHS: Record<string, string> = {
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z",
  close: "M6.4 4.95L4.95 6.4 10.6 12l-5.65 5.6 1.45 1.45L12 13.4l5.6 5.65 1.45-1.45L13.4 12l5.65-5.6L17.6 4.95 12 10.6 6.4 4.95z",
  search: "M10 2a8 8 0 105.3 14L21 21.6l1.4-1.4-5.6-5.6A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z",
  filter: "M3 4h18v2l-7 7v6l-4 2v-8L3 6V4z",
  more: "M6 12a2 2 0 100 4 2 2 0 000-4zm6 0a2 2 0 100 4 2 2 0 000-4zm6 0a2 2 0 100 4 2 2 0 000-4z",
  chevronDown: "M7 10l5 5 5-5H7z",
  chevronUp: "M7 14l5-5 5 5H7z",
  chevronLeft: "M15 6l-6 6 6 6 1.4-1.4L11.8 12l4.6-4.6L15 6z",
  chevronRight: "M9 6l6 6-6 6-1.4-1.4L12.2 12 7.6 7.4 9 6z",
  user: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  alert: "M12 2L1 21h22L12 2zm0 4l8 14H4l8-14zm-1 5v5h2v-5h-2zm0 6v2h2v-2h-2z",
  check: "M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4L9 16.2z",
  briefcase: "M10 2h4a2 2 0 012 2v2h4a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h4V4a2 2 0 012-2zm0 4h4V4h-4v2zM4 8v4h16V8H4zm0 6v5h16v-5h-6v2h-4v-2H4z",
  building: "M5 3h14v18H5V3zm2 2v3h3V5H7zm5 0v3h3V5h-3zm5 0v3h2V5h-2zM7 10v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2zM7 15v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2z",
  dollar: "M12 2v2H8v4h6v3H6v6h6v3h2v-3h4v-6h-6v-3h6V4h-6V2h-2z",
  calendar: "M19 4h-2V2h-2v2H9V2H7v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z",
  drag: "M9 4h2v2H9V4zm4 0h2v2h-2V4zM9 9h2v2H9V9zm4 0h2v2h-2V9zM9 14h2v2H9v-2zm4 0h2v2h-2v-2zM9 19h2v2H9v-2zm4 0h2v2h-2v-2z",
  trash: "M9 3v1H4v2h16V4h-5V3H9zM6 8v12a2 2 0 002 2h8a2 2 0 002-2V8H6zm2 2h2v10H8V10zm4 0h2v10h-2V10z",
  edit: "M14.06 4.94l3.18-3.18a1 1 0 011.42 0l1.58 1.58a1 1 0 010 1.42l-3.18 3.18-3-3zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z",
  gear: "M19.4 13a7.6 7.6 0 000-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-1.7-1L15 3h-4l-.3 2.6a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 000 2L4.6 14.6l2 3.4 2.4-1a7.6 7.6 0 001.7 1L11 21h4l.3-2.6a7.6 7.6 0 001.7-1l2.4 1 2-3.4-2-1.6zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z",
  list: "M4 6h2v2H4V6zm4 0h12v2H8V6zM4 11h2v2H4v-2zm4 0h12v2H8v-2zm-4 5h2v2H4v-2zm4 0h12v2H8v-2z",
  kanban: "M3 4h18v2H3V4zm1 4h4v12H4V8zm6 0h4v8h-4V8zm6 0h4v10h-4V8z",
  funnel: "M3 4h18l-7 9v7l-4-2v-5L3 4zm3.1 2l5 6.5v5l2 1v-6l5-6.5H6.1z",
  arrowsUpDown: "M7 4l-4 4h3v12h2V8h3L7 4zm10 16l4-4h-3V4h-2v12h-3l4 4z",
  paperclip: "M16.5 6.5L8 15a3 3 0 104.2 4.2l8.4-8.4a5 5 0 10-7.1-7.1L4.6 12.6 6 14l8.9-8.9a3 3 0 014.2 4.2L10.7 17.7a1 1 0 01-1.4-1.4L17.9 7.9 16.5 6.5z",
};

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const path = ICON_PATHS[name] ?? ICON_PATHS.more;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────

export interface ToastMsg {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

interface ToastCtxValue {
  push: (kind: ToastMsg["kind"], text: string) => void;
}

const ToastCtx = createContext<ToastCtxValue | null>(null);

export function useToast(): ToastCtxValue {
  const v = useContext(ToastCtx);
  if (v) return v;
  // Fallback noop so components can be rendered outside the provider in tests.
  return { push: () => {} };
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: ToastMsg["kind"], text: string) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-red-500/40 bg-app-elevated text-red-400"
                : t.kind === "success"
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-app-elevated text-app"
            }`}
          >
            <Icon
              name={t.kind === "error" ? "alert" : t.kind === "success" ? "check" : "more"}
              size={14}
            />
            <span className="max-w-[320px] truncate">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-label={title}
        className="relative z-10 w-full overflow-hidden rounded-xl border border-app bg-app-elevated shadow-2xl"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-app px-4 py-3">
          <h3 className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-app">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-surface hover:text-app"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ── SlideOver ────────────────────────────────────────────────────────────

export function SlideOver({
  open,
  onClose,
  children,
  width = 520,
  fullScreen = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  fullScreen?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 bg-black/40"
      />
      <aside
        role="dialog"
        className="flex h-full flex-col border-l border-app bg-app-elevated shadow-2xl"
        style={{ width: fullScreen ? "100%" : width }}
      >
        {children}
      </aside>
    </div>
  );
}

// ── Form fields ──────────────────────────────────────────────────────────

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-md border border-app bg-app px-2.5 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${className}`}
    />
  );
}

export function NumberInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const { className = "", ...rest } = props;
  return (
    <input
      type="number"
      {...rest}
      className={`w-full rounded-md border border-app bg-app px-2.5 py-1.5 font-mono text-sm tabular-nums text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${className}`}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
  const { className = "", children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-md border border-app bg-app px-2.5 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none ${className}`}
    >
      {children}
    </select>
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-md border border-app bg-app px-2.5 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${className}`}
    />
  );
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  type = "button",
  className = "",
  ...rest
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeCls =
    size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  let variantCls = "";
  if (variant === "primary") {
    variantCls =
      "bg-tool-accent hover:opacity-90 font-semibold";
  } else if (variant === "danger") {
    variantCls =
      "border border-red-500/50 text-red-400 hover:bg-red-500/10";
  } else if (variant === "ghost") {
    variantCls = "text-secondary hover:bg-surface hover:text-app";
  } else {
    variantCls =
      "border border-app bg-app-elevated text-app hover:bg-surface";
  }
  const style: React.CSSProperties =
    variant === "primary" ? { color: "var(--bg)" } : {};
  return (
    <button
      type={type}
      style={style}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md transition-colors ${sizeCls} ${variantCls} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Avatar / chip ────────────────────────────────────────────────────────

export function Avatar({
  label,
  size = 22,
  title,
}: {
  label: string;
  size?: number;
  title?: string;
}) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return (
    <span
      title={title ?? label}
      className="inline-flex items-center justify-center rounded-full border border-app bg-surface font-mono text-[0.55rem] font-semibold text-secondary"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export function StagePill({
  name,
  color,
  kind,
}: {
  name: string;
  color: string | null;
  kind: "open" | "won" | "lost";
}) {
  const fallback =
    kind === "won"
      ? "var(--tool-accent)"
      : kind === "lost"
      ? "rgb(239 68 68)"
      : "var(--text-secondary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app px-2 py-0.5 text-xs"
      style={{ color: color ?? fallback }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color ?? fallback }}
        aria-hidden="true"
      />
      {name}
    </span>
  );
}
