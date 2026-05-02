"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Documents — Native Desktop Workspace App (pro tier)
   ───────────────────────────────────────────────────────────────────────────
   Word-style rich-text editor that lives inside a workspace Window. Saves
   the document into the workspace's Files Manager (Cloudflare R2 + Supabase
   metadata) using the shared /api/files/save-content + /api/files/load-content
   endpoints.

   v2 additions (vs the baseline):
     • Full pro toolbar (font family/size, color, highlight, alignment,
       line height, indent/outdent, link popover, image+drop, table picker,
       horizontal rule, clear formatting, print).
     • Slash menu (`/` opens Suggestion popover).
     • Find & replace (Cmd+F, Cmd+G, Cmd+Shift+G).
     • Document outline (right panel, toggle).
     • Word/character count + reading time + line:col footer.
     • Print → PDF via window.print() with print CSS.
     • Comments (Cmd+Opt+M), persisted as front-matter JSON that round-trips.
     • Better paste sanitisation (strips non-supported inline styles).
     • Keyboard shortcut sheet (Cmd+/).
     • Loading skeleton, prose typography polish, dirty-count indicator.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
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
import {
  TextStyle,
  FontFamily,
  FontSize,
  LineHeight,
  Color,
} from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Suggestion from "@tiptap/suggestion";
import { Extension } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import { getSupabase } from "@/lib/supabase/client";
import type { NativeAppProps } from "../_data/tools-list";
import { docToMarkdown, htmlToDocxBlob } from "./_serialize";
import {
  CommentMark,
  createSlashSuggestion,
  type CommentRecord,
  type SlashItem,
} from "./_pro_extensions";

// Lazy panels — only loaded when the user actually invokes the feature.
const SlashMenu = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.SlashMenu })),
  { ssr: false }
);
const FindReplaceBar = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.FindReplaceBar })),
  { ssr: false }
);
const DocumentOutline = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.DocumentOutline })),
  { ssr: false }
);
const CommentsOverlay = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.CommentsOverlay })),
  { ssr: false }
);
const CommentComposer = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.CommentComposer })),
  { ssr: false }
);
const ShortcutSheet = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.ShortcutSheet })),
  { ssr: false }
);
const PalettePopover = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.PalettePopover })),
  { ssr: false }
);
const EditorSkeleton = dynamic(
  () => import("./_pro_panels").then((m) => ({ default: m.EditorSkeleton })),
  { ssr: false }
);

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const ACTIVE_WS_KEY = "workspaces:active:v1";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Front-matter sentinel for comments — keeps comment payload alive across
// markdown / html save round-trips. Lives at the very top of the file, fenced
// by a unique HTML comment so a markdown viewer treats it as invisible.
const FRONT_MATTER_BEGIN = "<!-- spacefield:doc-meta-begin";
const FRONT_MATTER_END = "spacefield:doc-meta-end -->";

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

interface DocMeta {
  comments?: CommentRecord[];
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
  const stripped = trimmed.replace(/\.(md|markdown|txt|html|docx)$/i, "");
  return `${stripped}.${ext}`;
}

function bytesFromBase64(b64: string): number {
  const padding = (b64.match(/=+$/) ?? [""])[0].length;
  return Math.max(0, (b64.length * 3) / 4 - padding);
}

