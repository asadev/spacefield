"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Sheets — Native Desktop Workspace App (pro-tier)
   ───────────────────────────────────────────────────────────────────────────
   Excel-style spreadsheet editor backed by Univer (Apache-2). Round-trips
   real .xlsx files through SheetJS into the workspace's Files Manager:

     POST /api/files/save-content   → create/update an .xlsx file
     GET  /api/files/load-content   → fetch a file's contents (base64)

   The shell here renders a slim secondary toolbar above Univer's own
   ribbon — number formats, sort/filter, freeze, conditional formatting,
   find & replace, and chart insert. All Univer interactions are routed
   through `EditorAPI` from `_editor.tsx` so this file never imports
   the heavy editor chunk directly.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase/client";
import type { NativeAppProps } from "../_data/tools-list";
import type {
  EditorAPI,
  ChartSelectionData,
  ChartKind,
  SheetTabInfo,
} from "./_editor";

const ACTIVE_WS_KEY = "workspaces:active:v1";
const WS_LIST_KEY = "workspaces:list:v1";

const SheetsEditor = dynamic(() => import("./_editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-app">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-app border-t-tool-accent" />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-secondary">
          Loading editor…
        </span>
      </div>
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SheetsFileMeta {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
  user_id: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  | { kind: "editing" };

type CsvOptions = {
  delimiter: "auto" | "," | ";" | "tab";
  encoding: "utf-8" | "utf-16le" | "iso-8859-1";
  hasHeader: boolean;
};

type ChartConfig = {
  kind: ChartKind;
  data: ChartSelectionData;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

function fmtRelativeTime(at: number): string {
  const diff = (Date.now() - at) / 1000;
  if (diff < 5) return "just now";
  if (diff < 45) return `${Math.round(diff)}s ago`;
  if (diff < 90) return "a minute ago";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  return `${Math.round(diff / 3600)} hr ago`;
}

function ensureXlsxExtension(name: string): string {
  const trimmed = name.trim() || "Untitled";
  if (/\.(xlsx|xls|csv)$/i.test(trimmed)) return trimmed;
  return `${trimmed}.xlsx`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return typeof window !== "undefined"
    ? window.btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary =
    typeof window !== "undefined"
      ? window.atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function Icon({
  path,
  className,
  viewBox = "0 0 20 20",
}: {
  path: React.ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className ?? "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

const SheetsIcon = ({ className }: { className?: string }) => (
  <Icon
    viewBox="0 0 24 24"
    className={className ?? "h-5 w-5"}
    path={
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </>
    }
  />
);
const CheckIcon = ({ className }: { className?: string }) => (
  <Icon className={className} path={<path d="M4 10l4 4 8-8" />} />
);
const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
    <path d="M17 10a7 7 0 00-7-7" />
  </svg>
);
const DownloadIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <path d="M10 3v10M5 9l5 4 5-4" />
        <path d="M4 16h12" />
      </>
    }
  />
);
const PlusIcon = ({ className }: { className?: string }) => (
  <Icon className={className} path={<path d="M10 4v12M4 10h12" />} />
);
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <Icon className={className} path={<path d="M5 8l5 5 5-5" />} />
);
const SortAscIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <path d="M5 14l3 3 3-3" />
        <path d="M8 4v13" />
        <path d="M13 6h6M13 10h4M13 14h2" />
      </>
    }
  />
);
const SortDescIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <path d="M5 6l3-3 3 3" />
        <path d="M8 3v13" />
        <path d="M13 6h2M13 10h4M13 14h6" />
      </>
    }
  />
);
const FilterIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={<path d="M3 4h14l-5 7v5l-4 2v-7L3 4z" />}
  />
);
const FreezeIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <rect x="3" y="3" width="14" height="14" rx="1" />
        <path d="M3 8h14M8 3v14" />
      </>
    }
  />
);
const ChartIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <path d="M3 17h14" />
        <path d="M5 17V8M9 17V5M13 17v-7M17 17V11" />
      </>
    }
  />
);
const FormatIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <path d="M5 4h10M7 4v12M5 16h6" />
        <path d="M14 14l2 3M16 11h-1.5a1.5 1.5 0 100 3H16" />
      </>
    }
  />
);
const SearchIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <circle cx="9" cy="9" r="5" />
        <path d="M13 13l4 4" />
      </>
    }
  />
);
const KbIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <rect x="2" y="5" width="16" height="11" rx="2" />
        <path d="M5 9h.01M8 9h.01M11 9h.01M14 9h.01M5 13h10" />
      </>
    }
  />
);
const SheetTabIcon = ({ className }: { className?: string }) => (
  <Icon
    className={className}
    path={
      <>
        <path d="M3 6a2 2 0 012-2h4l1 2h7a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
      </>
    }
  />
);

