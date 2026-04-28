"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Board cell editors.
 * One editor per BoardFieldType. Each saves on blur or Enter and calls
 * `onCommit(value)` with the next cell value, or `onCancel()` to roll
 * back. The status editor also supports inline option label/color edits
 * via `onColumnConfigChange` — Monday's killer feature.
 *
 * All editors are uncontrolled inside an absolutely-positioned popover
 * over the cell; the parent table renders them when a cell becomes
 * `editing`. Keyboard: Enter commits, Escape cancels, Tab commits + moves.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import type {
  BoardColumnConfigStatus,
  BoardColumnConfigDropdown,
  BoardColumnConfigCurrency,
  BoardColumnConfigPercent,
  BoardColumnConfigRating,
  BoardStatusOption,
  CrmBoardColumn,
} from "../_boards/types";

interface BaseProps<T> {
  value: T;
  onCommit: (next: T) => void;
  onCancel: () => void;
}

// ─── text / longtext / link / email / phone ────────────────────────────

export function TextEditor({
  value,
  onCommit,
  onCancel,
  multiline = false,
  type = "text",
}: BaseProps<string> & {
  multiline?: boolean;
  type?: "text" | "email" | "tel" | "url";
}) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [v, setV] = useState<string>(value ?? "");

  useEffect(() => {
    ref.current?.focus();
    if (ref.current && "select" in ref.current) ref.current.select();
  }, []);

  const commit = (): void => {
    if (v === value) onCancel();
    else onCommit(v);
  };

  const onKey = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && multiline) {
      e.preventDefault();
      commit();
    }
  };

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        rows={3}
        className="w-full rounded border border-tool-accent bg-app px-2 py-1 text-sm text-app focus:outline-none"
      />
    );
  }
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type={type}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      className="w-full rounded border border-tool-accent bg-app px-2 py-1 text-sm text-app focus:outline-none"
    />
  );
}

// ─── number / currency / percent ───────────────────────────────────────

export function NumberEditor({
  value,
  onCommit,
  onCancel,
}: BaseProps<number | null>) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [v, setV] = useState<string>(
    value === null || value === undefined ? "" : String(value)
  );

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = (): void => {
    const trimmed = v.trim();
    if (trimmed === "") {
      if (value === null) onCancel();
      else onCommit(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      onCancel();
      return;
    }
    if (n === value) onCancel();
    else onCommit(n);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className="w-full rounded border border-tool-accent bg-app px-2 py-1 text-right text-sm text-app focus:outline-none"
    />
  );
}

// ─── date ──────────────────────────────────────────────────────────────

export function DateEditor({
  value,
  onCommit,
  onCancel,
}: BaseProps<string | null>) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [v, setV] = useState<string>(value ?? "");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const commit = (): void => {
    const trimmed = v.trim();
    if (trimmed === "") {
      if (value === null) onCancel();
      else onCommit(null);
      return;
    }
    if (trimmed === value) onCancel();
    else onCommit(trimmed);
  };

  return (
    <input
      ref={ref}
      type="date"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className="w-full rounded border border-tool-accent bg-app px-2 py-1 text-sm text-app focus:outline-none"
    />
  );
}

// ─── checkbox ──────────────────────────────────────────────────────────