function textToBase64(text: string): string {
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

function extractMetaFromBody(raw: string): { meta: DocMeta; body: string } {
  const idx = raw.indexOf(FRONT_MATTER_BEGIN);
  if (idx === -1) return { meta: {}, body: raw };
  const endIdx = raw.indexOf(FRONT_MATTER_END, idx);
  if (endIdx === -1) return { meta: {}, body: raw };
  const fmStart = idx + FRONT_MATTER_BEGIN.length;
  const json = raw.slice(fmStart, endIdx).trim();
  let meta: DocMeta = {};
  try {
    meta = JSON.parse(json) as DocMeta;
  } catch {
    meta = {};
  }
  const after = raw.slice(endIdx + FRONT_MATTER_END.length).replace(/^\s*\n/, "");
  return { meta, body: after };
}

function buildMetaHeader(meta: DocMeta): string {
  if (!meta.comments || meta.comments.length === 0) return "";
  const json = JSON.stringify(meta);
  return `${FRONT_MATTER_BEGIN}\n${json}\n${FRONT_MATTER_END}\n\n`;
}

function countWordsAndChars(text: string): {
  words: number;
  chars: number;
  charsNoSpaces: number;
} {
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  return { words, chars, charsNoSpaces };
}

function calcLineCol(editor: Editor): { line: number; col: number } {
  const { from } = editor.state.selection;
  const before = editor.state.doc.textBetween(0, from, "\n", "\n");
  const lines = before.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

// Sanitise pasted HTML — strip <style>, comments, and inline styles we don't
// recognise. We allow: font-family, font-size, color, background-color,
// text-align, line-height, font-weight, font-style, text-decoration.
const ALLOWED_STYLE_PROPS = new Set([
  "font-family",
  "font-size",
  "color",
  "background-color",
  "text-align",
  "line-height",
  "font-weight",
  "font-style",
  "text-decoration",
]);

function sanitisePastedHtml(html: string): string {
  if (!html) return html;
  // Drop any <style> blocks and Word/Office XML scaffolding.
  let out = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?xml[^>]*>/gi, "")
    .replace(/<\/?o:p[^>]*>/gi, "")
    .replace(/<font[^>]*>/gi, "<span>")
    .replace(/<\/font>/gi, "</span>");

  // Filter inline `style="…"` attributes to the allowed set.
  out = out.replace(/style\s*=\s*"([^"]*)"/gi, (_, raw: string) => {
    const kept: string[] = [];
    raw.split(";").forEach((decl) => {
      const [k, v] = decl.split(":").map((s) => s.trim());
      if (!k || !v) return;
      if (ALLOWED_STYLE_PROPS.has(k.toLowerCase())) {
        kept.push(`${k}: ${v}`);
      }
    });
    return kept.length > 0 ? `style="${kept.join("; ")}"` : "";
  });

  return out;
}