// ---------------------------------------------------------------------------
// Save status pill
// ---------------------------------------------------------------------------

function SaveBadge({ state }: { state: SaveState }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state.kind !== "saved") return;
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [state.kind]);
  void tick;

  let label = "Ready";
  let icon: React.ReactNode = null;
  let cls = "text-secondary";
  if (state.kind === "saving") {
    label = "Saving…";
    icon = <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />;
    cls = "text-tool-accent";
  } else if (state.kind === "saved") {
    label = `Saved · ${fmtRelativeTime(state.at)}`;
    icon = <CheckIcon className="h-3.5 w-3.5" />;
    cls = "text-emerald-500";
  } else if (state.kind === "editing") {
    label = "Editing — autosave paused";
    cls = "text-amber-500";
  } else if (state.kind === "error") {
    label = state.message || "Save failed";
    cls = "text-rose-500";
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toolbar primitives
// ---------------------------------------------------------------------------

function ToolbarButton({
  onClick,
  title,
  children,
  active,
  primary,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  active?: boolean;
  primary?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition";
  if (primary) {
    return (
      <button
        onClick={onClick}
        title={title}
        className={`${base} bg-tool-accent text-white hover:opacity-90`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className={`${base} border border-app ${
        active
          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
          : "bg-app-elevated text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
      {children}
    </span>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-app" />;
}

// ---------------------------------------------------------------------------
// Format menu — number/currency/date
// ---------------------------------------------------------------------------

const NUMBER_FORMATS: Array<{ label: string; pattern: string; hint?: string }> =
  [
    { label: "Automatic", pattern: "General" },
    { label: "Number", pattern: "#,##0.00" },
    { label: "Plain", pattern: "0" },
    { label: "Percent", pattern: "0.00%" },
    { label: "Scientific", pattern: "0.00E+00" },
    { label: "USD", pattern: '"$"#,##0.00', hint: "Currency" },
    { label: "EUR", pattern: '"€"#,##0.00', hint: "Currency" },
    { label: "AED", pattern: '"AED "#,##0.00', hint: "Currency" },
    { label: "GBP", pattern: '"£"#,##0.00', hint: "Currency" },
    { label: "Date — ISO", pattern: "yyyy-mm-dd", hint: "Date" },
    { label: "Date — Long", pattern: 'mmmm d", "yyyy', hint: "Date" },
    { label: "Time", pattern: "h:mm AM/PM", hint: "Time" },
  ];

function FormatMenu({
  open,
  onClose,
  api,
}: {
  open: boolean;
  onClose: () => void;
  api: EditorAPI | null;
}) {
  if (!open) return null;
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-[260px] overflow-hidden rounded-lg border border-app bg-app-elevated shadow-xl">
      <div className="border-b border-app px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary">
          Number format
        </span>
      </div>
      <ul className="max-h-[280px] overflow-auto py-1">
        {NUMBER_FORMATS.map((f) => (
          <li key={f.label}>
            <button
              onClick={() => {
                api?.setNumberFormat(f.pattern);
                onClose();
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-app hover:bg-tool-accent-soft"
            >
              <span>{f.label}</span>
              {f.hint && (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                  {f.hint}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV import dialog
// ---------------------------------------------------------------------------

function CsvImportDialog({
  open,
  defaults,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  defaults: CsvOptions;
  onConfirm: (opts: CsvOptions) => void;
  onCancel: () => void;
}) {
  const [opts, setOpts] = useState<CsvOptions>(defaults);
  useEffect(() => {
    if (open) setOpts(defaults);
  }, [open, defaults]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-app/70 backdrop-blur-sm">
      <div className="w-[360px] rounded-2xl border border-app bg-app-elevated p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-app">Import CSV</h3>
        <p className="mt-1 text-xs text-secondary">
          Confirm how to read this file before opening it.
        </p>
        <div className="mt-4 grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Delimiter
            </span>
            <select
              value={opts.delimiter}
              onChange={(e) =>
                setOpts({
                  ...opts,
                  delimiter: e.target.value as CsvOptions["delimiter"],
                })
              }
              className="rounded-md border border-app bg-app px-2 py-1 text-sm text-app focus:border-tool-accent focus:outline-none"
            >
              <option value="auto">Auto-detect</option>
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value="tab">Tab</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Encoding
            </span>
            <select
              value={opts.encoding}
              onChange={(e) =>
                setOpts({
                  ...opts,
                  encoding: e.target.value as CsvOptions["encoding"],
                })
              }
              className="rounded-md border border-app bg-app px-2 py-1 text-sm text-app focus:border-tool-accent focus:outline-none"
            >
              <option value="utf-8">UTF-8</option>
              <option value="utf-16le">UTF-16 LE</option>
              <option value="iso-8859-1">Latin-1</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-app">
            <input
              type="checkbox"
              checked={opts.hasHeader}
              onChange={(e) =>
                setOpts({ ...opts, hasHeader: e.target.checked })
              }
              className="h-3.5 w-3.5"
            />
            First row is a header
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-app px-3 py-1 text-xs text-secondary hover:text-app"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(opts)}
            className="rounded-md bg-tool-accent px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart overlay — minimal SVG charts (column / bar / line / pie)
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function ChartOverlay({
  config,
  onChangeKind,
  onClose,
}: {
  config: ChartConfig;
  onChangeKind: (kind: ChartKind) => void;
  onClose: () => void;
}) {
  const { kind, data } = config;
  const seriesCount = Math.max(1, data.headers.length - 1);
  const w = 480;
  const h = 260;
  const padL = 36;
  const padR = 16;
  const padT = 28;
  const padB = 40;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const allValues = data.rows.flatMap((r) => r.values);
  const max = allValues.length ? Math.max(...allValues, 0) : 1;
  const min = allValues.length ? Math.min(...allValues, 0) : 0;
  const range = max - min || 1;

  const renderColumn = () => {
    const groupCount = data.rows.length || 1;
    const groupW = innerW / groupCount;
    const barW = (groupW * 0.7) / seriesCount;
    return (
      <>
        {data.rows.map((row, i) => (
          <g key={i}>
            {row.values.map((v, s) => {
              const x =
                padL + i * groupW + groupW * 0.15 + s * barW;
              const yTop = padT + ((max - v) / range) * innerH;
              const yBase = padT + ((max - 0) / range) * innerH;
              const barH = Math.abs(yBase - yTop);
              return (
                <rect
                  key={s}
                  x={x}
                  y={Math.min(yTop, yBase)}
                  width={barW * 0.92}
                  height={barH || 1}
                  fill={CHART_COLORS[s % CHART_COLORS.length]}
                  rx={1}
                />
              );
            })}
            <text
              x={padL + i * groupW + groupW / 2}
              y={h - padB + 14}
              textAnchor="middle"
              className="fill-current text-[10px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {row.label}
            </text>
          </g>
        ))}
      </>
    );
  };

  const renderBar = () => {
    const groupCount = data.rows.length || 1;
    const groupH = innerH / groupCount;
    const barH = (groupH * 0.7) / seriesCount;
    const xZero = padL + ((0 - min) / range) * innerW;
    return (
      <>
        {data.rows.map((row, i) => (
          <g key={i}>
            {row.values.map((v, s) => {
              const y = padT + i * groupH + groupH * 0.15 + s * barH;
              const xEnd = padL + ((v - min) / range) * innerW;
              const x = Math.min(xEnd, xZero);
              const w = Math.abs(xEnd - xZero);
              return (
                <rect
                  key={s}
                  x={x}
                  y={y}
                  width={w || 1}
                  height={barH * 0.92}
                  fill={CHART_COLORS[s % CHART_COLORS.length]}
                  rx={1}
                />
              );
            })}
            <text
              x={padL - 6}
              y={padT + i * groupH + groupH / 2 + 3}
              textAnchor="end"
              className="text-[10px]"
              fill="currentColor"
            >
              {row.label}
            </text>
          </g>
        ))}
      </>
    );
  };

  const renderLine = () => {
    const cols = data.rows.length || 1;
    const stepX = innerW / Math.max(1, cols - 1);
    return (
      <>
        {Array.from({ length: seriesCount }).map((_, s) => {
          const points = data.rows
            .map((r, i) => {
              const v = r.values[s] ?? 0;
              const x = padL + i * stepX;
              const y = padT + ((max - v) / range) * innerH;
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polyline
              key={s}
              points={points}
              fill="none"
              stroke={CHART_COLORS[s % CHART_COLORS.length]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {data.rows.map((row, i) => (
          <text
            key={i}
            x={padL + i * stepX}
            y={h - padB + 14}
            textAnchor="middle"
            className="text-[10px]"
            fill="currentColor"
          >
            {row.label}
          </text>
        ))}
      </>
    );
  };

  const renderPie = () => {
    const totals = data.rows.map(
      (r) => r.values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
    );
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(innerH, innerW) / 2 - 10;
    let acc = -Math.PI / 2;
    return (
      <>
        {totals.map((t, i) => {
          const angle = (t / sum) * Math.PI * 2;
          const x1 = cx + radius * Math.cos(acc);
          const y1 = cy + radius * Math.sin(acc);
          const x2 = cx + radius * Math.cos(acc + angle);
          const y2 = cy + radius * Math.sin(acc + angle);
          const largeArc = angle > Math.PI ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          acc += angle;
          return (
            <path
              key={i}
              d={path}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              stroke="var(--bg-elevated)"
              strokeWidth={1}
            />
          );
        })}
      </>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute right-4 top-[120px] z-30 w-[520px] overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-app px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary">
          Chart · {data.range}
        </span>
        <div className="flex items-center gap-1">
          {(["column", "bar", "line", "pie"] as ChartKind[]).map((k) => (
            <button
              key={k}
              onClick={() => onChangeKind(k)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                k === kind
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:text-app"
              }`}
            >
              {k}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-2 rounded-md px-2 py-0.5 text-[11px] text-muted hover:text-app"
          >
            Close
          </button>
        </div>
      </div>
      <div className="bg-app p-2 text-app">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={h - padB}
            stroke="currentColor"
            strokeOpacity="0.2"
          />
          <line
            x1={padL}
            y1={h - padB}
            x2={w - padR}
            y2={h - padB}
            stroke="currentColor"
            strokeOpacity="0.2"
          />
          {kind === "column" && renderColumn()}
          {kind === "bar" && renderBar()}
          {kind === "line" && renderLine()}
          {kind === "pie" && renderPie()}
        </svg>
        <div className="flex flex-wrap items-center gap-3 px-2 py-2 text-[10px] text-secondary">
          {data.headers.slice(1).map((h, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{
                  background: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              {h || `Series ${i + 1}`}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts cheatsheet
// ---------------------------------------------------------------------------

const SHORTCUTS: Array<{ section: string; rows: Array<[string, string]> }> = [
  {
    section: "File",
    rows: [
      ["Cmd/Ctrl + S", "Save to workspace"],
      ["Cmd/Ctrl + /", "Open this cheatsheet"],
    ],
  },
  {
    section: "Editing",
    rows: [
      ["Cmd/Ctrl + Z", "Undo"],
      ["Cmd/Ctrl + Shift + Z", "Redo"],
      ["Cmd/Ctrl + C / V / X", "Copy / paste / cut"],
      ["Cmd/Ctrl + B / I / U", "Bold / italic / underline"],
      ["Delete / Backspace", "Clear cell"],
    ],
  },
  {
    section: "Navigation",
    rows: [
      ["Arrows", "Move active cell"],
      ["Tab / Shift+Tab", "Next / previous column"],
      ["Enter / Shift+Enter", "Next / previous row"],
      ["Cmd/Ctrl + Arrow", "Jump to edge"],
    ],
  },
  {
    section: "View",
    rows: [
      ["Cmd/Ctrl + F", "Find"],
      ["Cmd/Ctrl + H", "Find & replace"],
      ["Esc", "Close panels"],
    ],
  },
];

function ShortcutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-app/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-[92vw] overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary">
            Keyboard shortcuts
          </span>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-0.5 text-[11px] text-muted hover:text-app"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4">
          {SHORTCUTS.map((sec) => (
            <section key={sec.section}>
              <h4 className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-tool-accent">
                {sec.section}
              </h4>
              <ul className="grid gap-1">
                {sec.rows.map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-2 text-[12px]">
                    <kbd className="rounded border border-app bg-app px-1.5 py-0.5 font-mono text-[10px] text-app">
                      {k}
                    </kbd>
                    <span className="flex-1 text-right text-secondary">{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

export default function SheetsApp({
  width,
  height,
  initialParams,
  initialParamsKey,
  resolved,
}: NativeAppProps) {
  const supabase = useMemo(() => getSupabase(), []);

  // --- workspace ---------------------------------------------------------
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("Workspace");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(ACTIVE_WS_KEY);
      setActiveId(v && v.length > 0 ? v : null);
      const listRaw = window.localStorage.getItem(WS_LIST_KEY);
      if (listRaw && v) {
        const list = JSON.parse(listRaw) as Array<{ id: string; name: string }>;
        const match = list.find((w) => w.id === v);
        if (match) setActiveName(match.name);
      }
    } catch {
      setActiveId(null);
    }
  }, []);

  // --- file state -------------------------------------------------------
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("Untitled.xlsx");
  const [initialBuffer, setInitialBuffer] = useState<ArrayBuffer | null>(null);
  const [initialFormat, setInitialFormat] = useState<"xlsx" | "csv" | null>(
    null
  );
  const [csvOptions, setCsvOptions] = useState<CsvOptions | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [tabs, setTabs] = useState<SheetTabInfo[]>([]);

  // --- CSV import dialog -----------------------------------------------
  const [pendingCsv, setPendingCsv] = useState<{
    file: SheetsFileMeta;
    buffer: ArrayBuffer;
    defaults: CsvOptions;
  } | null>(null);

  // --- editor refs ------------------------------------------------------
  const apiRef = useRef<EditorAPI | null>(null);
  const isEditingRef = useRef(false);
  const dirtyRef = useRef(false);

  // --- known files for "Open" -------------------------------------------
  const [pickerFiles, setPickerFiles] = useState<SheetsFileMeta[] | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);

  const loadPickerFiles = useCallback(async () => {
    if (!activeId) return;
    setPickerLoading(true);
    try {
      const { data, error } = await supabase
        .from("workspace_files")
        .select("id, name, size_bytes, content_type, created_at, user_id")
        .eq("workspace_id", activeId)
        .order("created_at", { ascending: false });
      if (error) {
        setPickerFiles([]);
      } else {
        const all = (data as SheetsFileMeta[] | null) ?? [];
        const filtered = all.filter((f) => {
          const n = f.name.toLowerCase();
          const ct = (f.content_type ?? "").toLowerCase();
          return (
            n.endsWith(".xlsx") ||
            n.endsWith(".xls") ||
            n.endsWith(".csv") ||
            n.endsWith(".tsv") ||
            ct.includes("spreadsheet") ||
            ct === "text/csv" ||
            ct === "text/tab-separated-values" ||
            ct === "application/vnd.ms-excel"
          );
        });
        setPickerFiles(filtered);
      }
    } catch {
      setPickerFiles([]);
    } finally {
      setPickerLoading(false);
    }
  }, [activeId, supabase]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (pickerFiles === null) loadPickerFiles();
  }, [pickerOpen, pickerFiles, loadPickerFiles]);

  // --- file load --------------------------------------------------------
  const openFileWithCsvOptions = useCallback(
    (
      meta: { id: string; name: string; content_type: string | null },
      buffer: ArrayBuffer,
      csv: CsvOptions | null
    ) => {
      const lower = meta.name.toLowerCase();
      const fmt: "xlsx" | "csv" =
        lower.endsWith(".csv") ||
        lower.endsWith(".tsv") ||
        meta.content_type === "text/csv" ||
        meta.content_type === "text/tab-separated-values"
          ? "csv"
          : "xlsx";
      setFileId(meta.id);
      setFileName(meta.name);
      setInitialBuffer(buffer);
      setInitialFormat(fmt);
      setCsvOptions(fmt === "csv" ? csv : null);
      setEditorKey((k) => k + 1);
      setEditorError(null);
      dirtyRef.current = false;
      setSaveState({ kind: "idle" });
    },
    []
  );

  const loadFileById = useCallback(
    async (id: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/files/load-content?id=${encodeURIComponent(id)}`,
          { credentials: "same-origin" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body?.error || `Couldn't open file (${res.status})`);
        }
        const data = (await res.json()) as {
          file: SheetsFileMeta;
          contentBase64: string;
        };
        const buf = base64ToArrayBuffer(data.contentBase64);
        const lower = data.file.name.toLowerCase();
        const isCsv =
          lower.endsWith(".csv") ||
          lower.endsWith(".tsv") ||
          data.file.content_type === "text/csv" ||
          data.file.content_type === "text/tab-separated-values";
        if (isCsv) {
          // Open CSV import dialog first.
          setPendingCsv({
            file: data.file,
            buffer: buf,
            defaults: {
              delimiter: lower.endsWith(".tsv") ? "tab" : "auto",
              encoding: "utf-8",
              hasHeader: true,
            },
          });
        } else {
          openFileWithCsvOptions(data.file, buf, null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't open file";
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    },
    [openFileWithCsvOptions]
  );

  useEffect(() => {
    const incomingId =
      initialParams && typeof initialParams.fileId === "string"
        ? (initialParams.fileId as string)
        : null;
    if (incomingId && incomingId !== fileId) {
      loadFileById(incomingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  // --- new-blank ---------------------------------------------------------
  const newBlank = useCallback(() => {
    setFileId(null);
    setFileName("Untitled.xlsx");
    setInitialBuffer(null);
    setInitialFormat(null);
    setCsvOptions(null);
    setEditorKey((k) => k + 1);
    dirtyRef.current = false;
    setSaveState({ kind: "idle" });
    setLoadError(null);
    setEditorError(null);
  }, []);

  // --- save --------------------------------------------------------------
  const performSave = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!activeId) {
        setSaveState({ kind: "error", message: "No workspace open" });
        return;
      }
      const exporter = apiRef.current?.getXlsxBuffer;
      if (!exporter) return;
      try {
        if (!opts?.silent) setSaveState({ kind: "saving" });
        const buf = await exporter();
        const contentBase64 = arrayBufferToBase64(buf);
        const name = ensureXlsxExtension(fileName);
        const res = await fetch("/api/files/save-content", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: fileId ?? undefined,
            workspaceId: activeId,
            name,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            contentBase64,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const msg =
            body?.error ||
            (res.status === 413
              ? "Out of storage — upgrade or delete a file"
              : `Save failed (${res.status})`);
          setSaveState({ kind: "error", message: msg });
          return;
        }
        const data = (await res.json()) as { file: SheetsFileMeta };
        setFileId(data.file.id);
        setFileName(data.file.name);
        dirtyRef.current = false;
        setSaveState({ kind: "saved", at: Date.now() });
        setPickerFiles(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setSaveState({ kind: "error", message: msg });
      }
    },
    [activeId, fileId, fileName]
  );

  // --- export to .xlsx (download) ---------------------------------------
  const performExport = useCallback(async () => {
    const exporter = apiRef.current?.getXlsxBuffer;
    if (!exporter) return;
    try {
      const buf = await exporter();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ensureXlsxExtension(fileName);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      /* noop */
    }
  }, [fileName]);

  // --- auto-save (debounced 3s, paused while editing) -------------------
  useEffect(() => {
    if (!activeId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const tick = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        if (isEditingRef.current) {
          tick();
          return;
        }
        if (dirtyRef.current) {
          performSave({ silent: false });
        }
        tick();
      }, 3_000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeId, performSave]);

  // --- shell-level keyboard shortcuts ----------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        performSave();
        return;
      }
      if (meta && e.key === "/") {
        e.preventDefault();
        setShortcutOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performSave]);

  // --- editor wiring ----------------------------------------------------
  const handleEditorReady = useCallback((api: EditorAPI) => {
    apiRef.current = api;
    try {
      setTabs(api.listSheets());
    } catch {
      /* noop */
    }
  }, []);

  const handleDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState((prev) =>
      prev.kind === "saved" || prev.kind === "idle" ? { kind: "idle" } : prev
    );
  }, []);

  const handleEditingState = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
    setSaveState((prev) => {
      if (editing) return { kind: "editing" };
      // Recover from editing → idle. Don't overwrite saving / error.
      if (prev.kind === "editing")
        return dirtyRef.current ? { kind: "idle" } : prev;
      return prev;
    });
  }, []);

  const handleEditorError = useCallback((message: string) => {
    setEditorError(message);
  }, []);

  const handleTabsChange = useCallback((next: SheetTabInfo[]) => {
    setTabs(next);
  }, []);

  // --- pickers + name input ---------------------------------------------
  const handlePickFile = useCallback(
    (id: string) => {
      setPickerOpen(false);
      loadFileById(id);
    },
    [loadFileById]
  );

  const onRename = useCallback((next: string) => {
    setFileName(next);
    dirtyRef.current = true;
  }, []);

  const insertChartFromSelection = useCallback(() => {
    const data = apiRef.current?.getChartSelection();
    if (!data || data.rows.length === 0) {
      setEditorError(
        "Select a range with headers and at least one data row to chart."
      );
      return;
    }
    setChartConfig({ kind: "column", data });
    setChartOpen(true);
  }, []);

  // --- early-out: no workspace -----------------------------------------
  if (!activeId) {
    return (
      <div
        data-tool-theme="files"
        data-tool="sheets"
        className="flex h-full w-full items-center justify-center bg-app p-8 text-app"
      >
        <div className="max-w-sm text-center">
          <SheetsIcon className="mx-auto mb-3 h-10 w-10 text-tool-accent" />
          <h2 className="text-base font-bold text-app">No workspace open</h2>
          <p className="mt-1 text-sm text-secondary">
            Sheets are scoped to a workspace. Open or create one in the
            desktop, then come back here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tool-theme="files"
      data-tool="sheets"
      className="relative flex h-full w-full flex-col overflow-hidden bg-app text-app"
    >
      {/* Masthead */}
      <header className="tool-hero relative overflow-hidden border-b border-app">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 24px)",
            color: "var(--tool-accent)",
            maskImage:
              "radial-gradient(ellipse at 85% 0%, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 85% 0%, black 0%, transparent 70%)",
          }}
        />
        <div className="relative flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-tool-accent-soft ring-1 ring-tool-accent/40">
            <SheetsIcon className="h-5 w-5 text-tool-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tool-accent">
              {activeName} · Sheets
            </p>
            <input
              type="text"
              value={fileName}
              onChange={(e) => onRename(e.target.value)}
              spellCheck={false}
              className="-ml-1 w-full max-w-[420px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[1rem] font-bold tracking-tight text-app outline-none transition focus:border-app focus:bg-app-elevated"
            />
          </div>
          <SaveBadge state={saveState} />
        </div>

        {/* Primary toolbar — file-level actions */}
        <div className="relative flex flex-wrap items-center gap-2 border-t border-app px-4 py-2 sm:px-5">
          <ToolbarButton onClick={newBlank} title="New blank sheet">
            <PlusIcon className="h-3.5 w-3.5" />
            New
          </ToolbarButton>

          <div className="relative">
            <ToolbarButton
              onClick={() => setPickerOpen((v) => !v)}
              title="Open existing spreadsheet"
            >
              Open
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 top-full z-30 mt-1 max-h-[320px] w-[320px] overflow-auto rounded-lg border border-app bg-app-elevated shadow-xl"
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-app bg-app-elevated px-3 py-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary">
                      Spreadsheets in workspace
                    </span>
                    <button
                      onClick={() => {
                        setPickerFiles(null);
                        loadPickerFiles();
                      }}
                      className="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:text-app"
                    >
                      Refresh
                    </button>
                  </div>
                  {pickerLoading && (
                    <div className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-secondary">
                      Loading…
                    </div>
                  )}
                  {!pickerLoading &&
                    pickerFiles !== null &&
                    pickerFiles.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-secondary">
                        No spreadsheets yet. Save one to start your library.
                      </div>
                    )}
                  {!pickerLoading &&
                    pickerFiles !== null &&
                    pickerFiles.length > 0 && (
                      <ul className="py-1">
                        {pickerFiles.map((f) => (
                          <li key={f.id}>
                            <button
                              onClick={() => handlePickFile(f.id)}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-tool-accent-soft ${
                                f.id === fileId
                                  ? "text-tool-accent"
                                  : "text-app"
                              }`}
                            >
                              <SheetsIcon className="h-3.5 w-3.5 flex-shrink-0 text-tool-accent" />
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {f.name}
                              </span>
                              <span className="font-mono text-[10px] tabular-nums text-muted">
                                {fmtBytes(f.size_bytes)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ToolbarButton onClick={() => performSave()} primary title="Save (Cmd+S)">
            <CheckIcon className="h-3.5 w-3.5" />
            Save
          </ToolbarButton>

          <ToolbarButton onClick={performExport} title="Download .xlsx">
            <DownloadIcon className="h-3.5 w-3.5" />
            Export
          </ToolbarButton>

          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
            {width} × {height}
          </span>
        </div>

        {/* Secondary toolbar — number formats, sort/filter, freeze, charts */}
        <div className="relative flex flex-wrap items-center gap-1.5 border-t border-app bg-app/50 px-4 py-2 sm:px-5">
          <ToolbarLabel>Format</ToolbarLabel>
          <div className="relative">
            <ToolbarButton
              onClick={() => setFormatOpen((v) => !v)}
              title="Number formats"
              active={formatOpen}
            >
              <FormatIcon className="h-3.5 w-3.5" />
              Formats
              <ChevronDownIcon className="h-3 w-3" />
            </ToolbarButton>
            <FormatMenu
              open={formatOpen}
              onClose={() => setFormatOpen(false)}
              api={apiRef.current}
            />
          </div>
          <ToolbarButton
            onClick={() => apiRef.current?.setNumberFormat('"$"#,##0.00')}
            title="Currency (USD)"
          >
            $
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.setNumberFormat("0.00%")}
            title="Percent"
          >
            %
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.setNumberFormat("#,##0")}
            title="Thousands separator"
          >
            ,
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.changeDecimals(1)}
            title="Increase decimals"
          >
            .0+
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.changeDecimals(-1)}
            title="Decrease decimals"
          >
            .0−
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarLabel>Data</ToolbarLabel>
          <ToolbarButton
            onClick={() => apiRef.current?.sortActive(true)}
            title="Sort A → Z"
          >
            <SortAscIcon className="h-3.5 w-3.5" />
            A→Z
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.sortActive(false)}
            title="Sort Z → A"
          >
            <SortDescIcon className="h-3.5 w-3.5" />
            Z→A
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.toggleFilter()}
            title="Toggle filter on selection"
          >
            <FilterIcon className="h-3.5 w-3.5" />
            Filter
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarLabel>View</ToolbarLabel>
          <div className="relative">
            <ToolbarButton
              onClick={() => setFreezeOpen((v) => !v)}
              title="Freeze panes"
              active={freezeOpen}
            >
              <FreezeIcon className="h-3.5 w-3.5" />
              Freeze
              <ChevronDownIcon className="h-3 w-3" />
            </ToolbarButton>
            <AnimatePresence>
              {freezeOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 top-full z-30 mt-1 w-[200px] overflow-hidden rounded-lg border border-app bg-app-elevated shadow-xl"
                >
                  {[
                    { label: "Top row", action: () => apiRef.current?.freezeTopRow() },
                    {
                      label: "First column",
                      action: () => apiRef.current?.freezeFirstColumn(),
                    },
                    { label: "2 rows", action: () => apiRef.current?.freezeRows(2) },
                    { label: "3 rows", action: () => apiRef.current?.freezeRows(3) },
                    {
                      label: "2 columns",
                      action: () => apiRef.current?.freezeColumns(2),
                    },
                    { label: "Unfreeze", action: () => apiRef.current?.unfreeze() },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        opt.action();
                        setFreezeOpen(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-app hover:bg-tool-accent-soft"
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <ToolbarButton
            onClick={() => apiRef.current?.openConditionalFormat()}
            title="Conditional formatting"
          >
            <FormatIcon className="h-3.5 w-3.5" />
            Conditional
          </ToolbarButton>
          <ToolbarButton
            onClick={() => apiRef.current?.openFindReplace()}
            title="Find & replace (Cmd+F)"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            Find
          </ToolbarButton>
          <ToolbarButton onClick={insertChartFromSelection} title="Insert chart from selection">
            <ChartIcon className="h-3.5 w-3.5" />
            Chart
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => setShortcutOpen(true)}
            title="Keyboard shortcuts (Cmd+/)"
          >
            <KbIcon className="h-3.5 w-3.5" />
            Keys
          </ToolbarButton>
        </div>

        {/* Tertiary — sheet tabs */}
        {tabs.length > 0 && (
          <div className="relative flex flex-wrap items-center gap-1 border-t border-app bg-app-elevated/40 px-4 py-1.5 sm:px-5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => apiRef.current?.setActiveSheet(tab.id)}
                onDoubleClick={() => {
                  const next = window.prompt("Rename sheet", tab.name);
                  if (next && next.trim().length > 0) {
                    apiRef.current?.setActiveSheet(tab.id);
                    apiRef.current?.renameActiveSheet(next.trim());
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  tab.active
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:bg-app-elevated hover:text-app"
                }`}
                title="Click to switch · Double-click to rename"
              >
                <SheetTabIcon className="h-3 w-3" />
                {tab.name}
              </button>
            ))}
            <button
              onClick={() => apiRef.current?.insertSheet()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted hover:bg-app-elevated hover:text-app"
              title="Add a sheet"
            >
              <PlusIcon className="h-3 w-3" />
              Sheet
            </button>
            <button
              onClick={() => apiRef.current?.duplicateActiveSheet()}
              className="ml-1 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted hover:text-app"
              title="Duplicate active sheet"
            >
              Duplicate
            </button>
            <button
              onClick={() => {
                if (window.confirm("Delete the active sheet?"))
                  apiRef.current?.deleteActiveSheet();
              }}
              className="rounded-md px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted hover:text-rose-500"
              title="Delete active sheet"
            >
              Delete
            </button>
          </div>
        )}
      </header>

      {/* Error banners */}
      <AnimatePresence>
        {loadError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-rose-500/30 bg-rose-500/10"
          >
            <div className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="font-semibold text-rose-500">Open failed</span>
              <span className="text-secondary">{loadError}</span>
              <button
                onClick={() => setLoadError(null)}
                className="ml-auto rounded-md border border-app px-2 py-1 text-[10px] text-secondary hover:text-app"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
        {editorError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-amber-500/30 bg-amber-500/10"
          >
            <div className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="font-semibold text-amber-500">Editor</span>
              <span className="text-secondary">{editorError}</span>
              <button
                onClick={() => {
                  setEditorError(null);
                  setEditorKey((k) => k + 1);
                }}
                className="ml-auto rounded-md border border-app px-2 py-1 text-[10px] text-secondary hover:text-app"
              >
                Retry
              </button>
              <button
                onClick={() => setEditorError(null)}
                className="rounded-md px-2 py-1 text-[10px] text-muted hover:text-app"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor body */}
      <div className="relative flex-1 overflow-hidden bg-app">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-app/80 backdrop-blur-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-secondary">
              Loading file…
            </span>
          </div>
        )}
        <SheetsEditor
          key={editorKey}
          initialBuffer={initialBuffer}
          initialFormat={initialFormat}
          csvOptions={csvOptions}
          docName={fileName}
          theme={resolved}
          onReady={handleEditorReady}
          onError={handleEditorError}
          onDirty={handleDirty}
          onEditingChange={handleEditingState}
          onSheetTabsChange={handleTabsChange}
        />

        {/* Chart overlay */}
        <AnimatePresence>
          {chartOpen && chartConfig && (
            <ChartOverlay
              config={chartConfig}
              onChangeKind={(kind) =>
                setChartConfig((prev) => (prev ? { ...prev, kind } : prev))
              }
              onClose={() => setChartOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* CSV import dialog */}
        {pendingCsv && (
          <CsvImportDialog
            open
            defaults={pendingCsv.defaults}
            onConfirm={(opts) => {
              const item = pendingCsv;
              setPendingCsv(null);
              openFileWithCsvOptions(item.file, item.buffer, opts);
            }}
            onCancel={() => setPendingCsv(null)}
          />
        )}
      </div>

      {/* Shortcut cheatsheet */}
      <ShortcutModal
        open={shortcutOpen}
        onClose={() => setShortcutOpen(false)}
      />
    </div>
  );
}
