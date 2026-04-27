"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Sheets — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Excel-style spreadsheet editor backed by Univer (Apache-2). Round-trips
   real .xlsx files through SheetJS into the workspace's Files Manager:

     POST /api/files/save-content   → create/update an .xlsx file
     GET  /api/files/load-content   → fetch a file's contents (base64)

   Univer + SheetJS are heavy (~2 MB combined). Loaded behind a Next.js
   dynamic() boundary so the desktop boot doesn't pay for it until the
   user opens this tool. The editor mounts after first paint.
═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase/client";
import type { NativeAppProps } from "../_data/tools-list";

const ACTIVE_WS_KEY = "workspaces:active:v1";
const WS_LIST_KEY = "workspaces:list:v1";

// Univer mounts to the DOM imperatively. We pull it client-only so the
// initial JS chunk for the desktop stays small.
const SheetsEditor = dynamic(() => import("./_editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-app">
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-secondary">
        Loading editor…
      </span>
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
  | { kind: "error"; message: string };

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

// ArrayBuffer → base64 in chunks (avoid stack overflow on large blobs).
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

function SheetsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-8" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
      <path d="M17 10a7 7 0 00-7-7" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v10M5 9l5 4 5-4" />
      <path d="M4 16h12" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

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
  // tick is referenced so React re-runs fmtRelativeTime via memo invalidation
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
  } else if (state.kind === "error") {
    label = state.message || "Save failed";
    cls = "text-rose-500";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] ${cls}`}>
      {icon}
      {label}
    </span>
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

  // --- file/document state ----------------------------------------------
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("Untitled.xlsx");
  // Initial workbook data (raw .xlsx bytes loaded from R2). The editor
  // takes this once on mount and doesn't read it again unless the
  // `editorKey` bumps (open-different-file).
  const [initialBuffer, setInitialBuffer] = useState<ArrayBuffer | null>(null);
  const [initialFormat, setInitialFormat] = useState<"xlsx" | "csv" | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);

  // The editor passes us back a getter so we can pull out a fresh xlsx
  // ArrayBuffer at any time — Cmd+S, Save button, auto-save, export.
  const exportRef = useRef<(() => Promise<ArrayBuffer>) | null>(null);
  const isEditingRef = useRef(false);
  const dirtyRef = useRef(false);

  // --- known files for "Open" dropdown ----------------------------------
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
            ct.includes("spreadsheet") ||
            ct === "text/csv" ||
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

  // --- initialParams handling: open by fileId ---------------------------
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
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body?.error || `Couldn't open file (${res.status})`);
        }
        const data = (await res.json()) as {
          file: { id: string; name: string; content_type: string | null };
          contentBase64: string;
        };
        const buf = base64ToArrayBuffer(data.contentBase64);
        const lower = data.file.name.toLowerCase();
        const fmt: "xlsx" | "csv" =
          lower.endsWith(".csv") || data.file.content_type === "text/csv"
            ? "csv"
            : "xlsx";
        setFileId(data.file.id);
        setFileName(data.file.name);
        setInitialBuffer(buf);
        setInitialFormat(fmt);
        setEditorKey((k) => k + 1);
        dirtyRef.current = false;
        setSaveState({ kind: "idle" });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Couldn't open file";
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    },
    []
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
    setEditorKey((k) => k + 1);
    dirtyRef.current = false;
    setSaveState({ kind: "idle" });
    setLoadError(null);
  }, []);

  // --- save --------------------------------------------------------------
  const performSave = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!activeId) {
        setSaveState({ kind: "error", message: "No workspace open" });
        return;
      }
      const exporter = exportRef.current;
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
        // Picker list is now stale.
        setPickerFiles(null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Save failed";
        setSaveState({ kind: "error", message: msg });
      }
    },
    [activeId, fileId, fileName]
  );

  // --- export to .xlsx (download) ---------------------------------------
  const performExport = useCallback(async () => {
    const exporter = exportRef.current;
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

  // --- Cmd+S / Ctrl+S ---------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        performSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performSave]);

  // --- editor wiring ----------------------------------------------------
  const handleEditorReady = useCallback(
    (api: { getXlsxBuffer: () => Promise<ArrayBuffer> }) => {
      exportRef.current = api.getXlsxBuffer;
    },
    []
  );

  const handleDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState((prev) =>
      prev.kind === "saved" || prev.kind === "idle" ? { kind: "idle" } : prev
    );
  }, []);

  const handleEditingState = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
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

        {/* Toolbar */}
        <div className="relative flex flex-wrap items-center gap-2 border-t border-app px-4 py-2 sm:px-5">
          <button
            onClick={newBlank}
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] font-semibold text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
            title="New blank sheet"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New
          </button>

          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] font-semibold text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
            >
              Open
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
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

          <button
            onClick={() => performSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-2.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
            title="Save (Cmd+S)"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            Save
          </button>

          <button
            onClick={performExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] font-semibold text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
            title="Download .xlsx"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Export
          </button>

          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
            {width} × {height}
          </span>
        </div>
      </header>

      {/* Error banner */}
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
          docName={fileName}
          theme={resolved}
          onReady={handleEditorReady}
          onDirty={handleDirty}
          onEditingChange={handleEditingState}
        />
      </div>
    </div>
  );
}