// ---------------------------------------------------------------------------
// Toolbar primitives
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
      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md border px-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
  pendingChanges,
}: {
  status: SaveStatus;
  savedAt: string | null;
  pendingChanges: number;
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
    label = pendingChanges > 0
      ? `Unsaved · ${pendingChanges} change${pendingChanges === 1 ? "" : "s"}`
      : "Unsaved changes";
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
// Static config
// ---------------------------------------------------------------------------

const FONT_FAMILIES: { label: string; css: string }[] = [
  { label: "Sans", css: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", css: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", css: "Menlo, 'SF Mono', ui-monospace, monospace" },
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 32, 48];

const TEXT_COLORS = [
  { name: "Default", value: "" },
  { name: "Slate", value: "#64748b" },
  { name: "Gray", value: "#94a3b8" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
];

const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#fde68a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
];

const SHORTCUT_GROUPS = [
  {
    title: "Formatting",
    entries: [
      { keys: "Cmd+B", label: "Bold" },
      { keys: "Cmd+I", label: "Italic" },
      { keys: "Cmd+U", label: "Underline" },
      { keys: "Cmd+Shift+S", label: "Strikethrough" },
      { keys: "Cmd+E", label: "Inline code" },
      { keys: "Cmd+K", label: "Insert link" },
    ],
  },
  {
    title: "Blocks",
    entries: [
      { keys: "Cmd+Alt+1…6", label: "Heading 1-6" },
      { keys: "Cmd+Shift+7", label: "Numbered list" },
      { keys: "Cmd+Shift+8", label: "Bulleted list" },
      { keys: "Cmd+Shift+9", label: "Task list" },
      { keys: "Cmd+Shift+B", label: "Block quote" },
      { keys: "Cmd+Alt+C", label: "Code block" },
      { keys: "/", label: "Slash menu" },
    ],
  },
  {
    title: "Editing",
    entries: [
      { keys: "Cmd+Z / Cmd+Shift+Z", label: "Undo / Redo" },
      { keys: "Cmd+S", label: "Save now" },
      { keys: "Cmd+P", label: "Print / PDF" },
      { keys: "Cmd+Alt+M", label: "New comment" },
      { keys: "Cmd+]", label: "Indent list" },
      { keys: "Cmd+[", label: "Outdent list" },
    ],
  },
  {
    title: "Navigation",
    entries: [
      { keys: "Cmd+F", label: "Find & replace" },
      { keys: "Cmd+G", label: "Find next" },
      { keys: "Cmd+Shift+G", label: "Find previous" },
      { keys: "Cmd+/", label: "Show shortcuts" },
      { keys: "Esc", label: "Close panel" },
    ],
  },
];

// Slash extension instance — generated per-mount so each editor gets its
// own host handlers.
function makeSlashExtension(host: {
  onOpen: (props: SuggestionProps<SlashItem>) => void;
  onUpdate: (props: SuggestionProps<SlashItem>) => void;
  onClose: () => void;
  onKeyDown: (ev: KeyboardEvent) => boolean;
  setHandler: (h: (ev: KeyboardEvent) => boolean) => void;
}) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...createSlashSuggestion(host),
        }),
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// Main component
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

  // Eagerly prefetch the _pro_panels chunk on app open. The dynamic()
  // imports above defer-load it on first feature use (slash menu,
  // find/replace, outline, comments, shortcuts) which adds a perceptible
  // delay the first time. Prefetching here primes the cache so every
  // panel feels instant when invoked.
  useEffect(() => {
    void import("./_pro_panels").catch(() => {});
  }, []);

  // Lazy materializer.
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
  const [pendingChanges, setPendingChanges] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const commentsRef = useRef<CommentRecord[]>([]);
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

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
  const [showFindBar, setShowFindBar] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [palette, setPalette] = useState<{
    type: "text" | "highlight";
    pos: { top: number; left: number };
  } | null>(null);
  const [commentComposer, setCommentComposer] = useState<{
    pos: { top: number; left: number };
  } | null>(null);

  // Slash menu state — mirrors what Suggestion plugin streams to us.
  const [slashProps, setSlashProps] =
    useState<SuggestionProps<SlashItem> | null>(null);
  const [slashSelected, setSlashSelected] = useState(0);
  const slashHandlerRef = useRef<(ev: KeyboardEvent) => boolean>(() => false);

  const slashExtension = useMemo(() => {
    return makeSlashExtension({
      onOpen: (props) => {
        setSlashProps(props);
        setSlashSelected(0);
      },
      onUpdate: (props) => {
        setSlashProps(props);
        setSlashSelected((s) =>
          props.items.length > 0 ? Math.min(s, props.items.length - 1) : 0
        );
      },
      onClose: () => {
        setSlashProps(null);
        setSlashSelected(0);
      },
      onKeyDown: (ev) => slashHandlerRef.current(ev),
      setHandler: (h) => {
        slashHandlerRef.current = h;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable handler the slash plugin invokes on key events. We intercept
  // arrow / enter / escape and drive the popover state from here.
  useEffect(() => {
    slashHandlerRef.current = (ev: KeyboardEvent) => {
      if (!slashProps) return false;
      if (ev.key === "ArrowDown") {
        setSlashSelected((s) =>
          slashProps.items.length === 0
            ? 0
            : (s + 1) % slashProps.items.length
        );
        return true;
      }
      if (ev.key === "ArrowUp") {
        setSlashSelected((s) =>
          slashProps.items.length === 0
            ? 0
            : (s - 1 + slashProps.items.length) % slashProps.items.length
        );
        return true;
      }
      if (ev.key === "Enter" || ev.key === "Tab") {
        const item = slashProps.items[slashSelected];
        if (item) slashProps.command(item);
        return true;
      }
      if (ev.key === "Escape") {
        setSlashProps(null);
        return true;
      }
      return false;
    };
  }, [slashProps, slashSelected]);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: "Start writing, or type / for commands…" }),
      Table.configure({ resizable: false, HTMLAttributes: { class: "doc-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      CommentMark,
      slashExtension,
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-doc focus:outline-none",
      },
      transformPastedHTML: (html) => sanitisePastedHtml(html),
      handleDrop: (_view, ev, _slice, moved) => {
        if (moved) return false;
        const dt = (ev as DragEvent).dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return false;
        const file = dt.files[0];
        if (!file.type.startsWith("image/")) return false;
        ev.preventDefault();
        // Convert to data URL — keeps insert simple and self-contained.
        const reader = new FileReader();
        reader.onload = () => {
          const src = String(reader.result ?? "");
          editor?.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onUpdate: () => {
      if (statusRef.current !== "saving") {
        setStatus("dirty");
      }
      setPendingChanges((c) => c + 1);
      scheduleAutosave();
    },
  });

  // Cursor position state for the footer
  const [linecol, setLinecol] = useState({ line: 1, col: 1 });
  useEffect(() => {
    if (!editor) return;
    const handler = () => setLinecol(calcLineCol(editor));
    editor.on("selectionUpdate", handler);
    editor.on("update", handler);
    handler();
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("update", handler);
    };
  }, [editor]);

  // ------------------------------------------------------------------
  // Save / Open / Load
  // ------------------------------------------------------------------

  const serializeBody = useCallback(
    (e: Editor): { contentBase64: string; contentType: string } => {
      const meta: DocMeta = {
        comments: commentsRef.current,
      };
      const header = buildMetaHeader(meta);
      if (formatRef.current === "html") {
        const html = e.getHTML();
        const out = `${header}${html}`;
        return {
          contentBase64: textToBase64(out),
          contentType: "text/html",
        };
      }
      const md = docToMarkdown(e.getJSON());
      const out = `${header}${md}`;
      return {
        contentBase64: textToBase64(out),
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
      const targetExt = formatRef.current === "html" ? "html" : "md";
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
        setPendingChanges(0);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "save failed");
      }
    },
    [editor, activeId, ensured, serializeBody]
  );

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

  // Load by fileId
  const loadFileById = useCallback(
    async (id: string) => {
      if (!editor) return;
      setStatus("idle");
      setErrorMsg(null);
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/files/load-content?id=${encodeURIComponent(id)}`
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setErrorMsg(body?.error ?? `load failed (${res.status})`);
          setIsLoading(false);
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
          setSaveFormat("html");
          setComments([]);
        } else if (kind === "html") {
          const raw = base64ToText(data.contentBase64);
          const { meta, body } = extractMetaFromBody(raw);
          editor.commands.setContent(body || "<p></p>");
          setSaveFormat("html");
          setComments(meta.comments ?? []);
        } else {
          const raw = base64ToText(data.contentBase64);
          const { meta, body } = extractMetaFromBody(raw);
          editor.commands.setContent(textToTipTapHTML(body));
          setSaveFormat("markdown");
          setComments(meta.comments ?? []);
        }

        setFileId(data.file.id);
        setFileName(data.file.name);
        setSavedAt(new Date().toISOString());
        setStatus("saved");
        setPendingChanges(0);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "load failed");
      } finally {
        setIsLoading(false);
      }
    },
    [editor]
  );

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
  // Top-level commands
  // ------------------------------------------------------------------

  const newDocument = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setFileId(null);
    setFileName("Untitled.md");
    setSaveFormat("markdown");
    setStatus("idle");
    setSavedAt(null);
    setErrorMsg(null);
    setPendingChanges(0);
    setComments([]);
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

  const printDocument = useCallback(() => {
    window.print();
  }, []);

  // ------------------------------------------------------------------
  // Global key handler — Cmd+S, Cmd+F, Cmd+P, Cmd+/, Cmd+Alt+M
  // ------------------------------------------------------------------

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const root = document.querySelector('[data-tool="documents"]');
      if (!root) return;
      const active = document.activeElement;
      if (!active || !root.contains(active)) return;
      const cmd = ev.metaKey || ev.ctrlKey;
      if (cmd && (ev.key === "s" || ev.key === "S")) {
        ev.preventDefault();
        doSave({ force: true });
        return;
      }
      if (cmd && (ev.key === "f" || ev.key === "F")) {
        ev.preventDefault();
        setShowFindBar((v) => !v);
        return;
      }
      if (cmd && (ev.key === "p" || ev.key === "P")) {
        ev.preventDefault();
        printDocument();
        return;
      }
      if (cmd && ev.key === "/") {
        ev.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (cmd && ev.altKey && (ev.key === "m" || ev.key === "M")) {
        ev.preventDefault();
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        try {
          const coords = editor.view.coordsAtPos(to);
          setCommentComposer({
            pos: { top: coords.bottom + 6, left: coords.left },
          });
        } catch {
          setCommentComposer({ pos: { top: 100, left: 100 } });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave, printDocument, editor]);

  // ------------------------------------------------------------------
  // Comment commit + resolve
  // ------------------------------------------------------------------

  const commitComment = useCallback(
    (text: string) => {
      if (!editor) {
        setCommentComposer(null);
        return;
      }
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const record: CommentRecord = {
        id,
        author: "You",
        text,
        createdAt: new Date().toISOString(),
      };
      setComments((prev) => [...prev, record]);
      editor.chain().focus().setComment(id).run();
      setCommentComposer(null);
      // Mark dirty so save kicks in
      if (statusRef.current !== "saving") setStatus("dirty");
      setPendingChanges((c) => c + 1);
      scheduleAutosave();
    },
    [editor, scheduleAutosave]
  );

  const resolveComment = useCallback(
    (id: string) => {
      if (!editor) return;
      editor.chain().focus().unsetComment(id).run();
      setComments((prev) => prev.filter((c) => c.id !== id));
      if (statusRef.current !== "saving") setStatus("dirty");
      setPendingChanges((c) => c + 1);
      scheduleAutosave();
    },
    [editor, scheduleAutosave]
  );

  // ------------------------------------------------------------------
  // Word count / reading time
  // ------------------------------------------------------------------

  const stats = useMemo(() => {
    if (!editor) return { words: 0, chars: 0, charsNoSpaces: 0, readMinutes: 0 };
    const text = editor.state.doc.textContent;
    const c = countWordsAndChars(text);
    const readMinutes = Math.max(1, Math.round(c.words / 200));
    return { ...c, readMinutes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, status, pendingChanges]);

  // ------------------------------------------------------------------
  // Render guards
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
      <header className="doc-no-print flex flex-wrap items-center gap-2 border-b border-app px-3 py-2">
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
              setPendingChanges((c) => c + 1);
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
        <StatusPill status={status} savedAt={savedAt} pendingChanges={pendingChanges} />
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
        onOpenPalette={(type, ev) => {
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          setPalette({
            type,
            pos: { top: r.bottom + 6, left: r.left },
          });
        }}
        onToggleFind={() => setShowFindBar((v) => !v)}
        onToggleOutline={() => setShowOutline((v) => !v)}
        onShowShortcuts={() => setShowShortcuts(true)}
        onPrint={printDocument}
      />

      {/* Find & replace */}
      <AnimatePresence>
        {showFindBar && editor ? (
          <FindReplaceBar
            editor={editor}
            onClose={() => setShowFindBar(false)}
          />
        ) : null}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {(errorMsg || ensureError) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="doc-no-print overflow-hidden border-b border-rose-500/30 bg-rose-500/10"
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

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          data-doc-scroll
          className="relative flex-1 overflow-y-auto bg-app"
          // Click anywhere in the scroll body that isn't a child of
          // the editor (the padding margins, the empty space below
          // the document) → focus the editor at the end. Without
          // this the user has to land their cursor exactly on the
          // prose-doc text area, which feels like the editor is
          // unresponsive everywhere else.
          onMouseDown={(e) => {
            if (!editor) return;
            const t = e.target as HTMLElement;
            if (t.closest(".ProseMirror")) return;
            // Don't steal focus from interactive elements that might
            // sit in this region in the future.
            if (t.closest("button, a, input, textarea, [contenteditable]")) return;
            e.preventDefault();
            editor.chain().focus("end").run();
          }}
        >
          <div className="mx-auto max-w-3xl px-6 py-8 min-h-full">
            {isLoading ? (
              <EditorSkeleton />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
          {/* Comments overlay floats over the scroll body */}
          {editor && comments.length > 0 ? (
            <CommentsOverlay
              editor={editor}
              comments={comments}
              onResolve={resolveComment}
            />
          ) : null}
        </div>
        {/* Outline panel */}
        {showOutline && editor ? (
          <DocumentOutline
            editor={editor}
            onClose={() => setShowOutline(false)}
          />
        ) : null}
      </div>

      {/* Footer stats */}
      <footer className="doc-no-print flex flex-wrap items-center gap-3 border-t border-app bg-app-elevated px-3 py-1.5 text-[11px] text-secondary">
        <span className="font-mono tabular-nums">
          {stats.words} words · {stats.chars} chars · {stats.charsNoSpaces} no-space
        </span>
        <span className="font-mono tabular-nums">
          {stats.readMinutes} min read
        </span>
        <span className="ml-auto font-mono tabular-nums text-muted">
          Ln {linecol.line}, Col {linecol.col}
        </span>
      </footer>

      {/* Slash menu */}
      {slashProps && editor ? (
        <SlashMenu
          props={slashProps}
          selected={slashSelected}
          onPickIndex={(i) => {
            const item = slashProps.items[i];
            if (item) slashProps.command(item);
          }}
        />
      ) : null}

      {/* Color / highlight palette */}
      {palette && editor ? (
        <PalettePopover
          title={palette.type === "text" ? "Text color" : "Highlight"}
          swatches={
            palette.type === "text"
              ? TEXT_COLORS.filter((c) => c.value).map((c) => ({
                  name: c.name,
                  value: c.value,
                }))
              : HIGHLIGHT_COLORS
          }
          customLabel={palette.type === "text" ? "Apply" : undefined}
          onCustom={
            palette.type === "text"
              ? (v) => {
                  editor.chain().focus().setColor(v).run();
                  setPalette(null);
                }
              : undefined
          }
          onPick={(v) => {
            if (palette.type === "text") {
              editor.chain().focus().setColor(v).run();
            } else {
              editor.chain().focus().setHighlight({ color: v }).run();
            }
            setPalette(null);
          }}
          onClear={() => {
            if (palette.type === "text") {
              editor.chain().focus().unsetColor().run();
            } else {
              editor.chain().focus().unsetHighlight().run();
            }
            setPalette(null);
          }}
          onClose={() => setPalette(null)}
          position={palette.pos}
        />
      ) : null}

      {/* Comment composer */}
      {commentComposer ? (
        <CommentComposer
          initialText=""
          position={commentComposer.pos}
          onSubmit={commitComment}
          onCancel={() => setCommentComposer(null)}
        />
      ) : null}

      {/* Shortcut sheet */}
      <AnimatePresence>
        {showShortcuts ? (
          <ShortcutSheet
            groups={SHORTCUT_GROUPS}
            onClose={() => setShowShortcuts(false)}
          />
        ) : null}
      </AnimatePresence>

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

      {/* Editor styling */}
      <style jsx>{`
        :global([data-tool="documents"]) .prose-doc {
          min-height: 300px;
          font-size: 15px;
          line-height: 1.65;
          color: var(--text, inherit);
        }
        :global([data-tool="documents"]) .prose-doc p {
          margin: 0 0 0.85em;
        }
        :global([data-tool="documents"]) .prose-doc h1 {
          font-size: 1.85em;
          font-weight: 700;
          margin: 1em 0 0.5em;
          line-height: 1.2;
          letter-spacing: -0.01em;
        }
        :global([data-tool="documents"]) .prose-doc h2 {
          font-size: 1.45em;
          font-weight: 700;
          margin: 0.9em 0 0.4em;
          line-height: 1.25;
          letter-spacing: -0.005em;
        }
        :global([data-tool="documents"]) .prose-doc h3 {
          font-size: 1.2em;
          font-weight: 600;
          margin: 0.85em 0 0.35em;
        }
        :global([data-tool="documents"]) .prose-doc h4 {
          font-size: 1.08em;
          font-weight: 600;
          margin: 0.8em 0 0.3em;
        }
        :global([data-tool="documents"]) .prose-doc h5,
        :global([data-tool="documents"]) .prose-doc h6 {
          font-size: 1em;
          font-weight: 600;
          margin: 0.8em 0 0.3em;
          color: var(--text-secondary, inherit);
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
          background: var(--surface-strong, rgba(127,127,127,0.12));
        }
        :global([data-tool="documents"]) .prose-doc pre {
          background: var(--surface-strong, rgba(127,127,127,0.12));
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
          border: 1px solid var(--border, rgba(127,127,127,0.3));
          padding: 0.4em 0.6em;
          vertical-align: top;
          min-width: 60px;
        }
        :global([data-tool="documents"]) .prose-doc th {
          background: var(--surface, rgba(127,127,127,0.08));
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
        :global([data-tool="documents"]) .prose-doc mark {
          padding: 0.1em 0.15em;
          border-radius: 2px;
        }
        :global([data-tool="documents"]) .prose-doc .doc-comment {
          background: rgba(245, 158, 11, 0.18);
          border-bottom: 2px solid rgba(245, 158, 11, 0.6);
          border-radius: 2px;
          cursor: help;
        }
        :global([data-tool="documents"]) .prose-doc hr {
          border: none;
          border-top: 1px solid var(--border, rgba(127,127,127,0.3));
          margin: 1.4em 0;
        }
        @media print {
          :global([data-tool="documents"]) {
            background: white !important;
            color: black !important;
          }
          :global([data-tool="documents"]) .doc-no-print {
            display: none !important;
          }
          :global([data-tool="documents"]) aside {
            display: none !important;
          }
          :global([data-tool="documents"]) [data-doc-scroll] {
            overflow: visible !important;
          }
          :global([data-tool="documents"]) .prose-doc {
            color: black !important;
          }
          @page {
            size: letter;
            margin: 1in;
          }
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
  onOpenPalette,
  onToggleFind,
  onToggleOutline,
  onShowShortcuts,
  onPrint,
}: {
  editor: Editor | null;
  saveFormat: SaveFormat;
  onChangeFormat: (f: SaveFormat) => void;
  onOpenPalette: (
    type: "text" | "highlight",
    ev: React.MouseEvent<HTMLButtonElement>
  ) => void;
  onToggleFind: () => void;
  onToggleOutline: () => void;
  onShowShortcuts: () => void;
  onPrint: () => void;
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

  const currentBlock = (() => {
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    if (editor.isActive("heading", { level: 4 })) return "h4";
    if (editor.isActive("heading", { level: 5 })) return "h5";
    if (editor.isActive("heading", { level: 6 })) return "h6";
    if (editor.isActive("blockquote")) return "quote";
    if (editor.isActive("codeBlock")) return "code";
    if (editor.isActive("bulletList")) return "ul";
    if (editor.isActive("orderedList")) return "ol";
    if (editor.isActive("taskList")) return "task";
    return "p";
  })();

  const currentFontSize = editor.getAttributes("textStyle").fontSize as
    | string
    | undefined;
  const currentFontFamily = editor.getAttributes("textStyle").fontFamily as
    | string
    | undefined;

  const applyBlock = (v: string) => {
    const chain = editor.chain().focus();
    if (v === "p") chain.setParagraph().run();
    else if (v.startsWith("h")) {
      const level = Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      chain.setHeading({ level }).run();
    } else if (v === "quote") chain.setBlockquote().run();
    else if (v === "code") chain.setCodeBlock().run();
    else if (v === "ul") chain.toggleBulletList().run();
    else if (v === "ol") chain.toggleOrderedList().run();
    else if (v === "task") chain.toggleTaskList().run();
  };

  const inTable = editor.isActive("table");
  const inList =
    editor.isActive("bulletList") ||
    editor.isActive("orderedList") ||
    editor.isActive("taskList");

  return (
    <div className="doc-no-print flex flex-wrap items-center gap-1 border-b border-app bg-app-elevated px-3 py-1.5">
      {/* Block dropdown */}
      <select
        value={currentBlock}
        onChange={(e) => applyBlock(e.target.value)}
        className="h-7 rounded-md border border-app bg-app px-1.5 text-xs text-app outline-none hover:border-tool-accent/40 focus:border-tool-accent"
        title="Block style"
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="h5">Heading 5</option>
        <option value="h6">Heading 6</option>
        <option value="quote">Quote</option>
        <option value="code">Code Block</option>
        <option value="ul">Bullet List</option>
        <option value="ol">Numbered List</option>
        <option value="task">Task List</option>
      </select>

      {/* Font family */}
      <select
        value={currentFontFamily ?? ""}
        onChange={(e) => {
          if (e.target.value === "") {
            editor.chain().focus().unsetFontFamily().run();
          } else {
            editor.chain().focus().setFontFamily(e.target.value).run();
          }
        }}
        className="h-7 rounded-md border border-app bg-app px-1.5 text-xs text-app outline-none hover:border-tool-accent/40 focus:border-tool-accent"
        title="Font family"
      >
        <option value="">Sans</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.css}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <select
        value={currentFontSize ?? ""}
        onChange={(e) => {
          if (e.target.value === "") {
            editor.chain().focus().unsetFontSize().run();
          } else {
            editor.chain().focus().setFontSize(e.target.value).run();
          }
        }}
        className="h-7 w-[64px] rounded-md border border-app bg-app px-1.5 text-xs text-app outline-none hover:border-tool-accent/40 focus:border-tool-accent"
        title="Font size"
      >
        <option value="">Auto</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={`${s}px`}>
            {s}
          </option>
        ))}
      </select>

      <Sep />

      {/* Inline marks */}
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
      <ToolbarBtn
        title="Inline code (Cmd+E)"
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
      >
        <span className="font-mono">{"<>"}</span>
      </ToolbarBtn>

      <Sep />

      {/* Color + highlight */}
      <button
        type="button"
        onClick={(ev) => onOpenPalette("text", ev)}
        title="Text color"
        aria-label="Text color"
        className="flex h-7 min-w-[28px] items-center justify-center rounded-md border border-app bg-app px-1.5 text-xs text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
      >
        <span style={{ color: (editor.getAttributes("textStyle").color as string) || undefined } as CSSProperties}>
          A
        </span>
      </button>
      <button
        type="button"
        onClick={(ev) => onOpenPalette("highlight", ev)}
        title="Highlight"
        aria-label="Highlight"
        className="flex h-7 min-w-[28px] items-center justify-center rounded-md border border-app bg-app px-1.5 text-xs text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
      >
        <span
          style={{
            background:
              (editor.getAttributes("highlight").color as string) || "#fde68a",
            padding: "0 4px",
            borderRadius: 2,
            color: "#1e293b",
          }}
        >
          H
        </span>
      </button>

      <Sep />

      {/* Alignment */}
      <ToolbarBtn
        title="Align left"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
      >
        <AlignIcon dir="left" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Align center"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
      >
        <AlignIcon dir="center" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Align right"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
      >
        <AlignIcon dir="right" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Justify"
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
      >
        <AlignIcon dir="justify" />
      </ToolbarBtn>

      <Sep />

      {/* Line height */}
      <select
        value={(editor.getAttributes("textStyle").lineHeight as string) || ""}
        onChange={(e) => {
          if (e.target.value === "") {
            editor.chain().focus().unsetLineHeight().run();
          } else {
            editor.chain().focus().setLineHeight(e.target.value).run();
          }
        }}
        className="h-7 rounded-md border border-app bg-app px-1.5 text-xs text-app outline-none hover:border-tool-accent/40 focus:border-tool-accent"
        title="Line height"
      >
        <option value="">Line</option>
        <option value="1">1.0</option>
        <option value="1.15">1.15</option>
        <option value="1.5">1.5</option>
        <option value="2">2.0</option>
      </select>

      <Sep />

      {/* Lists + indent */}
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
        title="Outdent (Cmd+[)"
        disabled={!inList}
        onClick={() => {
          if (editor.isActive("taskList"))
            editor.chain().focus().liftListItem("taskItem").run();
          else editor.chain().focus().liftListItem("listItem").run();
        }}
      >
        ⇤
      </ToolbarBtn>
      <ToolbarBtn
        title="Indent (Cmd+])"
        disabled={!inList}
        onClick={() => {
          if (editor.isActive("taskList"))
            editor.chain().focus().sinkListItem("taskItem").run();
          else editor.chain().focus().sinkListItem("listItem").run();
        }}
      >
        ⇥
      </ToolbarBtn>

      <Sep />

      {/* Insert */}
      <ToolbarBtn
        title="Insert link (Cmd+K)"
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
        Link
      </ToolbarBtn>
      <ToolbarBtn
        title="Insert image"
        onClick={() => {
          const url = window.prompt("Image URL", "https://");
          if (!url) return;
          editor.chain().focus().setImage({ src: url }).run();
        }}
      >
        Img
      </ToolbarBtn>
      <TablePicker editor={editor} />
      {inTable ? (
        <>
          <ToolbarBtn
            title="Add row above"
            onClick={() => editor.chain().focus().addRowBefore().run()}
          >
            +R↑
          </ToolbarBtn>
          <ToolbarBtn
            title="Add row below"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            +R↓
          </ToolbarBtn>
          <ToolbarBtn
            title="Add column left"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
          >
            +C←
          </ToolbarBtn>
          <ToolbarBtn
            title="Add column right"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            +C→
          </ToolbarBtn>
          <ToolbarBtn
            title="Delete row"
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            -R
          </ToolbarBtn>
          <ToolbarBtn
            title="Delete column"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            -C
          </ToolbarBtn>
          <ToolbarBtn
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            ✕
          </ToolbarBtn>
        </>
      ) : null}
      <ToolbarBtn
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        ―
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
      <ToolbarBtn
        title="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        ⌫
      </ToolbarBtn>

      <Sep />

      {/* History */}
      <ToolbarBtn
        title="Undo (Cmd+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        ↶
      </ToolbarBtn>
      <ToolbarBtn
        title="Redo (Cmd+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        ↷
      </ToolbarBtn>

      <Sep />

      {/* Tools */}
      <ToolbarBtn
        title="Find & replace (Cmd+F)"
        onClick={onToggleFind}
      >
        Find
      </ToolbarBtn>
      <ToolbarBtn
        title="Toggle outline"
        onClick={onToggleOutline}
      >
        Out
      </ToolbarBtn>
      <ToolbarBtn
        title="Print / PDF (Cmd+P)"
        onClick={onPrint}
      >
        Print
      </ToolbarBtn>
      <ToolbarBtn
        title="Keyboard shortcuts (Cmd+/)"
        onClick={onShowShortcuts}
      >
        ?
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
// Table picker — small grid that lets the user pick rows × cols.
// ---------------------------------------------------------------------------

function TablePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <ToolbarBtn
        title="Insert table"
        onClick={() => setOpen((v) => !v)}
      >
        ⊞
      </ToolbarBtn>
      {open ? (
        <div className="absolute left-0 top-8 z-50 rounded-md border border-app bg-app-elevated p-2 shadow-lg">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {hover.r > 0 && hover.c > 0
              ? `${hover.r} × ${hover.c}`
              : "Pick size"}
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(8, 14px)",
              gridAutoRows: "14px",
              gap: 2,
            }}
            onMouseLeave={() => setHover({ r: 0, c: 0 })}
          >
            {Array.from({ length: 8 * 8 }).map((_, i) => {
              const r = Math.floor(i / 8) + 1;
              const c = (i % 8) + 1;
              const active = r <= hover.r && c <= hover.c;
              return (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHover({ r, c })}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: r, cols: c, withHeaderRow: true })
                      .run();
                    setOpen(false);
                  }}
                  className={`h-3.5 w-3.5 rounded-sm border ${
                    active
                      ? "border-tool-accent bg-tool-accent"
                      : "border-app bg-app"
                  }`}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlignIcon({ dir }: { dir: "left" | "center" | "right" | "justify" }) {
  const lines: Record<typeof dir, string[]> = {
    left: ["M3 5h12", "M3 9h8", "M3 13h12", "M3 17h8"],
    center: ["M5 5h10", "M7 9h6", "M5 13h10", "M7 17h6"],
    right: ["M5 5h12", "M9 9h8", "M5 13h12", "M9 17h8"],
    justify: ["M3 5h14", "M3 9h14", "M3 13h14", "M3 17h14"],
  };
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      {lines[dir].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// Re-export for tree-shaking sanity
export { bytesFromBase64 };
