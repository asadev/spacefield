"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Documents — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Word-style rich-text editor that lives inside a workspace Window. Saves
   the document into the workspace's Files Manager (Cloudflare R2 + Supabase
   metadata) using the shared /api/files/save-content + /api/files/load-content
   endpoints.

   Round-trip:
     • New file → markdown body, content_type "text/markdown", filename ends .md
     • Open existing → reads .md / .txt / .html / .docx, renders into TipTap
     • Save        → serializes back to markdown (or HTML if user opened HTML)
     • Save as docx → uses `docx` lib to build a Document and download it
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { getSupabase } from "@/lib/supabase/client";
import type { NativeAppProps } from "../_data/tools-list";
import { docToMarkdown, htmlToDocxBlob } from "./_serialize";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const ACTIVE_WS_KEY = "workspaces:active:v1";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type SaveFormat = "markdown" | "html";

interface DocFileRow {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

function fmtRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = (Date.now() - t) / 1000;
  if (diff < 45) return "just now";
  if (diff < 90) return "a minute ago";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} d ago`;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return iso;
  }
}

function classifyDoc(name: string, ct: string | null): SaveFormat | "docx" | "unknown" {
  const lower = name.toLowerCase();
  const t = (ct ?? "").toLowerCase();
  if (lower.endsWith(".docx") || t === DOCX_MIME) return "docx";
  if (lower.endsWith(".html") || t === "text/html") return "html";
  if (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    t === "text/markdown" ||
    t === "text/plain"
  ) {
    return "markdown";
  }
  return "unknown";
}

function ensureExtension(name: string, ext: string): string {
  if (!name) return `Untitled.${ext}`;
  const trimmed = name.trim();
  if (trimmed.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return trimmed;
  // Strip any existing known extension before appending
  const stripped = trimmed.replace(/\.(md|markdown|txt|html|docx)$/i, "");
  return `${stripped}.${ext}`;
}

function bytesFromBase64(b64: string): number {
  // Quick approximation — every 4 base64 chars = 3 bytes, minus padding.
  const padding = (b64.match(/=+$/) ?? [""])[0].length;
  return Math.max(0, (b64.length * 3) / 4 - padding);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    );
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  // Encode utf-8 then base64. btoa() alone breaks on non-latin chars.
  const enc = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < enc.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...enc.subarray(i, Math.min(i + chunkSize, enc.length))
    );
  }
  return btoa(binary);
}

function base64ToText(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-tool-accent bg-tool-accent text-white"
          : "border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-app" />;
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function StatusPill({
  status,
  savedAt,
}: {
  status: SaveStatus;
  savedAt: string | null;
}) {
  let dotClass = "bg-app";
  let label = "Ready";
  if (status === "saving") {
    dotClass = "bg-amber-500";
    label = "Saving…";
  } else if (status === "saved") {
    dotClass = "bg-emerald-500";
    label = `Saved · ${savedAt ? fmtRelativeTime(savedAt) : "just now"}`;
  } else if (status === "dirty") {
    dotClass = "bg-amber-500";
    label = "Unsaved changes";
  } else if (status === "error") {
    dotClass = "bg-rose-500";
    label = "Save failed";
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open dialog — shows .md/.txt/.html/.docx in current workspace
// ---------------------------------------------------------------------------

const OPENABLE_EXT_RE = /\.(md|markdown|txt|html|docx)$/i;
const OPENABLE_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "text/html",
  DOCX_MIME,
]);

function OpenDialog({
  workspaceId,
  onPick,
  onClose,
}: {
  workspaceId: string;
  onPick: (file: DocFileRow) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => getSupabase(), []);
  const [rows, setRows] = useState<DocFileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: dbErr } = await supabase
        .from("workspace_files")
        .select("id, name, size_bytes, content_type, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (dbErr) {
        setError(dbErr.message);
        setRows([]);
        return;
      }
      const all = (data ?? []) as DocFileRow[];
      const filtered = all.filter((f) => {
        const ct = (f.content_type ?? "").toLowerCase();
        if (OPENABLE_TYPES.has(ct)) return true;
        return OPENABLE_EXT_RE.test(f.name);
      });
      setRows(filtered);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, workspaceId]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.18, ease }}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-app px-4 py-3">
          <h3 className="text-sm font-bold text-app">Open document</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-app text-secondary hover:text-app"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>
        <div className="max-h-[55vh] overflow-y-auto">
          {!rows && (
            <div className="px-4 py-6 text-center text-xs text-secondary">
              Loading…
            </div>
          )}
          {rows && rows.length === 0 && !error && (
            <div className="px-4 py-6 text-center text-xs text-secondary">
              No documents yet. Start a new one and save to see it here.
            </div>
          )}
          {error && (
            <div className="px-4 py-6 text-center text-xs text-rose-500">
              {error}
            </div>
          )}
          {rows && rows.length > 0 && (
            <ul className="flex flex-col">
              {rows.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => onPick(f)}
                    className="flex w-full items-center gap-3 border-b border-app px-4 py-2.5 text-left transition hover:bg-tool-accent-soft"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-tool-accent-soft text-tool-accent">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
                        <path d="M14 3v6h6" />
                        <path d="M8 13h8M8 17h6" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-app">
                        {f.name}
                      </span>
                      <span className="block font-mono text-[10px] tabular-nums text-muted">
                        {fmtBytes(f.size_bytes)} ·{" "}
                        {fmtRelativeTime(f.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function DocumentsApp({
  initialParams,
  initialParamsKey,
}: NativeAppProps) {
  // Workspace
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("Workspace");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(ACTIVE_WS_KEY);
      setActiveId(v && v.length > 0 ? v : null);
      const listRaw = window.localStorage.getItem("workspaces:list:v1");
      if (listRaw && v) {
        const list = JSON.parse(listRaw) as Array<{ id: string; name: string }>;
        const match = list.find((w) => w.id === v);
        if (match) setActiveName(match.name);
      }
    } catch {
      setActiveId(null);
    }
  }, []);

  // Lazy materializer — same pattern as Files Manager. Keeps quota +
  // membership rows in sync before the first save.
  const [ensured, setEnsured] = useState(false);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  useEffect(() => {
    if (!activeId) return;
    setEnsured(false);
    setEnsureError(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspaces/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: activeId, name: activeName }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setEnsureError(body?.error ?? `could not prepare workspace (${res.status})`);
          return;
        }
      } catch {
        if (!cancelled) setEnsureError("network error preparing workspace");
        return;
      }
      if (!cancelled) setEnsured(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Document state
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("Untitled.md");
  const [saveFormat, setSaveFormat] = useState<SaveFormat>("markdown");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs the autosave timer reads. We don't want autosave running off stale
  // closures, so the latest values get pushed here on every change.
  const fileIdRef = useRef<string | null>(null);
  const fileNameRef = useRef<string>(fileName);
  const formatRef = useRef<SaveFormat>(saveFormat);
  const statusRef = useRef<SaveStatus>(status);
  useEffect(() => {
    fileIdRef.current = fileId;
  }, [fileId]);
  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);
  useEffect(() => {
    formatRef.current = saveFormat;
  }, [saveFormat]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // UI state
  const [openDialog, setOpenDialog] = useState(false);

  // TipTap editor — set up once.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: "Start writing…" }),
      Table.configure({ resizable: false, HTMLAttributes: { class: "doc-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-doc focus:outline-none",
      },
    },
    onUpdate: () => {
      // Mark dirty; the autosave debouncer below picks this up.
      if (statusRef.current !== "saving") {
        setStatus("dirty");
      }
      scheduleAutosave();
    },
  });

  // ------------------------------------------------------------------
  // Save / Open / Load
  // ------------------------------------------------------------------

  const serializeBody = useCallback(
    (e: Editor): { contentBase64: string; contentType: string } => {
      if (formatRef.current === "html") {
        const html = e.getHTML();
        return {
          contentBase64: textToBase64(html),
          contentType: "text/html",
        };
      }
      const md = docToMarkdown(e.getJSON());
      return {
        contentBase64: textToBase64(md),
        contentType: "text/markdown",
      };
    },
    []
  );

  const doSave = useCallback(
    async (opts?: { force?: boolean }) => {
      const e = editor;
      if (!e) return;
      if (!activeId) return;
      if (!ensured) return;
      if (statusRef.current === "saving") return;
      if (!opts?.force && statusRef.current !== "dirty") return;

      const { contentBase64, contentType } = serializeBody(e);
      const targetExt =
        formatRef.current === "html" ? "html" : "md";
      const finalName = ensureExtension(
        fileNameRef.current || "Untitled",
        targetExt
      );

      setStatus("saving");
      setErrorMsg(null);
      try {
        const res = await fetch("/api/files/save-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: fileIdRef.current ?? undefined,
            workspaceId: activeId,
            name: finalName,
            contentType,
            contentBase64,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setStatus("error");
          setErrorMsg(body?.error ?? `save failed (${res.status})`);
          return;
        }
        const { file } = (await res.json()) as {
          file: {
            id: string;
            name: string;
            content_type: string | null;
            created_at: string;
          };
        };
        setFileId(file.id);
        setFileName(file.name);
        setSavedAt(new Date().toISOString());
        setStatus("saved");
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "save failed");
      }
    },
    [editor, activeId, ensured, serializeBody]
  );

  // Debounced autosave — bumps a timer each edit, fires after 2 s of quiet.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      doSave();
    }, 2000);
  }, [doSave]);
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // Cmd+S / Ctrl+S handler.
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const isSave =
        (ev.metaKey || ev.ctrlKey) && (ev.key === "s" || ev.key === "S");
      if (!isSave) return;
      // Only intercept when the editor (or this app's chrome) is focused.
      const active = document.activeElement;
      const root = document.querySelector('[data-tool="documents"]');
      if (!root || !active || !root.contains(active)) return;
      ev.preventDefault();
      doSave({ force: true });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave]);

  // Load by fileId — drives both initial mount-with-params and the explicit
  // Open dialog. mammoth and docx generation are dynamic-imported to keep
  // the initial chunk small.
  const loadFileById = useCallback(
    async (id: string) => {
      if (!editor) return;
      setStatus("idle");
      setErrorMsg(null);
      try {
        const res = await fetch(
          `/api/files/load-content?id=${encodeURIComponent(id)}`
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setErrorMsg(body?.error ?? `load failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as {
          file: { id: string; name: string; content_type: string | null };
          contentBase64: string;
        };

        const kind = classifyDoc(data.file.name, data.file.content_type);
        if (kind === "docx") {
          const mammoth = await import("mammoth");
          const arrayBuf = base64ToArrayBuffer(data.contentBase64);
          const { value } = await mammoth.convertToHtml({
            arrayBuffer: arrayBuf,
          });
          editor.commands.setContent(value || "<p></p>");
          setSaveFormat("html"); // .docx round-trips via HTML in TipTap
        } else if (kind === "html") {
          const html = base64ToText(data.contentBase64);
          editor.commands.setContent(html || "<p></p>");
          setSaveFormat("html");
        } else {
          // markdown / txt / unknown — treat as plain text. We don't run a
          // markdown parser here on purpose: TipTap's StarterKit handles
          // common markdown shortcuts and round-tripping plain text is
          // strictly safer than misparsing.
          const text = base64ToText(data.contentBase64);
          editor.commands.setContent(textToTipTapHTML(text));
          setSaveFormat("markdown");
        }

        setFileId(data.file.id);
        setFileName(data.file.name);
        setSavedAt(new Date().toISOString());
        setStatus("saved");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "load failed");
      }
    },
    [editor]
  );

  // initialParams.fileId — open requested file when param changes.
  const lastLoadedKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editor) return;
    const incomingFileId =
      typeof initialParams?.fileId === "string"
        ? initialParams.fileId
        : null;
    const key = initialParamsKey ?? 0;
    if (!incomingFileId) return;
    if (lastLoadedKeyRef.current === key) return;
    lastLoadedKeyRef.current = key;
    loadFileById(incomingFileId);
  }, [editor, initialParams, initialParamsKey, loadFileById]);

  // ------------------------------------------------------------------
  // New / Open / Save-As-DOCX
  // ------------------------------------------------------------------

  const newDocument = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setFileId(null);
    setFileName("Untitled.md");
    setSaveFormat("markdown");
    setStatus("idle");
    setSavedAt(null);
    setErrorMsg(null);
    editor?.commands.setContent("<p></p>");
  }, [editor]);

  const exportDocx = useCallback(async () => {
    if (!editor) return;
    try {
      const html = editor.getHTML();
      const blob = await htmlToDocxBlob(html);
      const base = (fileNameRef.current || "Untitled").replace(
        /\.(md|markdown|txt|html|docx)$/i,
        ""
      );
      const downloadName = `${base || "Untitled"}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "export failed");
    }
  }, [editor]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (!activeId) {
    return (
      <div
        data-tool-theme="content"
        data-tool="documents"
        className="flex h-full w-full items-center justify-center bg-app p-8"
      >
        <div className="max-w-sm text-center">
          <h2 className="text-base font-bold text-app">No workspace open</h2>
          <p className="mt-1 text-sm text-secondary">
            Documents save into the active workspace. Open or create one in
            the desktop, then come back here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tool-theme="content"
      data-tool="documents"
      className="relative flex h-full w-full flex-col overflow-hidden bg-app text-app"
    >
      {/* Title bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-app px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-tool-accent-soft text-tool-accent">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
              <path d="M14 3v6h6" />
              <path d="M8 13h8M8 17h6" />
            </svg>
          </span>
          <input
            type="text"
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              if (statusRef.current !== "saving") setStatus("dirty");
            }}
            onBlur={() => {
              setFileName((n) =>
                ensureExtension(
                  n,
                  formatRef.current === "html" ? "html" : "md"
                )
              );
            }}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-app outline-none transition hover:border-app focus:border-tool-accent focus:bg-app-elevated"
            aria-label="Document name"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {activeName}
          </span>
        </div>
        <StatusPill status={status} savedAt={savedAt} />
        <div className="flex items-center gap-1">
          <button
            onClick={newDocument}
            className="rounded-md border border-app px-2 py-1 text-[11px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
          >
            New
          </button>
          <button
            onClick={() => setOpenDialog(true)}
            className="rounded-md border border-app px-2 py-1 text-[11px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
          >
            Open
          </button>
          <button
            onClick={() => doSave({ force: true })}
            disabled={!ensured || status === "saving"}
            className="rounded-md bg-tool-accent px-2.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={exportDocx}
            className="rounded-md border border-app px-2 py-1 text-[11px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
            title="Download as Word .docx"
          >
            .docx
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar
        editor={editor}
        saveFormat={saveFormat}
        onChangeFormat={(f) => {
          setSaveFormat(f);
          setFileName((n) => ensureExtension(n, f === "html" ? "html" : "md"));
          if (statusRef.current !== "saving") setStatus("dirty");
        }}
      />

      {/* Error banner */}
      <AnimatePresence>
        {(errorMsg || ensureError) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-rose-500/30 bg-rose-500/10"
          >
            <div className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="font-semibold text-rose-400">
                {ensureError ? "Workspace error" : "Save error"}
              </span>
              <span className="text-secondary">{errorMsg ?? ensureError}</span>
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setEnsureError(null);
                }}
                className="ml-auto rounded-md border border-app px-2 py-0.5 text-[10px] text-secondary hover:text-app"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto bg-app">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Open dialog */}
      <AnimatePresence>
        {openDialog && activeId && (
          <OpenDialog
            workspaceId={activeId}
            onClose={() => setOpenDialog(false)}
            onPick={(f) => {
              setOpenDialog(false);
              loadFileById(f.id);
            }}
          />
        )}
      </AnimatePresence>

      {/* Editor styling — scoped via data-tool. The `.prose-doc` class is
          rendered by TipTap on the contenteditable. */}
      <style jsx>{`
        :global([data-tool="documents"]) .prose-doc {
          min-height: 300px;
          font-size: 15px;
          line-height: 1.65;
          color: var(--text-app, inherit);
        }
        :global([data-tool="documents"]) .prose-doc p {
          margin: 0 0 0.85em;
        }
        :global([data-tool="documents"]) .prose-doc h1 {
          font-size: 1.7em;
          font-weight: 700;
          margin: 1em 0 0.5em;
          line-height: 1.2;
        }
        :global([data-tool="documents"]) .prose-doc h2 {
          font-size: 1.35em;
          font-weight: 700;
          margin: 0.9em 0 0.4em;
          line-height: 1.25;
        }
        :global([data-tool="documents"]) .prose-doc h3 {
          font-size: 1.15em;
          font-weight: 600;
          margin: 0.8em 0 0.35em;
        }
        :global([data-tool="documents"]) .prose-doc ul,
        :global([data-tool="documents"]) .prose-doc ol {
          padding-left: 1.4em;
          margin: 0 0 0.85em;
        }
        :global([data-tool="documents"]) .prose-doc ul li,
        :global([data-tool="documents"]) .prose-doc ol li {
          margin: 0.15em 0;
        }
        :global([data-tool="documents"]) .prose-doc blockquote {
          border-left: 3px solid var(--tool-accent, #888);
          margin: 0 0 0.9em;
          padding: 0.1em 0.9em;
          color: var(--text-secondary, inherit);
        }
        :global([data-tool="documents"]) .prose-doc code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.92em;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          background: var(--bg-app-elevated, rgba(127,127,127,0.12));
        }
        :global([data-tool="documents"]) .prose-doc pre {
          background: var(--bg-app-elevated, rgba(127,127,127,0.12));
          padding: 0.7em 0.9em;
          border-radius: 8px;
          overflow-x: auto;
          font-size: 0.9em;
          line-height: 1.5;
          margin: 0 0 1em;
        }
        :global([data-tool="documents"]) .prose-doc pre code {
          background: transparent;
          padding: 0;
          border-radius: 0;
        }
        :global([data-tool="documents"]) .prose-doc a {
          color: var(--tool-accent, #4a90e2);
          text-decoration: underline;
        }
        :global([data-tool="documents"]) .prose-doc table {
          border-collapse: collapse;
          margin: 0 0 1em;
          width: 100%;
          table-layout: fixed;
          font-size: 0.95em;
        }
        :global([data-tool="documents"]) .prose-doc th,
        :global([data-tool="documents"]) .prose-doc td {
          border: 1px solid var(--border-app, rgba(127,127,127,0.3));
          padding: 0.4em 0.6em;
          vertical-align: top;
          min-width: 60px;
        }
        :global([data-tool="documents"]) .prose-doc th {
          background: var(--bg-app-elevated, rgba(127,127,127,0.08));
          font-weight: 600;
          text-align: left;
        }
        :global([data-tool="documents"]) .prose-doc img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
        }
        :global([data-tool="documents"]) .prose-doc ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        :global([data-tool="documents"]) .prose-doc ul[data-type="taskList"] li {
          display: flex;
          gap: 0.5em;
        }
        :global([data-tool="documents"]) .prose-doc p.is-editor-empty:first-child::before {
          color: var(--text-muted, #999);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({
  editor,
  saveFormat,
  onChangeFormat,
}: {
  editor: Editor | null;
  saveFormat: SaveFormat;
  onChangeFormat: (f: SaveFormat) => void;
}) {
  if (!editor) {
    return (
      <div className="flex flex-wrap items-center gap-1 border-b border-app bg-app-elevated px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Loading editor…
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-app bg-app-elevated px-3 py-1.5">
      <ToolbarBtn
        title="Bold (Cmd+B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        B
      </ToolbarBtn>
      <ToolbarBtn
        title="Italic (Cmd+I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <span className="italic">I</span>
      </ToolbarBtn>
      <ToolbarBtn
        title="Underline (Cmd+U)"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
      >
        <span className="underline">U</span>
      </ToolbarBtn>
      <ToolbarBtn
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
      >
        <span className="line-through">S</span>
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        title="Heading 1"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        active={editor.isActive("heading", { level: 1 })}
      >
        H1
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 2"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        active={editor.isActive("heading", { level: 2 })}
      >
        H2
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 3"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        active={editor.isActive("heading", { level: 3 })}
      >
        H3
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        title="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        •
      </ToolbarBtn>
      <ToolbarBtn
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        1.
      </ToolbarBtn>
      <ToolbarBtn
        title="Task list"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
      >
        ☑
      </ToolbarBtn>
      <ToolbarBtn
        title="Block quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
      >
        ❝
      </ToolbarBtn>
      <ToolbarBtn
        title="Code block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
      >
        {"</>"}
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        title="Insert link"
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          } else {
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          }
        }}
        active={editor.isActive("link")}
      >
        🔗
      </ToolbarBtn>
      <ToolbarBtn
        title="Insert table"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        ⊞
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        ↶
      </ToolbarBtn>
      <ToolbarBtn
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        ↷
      </ToolbarBtn>
      <span className="ml-auto flex items-center gap-1 rounded-md border border-app bg-app p-0.5 text-[10px]">
        <button
          onClick={() => onChangeFormat("markdown")}
          className={`rounded px-2 py-0.5 font-semibold transition ${
            saveFormat === "markdown"
              ? "bg-tool-accent text-white"
              : "text-secondary hover:text-app"
          }`}
          title="Save as markdown (.md)"
        >
          .md
        </button>
        <button
          onClick={() => onChangeFormat("html")}
          className={`rounded px-2 py-0.5 font-semibold transition ${
            saveFormat === "html"
              ? "bg-tool-accent text-white"
              : "text-secondary hover:text-app"
          }`}
          title="Save as HTML (preserves all rich-text fidelity)"
        >
          .html
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plain text → HTML for setContent. Splits on blank lines into paragraphs.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToTipTapHTML(text: string): string {
  if (!text.trim()) return "<p></p>";
  const blocks = text.split(/\r?\n\r?\n+/);
  return blocks
    .map((b) => {
      const inner = escapeHtml(b).replace(/\r?\n/g, "<br />");
      return `<p>${inner}</p>`;
    })
    .join("");
}

// Re-export for tree-shaking sanity (kept inline above as well)
export { bytesFromBase64 };