export function CheckboxEditor({
  value,
  onCommit,
}: BaseProps<boolean>) {
  return (
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onCommit(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-[var(--tool-accent)]"
    />
  );
}

// ─── status (popover with editable labels + colors) ────────────────────

interface StatusEditorProps extends BaseProps<string | null> {
  options: BoardStatusOption[];
  onColumnConfigChange?: (next: BoardColumnConfigStatus) => void;
  anchorRect: DOMRect;
}

const PALETTE = [
  "#6b7280",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
];

export function StatusEditor({
  value,
  options,
  onCommit,
  onCancel,
  onColumnConfigChange,
  anchorRect,
}: StatusEditorProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [onCancel]);

  const updateOption = (i: number, patch: Partial<BoardStatusOption>): void => {
    if (!onColumnConfigChange) return;
    const next = options.map((o, idx) => (idx === i ? { ...o, ...patch } : o));
    onColumnConfigChange({ options: next });
  };

  return (
    <div
      ref={popRef}
      className="fixed z-50 w-[260px] rounded-lg border border-app bg-app-elevated p-2 shadow-xl"
      style={{
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
      }}
    >
      <div className="mb-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        Status
      </div>
      <ul className="max-h-[260px] overflow-y-auto">
        {options.map((opt, i) => {
          const isCurrent = value === opt.value;
          const isEditing = editingIdx === i;
          return (
            <li
              key={opt.value}
              className={`flex items-center gap-2 rounded-md px-1 py-1 ${
                isCurrent ? "bg-surface" : "hover:bg-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => onCommit(opt.value)}
                className="flex-1 rounded px-2 py-1 text-left"
                style={{
                  backgroundColor: opt.color,
                  color: "#fff",
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={opt.label}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateOption(i, { label: e.target.value })}
                    onBlur={() => setEditingIdx(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setEditingIdx(null);
                      }
                    }}
                    className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-white/60"
                    style={{ color: "#fff" }}
                  />
                ) : (
                  <span className="text-sm font-medium">{opt.label}</span>
                )}
              </button>
              {onColumnConfigChange && (
                <>
                  <button
                    type="button"
                    aria-label="Rename"
                    onClick={() => setEditingIdx(i)}
                    className="rounded px-1 py-1 text-xs text-secondary hover:bg-surface"
                  >
                    rename
                  </button>
                  <ColorSwatch
                    color={opt.color}
                    onPick={(c) => updateOption(i, { color: c })}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      {value !== null && value !== undefined && (
        <button
          type="button"
          onClick={() => onCommit(null)}
          className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-secondary hover:bg-surface"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function ColorSwatch({
  color,
  onPick,
}: {
  color: string;
  onPick: (next: string) => void;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Pick color"
        onClick={() => setOpen((v) => !v)}
        className="h-5 w-5 rounded-full border border-app"
        style={{ backgroundColor: color }}
      />
      {open && (
        <div className="absolute right-0 z-50 mt-1 grid grid-cols-4 gap-1 rounded-md border border-app bg-app-elevated p-2 shadow-lg">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="h-5 w-5 rounded-full border border-app"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── dropdown / multiselect ───────────────────────────────────────────

interface DropdownEditorProps extends BaseProps<string | null> {
  options: { value: string; label: string }[];
  anchorRect: DOMRect;
}

export function DropdownEditor({
  value,
  options,
  onCommit,
  onCancel,
  anchorRect,
}: DropdownEditorProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [onCancel]);
  return (
    <div
      ref={popRef}
      className="fixed z-50 w-[220px] rounded-lg border border-app bg-app-elevated p-1 shadow-xl"
      style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onCommit(opt.value)}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
              active
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-app hover:bg-surface"
            }`}
          >
            <span>{opt.label}</span>
            {active && <span aria-hidden>✓</span>}
          </button>
        );
      })}
      {value !== null && value !== undefined && (
        <button
          type="button"
          onClick={() => onCommit(null)}
          className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-secondary hover:bg-surface"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ─── rating ─────────────────────────────────────────────────────────────

export function RatingEditor({
  value,
  max = 5,
  onCommit,
}: BaseProps<number | null> & { max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const filled = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} of ${max}`}
            onClick={() => onCommit(value === n ? null : n)}
            className="text-base leading-none"
            style={{
              color: filled
                ? "var(--tool-accent)"
                : "var(--text-faint)",
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

// ─── display formatters (read-only mode) ───────────────────────────────

export function formatCellDisplay(
  value: unknown,
  column: CrmBoardColumn
): string {
  if (value === null || value === undefined || value === "") return "";
  switch (column.field_type) {
    case "currency": {
      const cfg = column.config as BoardColumnConfigCurrency;
      const code = cfg.code ?? "USD";
      const decimals = cfg.decimals ?? 2;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "";
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: code,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(n);
      } catch {
        return `${code} ${n.toFixed(decimals)}`;
      }
    }
    case "percent": {
      const cfg = column.config as BoardColumnConfigPercent;
      const decimals = cfg.decimals ?? 0;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "";
      return `${n.toFixed(decimals)}%`;
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "";
      return new Intl.NumberFormat().format(n);
    }
    case "rating": {
      const cfg = column.config as BoardColumnConfigRating;
      const max = cfg.max ?? 5;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "";
      return `${n}/${max}`;
    }
    case "checkbox":
      return value ? "✓" : "";
    case "date":
      return String(value);
    case "datetime": {
      try {
        return new Date(String(value)).toLocaleString();
      } catch {
        return String(value);
      }
    }
    case "status":
    case "dropdown": {
      const opts =
        (column.config as BoardColumnConfigStatus | BoardColumnConfigDropdown)
          .options ?? [];
      const found = opts.find((o) => o.value === value);
      return found ? found.label : String(value);
    }
    default:
      return String(value);
  }
}
