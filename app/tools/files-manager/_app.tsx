"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Files Manager — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Stores files in the active workspace. Backend is server-side:
     POST  /api/files/upload    → presigned PUT URL + reserved fileId
     PUT   <presigned url>      → R2 object (client-direct, no Next proxy)
     POST  /api/files/finalize  → DB row insert
     GET   /api/files/download  → presigned GET URL
     DELETE /api/files/delete   → R2 delete + DB row delete

   Quota is read from supabase.rpc("workspace_storage", { ws_id }) and
   echoed in a top-right progress bar. Free tier = 100 MB.

   Supports drag-drop, multi-upload, per-file progress + cancel, image
   thumbnails (presigned inline GET), inline preview panel for
   image/video/audio/pdf/text, search + sort.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase/client";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const ACTIVE_WS_KEY = "workspaces:active:v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TagColor =
  | "rose"
  | "amber"
  | "emerald"
  | "sky"
  | "violet"
  | "slate";

interface Tag {
  name: string;
  color: TagColor;
}

const TAG_COLORS: TagColor[] = [
  "rose",
  "amber",
  "emerald",
  "sky",
  "violet",
  "slate",
];

/** Tailwind classes per tag color — kept in one place so chips and
 * swatches stay visually synced. Soft pill background + matching ring. */
const TAG_PILL_CLASS: Record<TagColor, string> = {
  rose: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
  amber: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
  sky: "bg-sky-500/15 text-sky-500 ring-sky-500/30",
  violet: "bg-violet-500/15 text-violet-500 ring-violet-500/30",
  slate: "bg-app-elevated text-secondary ring-app",
};

/** Solid swatch used in the color picker. */
const TAG_SWATCH_CLASS: Record<TagColor, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

interface WorkspaceFile {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
  user_id: string;
  /** Soft-delete marker. Null for live files; ISO timestamp once trashed. */
  deleted_at?: string | null;
  /** Tag chip array. Defaults to []. */
  tags?: Tag[];
  /** Local-only: optimistic placeholder, hasn't finalized yet. */
  _pending?: boolean;
}

/** Custom drag MIME type — used so drops onto Dock icons / TopBar
 * pills can recognise a Files Manager source vs a generic OS file drag. */
const SPACEFIELD_FILE_MIME = "application/x-spacefield-file";

/** localStorage key used to broadcast an in-progress drag to the rest of
 * the desktop shell (Dock, TopBar). Set on dragstart, cleared on
 * dragend. Read via DragDropOverlay. */
const SPACEFIELD_DRAG_KEY = "spacefield:drag:active:v1";

interface UploadJob {
  id: string; // local job id
  fileId: string | null; // assigned by /upload
  name: string;
  size: number;
  contentType: string;
  progress: number; // 0..100
  status: "queued" | "uploading" | "finalizing" | "done" | "error" | "cancelled" | "skipped";
  error?: string;
  controller?: AbortController;
}

type SortMode = "newest" | "oldest" | "largest" | "name" | "tag";

type FilesView = "all" | "trash";

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

function fmtRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = (Date.now() - t) / 1000;
  if (diff < 45) return "just now";
  if (diff < 90) return "a minute ago";
  if (diff < 3600) return `${Math.round(diff / 60)} minutes ago`;
  if (diff < 5400) return "an hour ago";
  if (diff < 86400) return `${Math.round(diff / 3600)} hours ago`;
  if (diff < 86400 * 1.7) return "yesterday";
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} days ago`;
  if (diff < 86400 * 365) return `${Math.round(diff / 86400 / 30)} months ago`;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return iso;
  }
}

type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "archive"
  | "other";

function classifyFile(contentType: string | null, name: string): FileKind {
  const ct = (contentType ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (ct === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/javascript" ||
    /\.(txt|md|csv|json|log|tsv|xml|yml|yaml|js|ts|tsx|jsx|css|html|sh)$/.test(n)
  )
    return "text";
  if (
    ct === "application/zip" ||
    ct === "application/x-tar" ||
    ct === "application/gzip" ||
    ct === "application/x-7z-compressed" ||
    /\.(zip|tar|gz|7z|rar)$/.test(n)
  )
    return "archive";
  return "other";
}

function isPreviewable(kind: FileKind): boolean {
  return (
    kind === "image" ||
    kind === "video" ||
    kind === "audio" ||
    kind === "pdf" ||
    kind === "text"
  );
}

/**
 * Decide whether a file should open in a dedicated editor app instead of
 * the inline preview pane. Returns the slug to dispatch to via
 * `openApp(slug, { fileId })`, or null if no editor matches (the file
 * keeps its existing inline-preview behavior).
 *
 * Extension match is the primary signal — most uploads carry a sensible
 * filename. Content-type sniffing is a fallback for the messy cases
 * (e.g. iOS sometimes labels markdown as `application/octet-stream`).
 */
function editorSlugFor(
  name: string,
  contentType: string | null
): "documents" | "sheets" | null {
  const n = name.toLowerCase();
  const ct = (contentType ?? "").toLowerCase();

  // Document-style extensions
  if (/\.(md|markdown|txt|html|htm|docx|doc|rtf)$/.test(n)) return "documents";
  // Sheet-style extensions
  if (/\.(xlsx|xls|csv|ods)$/.test(n)) return "sheets";

  // Content-type fallback (used when the filename has no useful extension)
  if (
    ct === "text/markdown" ||
    ct === "text/plain" ||
    ct === "text/html" ||
    ct === "application/rtf" ||
    ct === "application/msword" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "documents";
  }
  if (
    ct === "text/csv" ||
    ct === "application/vnd.ms-excel" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ct === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return "sheets";
  }

  return null;
}

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------------------------------------------------------------------------
// SVG icons (one per FileKind)
// ---------------------------------------------------------------------------

function FileIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const common = "h-6 w-6";
  const cls = className ?? common;
  switch (kind) {
    case "image":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M21 16l-5-5-9 9" />
        </svg>
      );
    case "video":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="14" height="14" rx="2" />
          <path d="M21 7l-4 3v4l4 3z" />
        </svg>
      );
    case "audio":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V6l11-2v12" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
      );
    case "pdf":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M9 14h2a1.5 1.5 0 010 3H9zm0 0v3" />
          <path d="M14 14v3h2" />
        </svg>
      );
    case "text":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M8 13h8M8 17h8M8 9h2" />
        </svg>
      );
    case "archive":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a2 2 0 002 2h10a2 2 0 002-2V8" />
          <path d="M11 11h2v3h-2zM11 16h2v2h-2z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M14 3v6h6" />
        </svg>
      );
  }
}

function EmptyStateIcon() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-28 w-28 text-tool-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M30 18h40l20 22v54a8 8 0 01-8 8H30a8 8 0 01-8-8V26a8 8 0 018-8z"
        fill="currentColor"
        fillOpacity={0.08}
      />
      <path d="M30 18h40l20 22v54a8 8 0 01-8 8H30a8 8 0 01-8-8V26a8 8 0 018-8z" />
      <path d="M70 18v22h20" />
      <path d="M40 70h40M40 80h28" strokeOpacity={0.5} />
      <path d="M60 50v18M51 59h18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quota indicator
// ---------------------------------------------------------------------------

function QuotaBar({
  used,
  cap,
}: {
  used: number;
  cap: number;
}) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  let toneClass = "text-emerald-500";
  let barFill = "bg-emerald-500";
  if (pct >= 95) {
    toneClass = "text-rose-500";
    barFill = "bg-rose-500";
  } else if (pct >= 70) {
    toneClass = "text-amber-500";
    barFill = "bg-amber-500";
  }
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
          Storage
        </span>
        <span className={`font-mono text-[11px] tabular-nums ${toneClass}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-elevated ring-1 ring-inset ring-app">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barFill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-muted">
        Used {fmtBytes(used)} of {fmtBytes(cap)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image thumb — fetches a presigned inline URL on demand and caches it.
// ---------------------------------------------------------------------------

const thumbUrlCache = new Map<string, string>();

function ImageThumb({ fileId, name }: { fileId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(thumbUrlCache.get(fileId) ?? null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let alive = true;
    if (url || errored) return;
    (async () => {
      try {
        const res = await fetch(`/api/files/download?id=${encodeURIComponent(fileId)}&inline=1`);
        if (!res.ok) {
          if (alive) setErrored(true);
          return;
        }
        const data = (await res.json()) as { url?: string };
        if (data.url && alive) {
          thumbUrlCache.set(fileId, data.url);
          setUrl(data.url);
        }
      } catch {
        if (alive) setErrored(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileId, url, errored]);

  if (errored || !url) {
    return (
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-app bg-tool-accent-soft text-tool-accent">
        <FileIcon kind="image" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={64}
      height={64}
      className="h-16 w-16 flex-shrink-0 rounded-lg border border-app object-cover"
    />
  );
}

// ---------------------------------------------------------------------------
// Inline Preview Panel
// ---------------------------------------------------------------------------

function PreviewPanel({
  file,
  onClose,
}: {
  file: WorkspaceFile;
  onClose: () => void;
}) {
  const kind = classifyFile(file.content_type, file.name);
  const [url, setUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrored(null);
    setUrl(null);
    setTextBody(null);
    (async () => {
      try {
        const res = await fetch(`/api/files/download?id=${encodeURIComponent(file.id)}&inline=1`);
        if (!res.ok) {
          if (alive) {
            setErrored("Couldn't load preview");
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as { url?: string };
        if (!data.url) {
          if (alive) {
            setErrored("Couldn't load preview");
            setLoading(false);
          }
          return;
        }
        if (!alive) return;
        setUrl(data.url);
        if (kind === "text") {
          try {
            const r = await fetch(data.url);
            const text = await r.text();
            if (!alive) return;
            setTextBody(text.length > 200_000 ? text.slice(0, 200_000) + "\n\n…" : text);
          } catch {
            if (alive) setErrored("Couldn't load preview");
          }
        }
        if (alive) setLoading(false);
      } catch {
        if (alive) {
          setErrored("Couldn't load preview");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [file.id, kind]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease }}
      className="overflow-hidden border-b border-app bg-app-elevated"
    >
      <div className="flex items-center gap-3 border-b border-app px-4 py-2">
        <FileIcon kind={kind} className="h-5 w-5 text-tool-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-app">{file.name}</div>
          <div className="font-mono text-[10px] tabular-nums text-muted">
            {fmtBytes(file.size_bytes)} · {file.content_type ?? "unknown"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-app text-secondary transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
          aria-label="Close preview"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-4">
        {loading && (
          <div className="flex h-48 items-center justify-center text-secondary">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]">Loading…</span>
          </div>
        )}
        {!loading && errored && (
          <div className="rounded-lg border border-app bg-app p-4 text-sm text-secondary">
            {errored}
          </div>
        )}
        {!loading && !errored && url && (
          <>
            {kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={file.name}
                className="mx-auto max-h-[480px] w-auto rounded-lg border border-app object-contain"
              />
            )}
            {kind === "video" && (
              <video
                src={url}
                controls
                className="mx-auto max-h-[480px] w-full rounded-lg border border-app bg-black"
              />
            )}
            {kind === "audio" && (
              <audio src={url} controls className="w-full" />
            )}
            {kind === "pdf" && (
              <iframe
                src={url}
                title={file.name}
                className="h-[520px] w-full rounded-lg border border-app bg-app"
              />
            )}
            {kind === "text" && (
              <pre className="max-h-[420px] overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[12px] leading-relaxed text-app">
                {textBody ?? ""}
              </pre>
            )}
            {!isPreviewable(kind) && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <FileIcon kind={kind} className="h-12 w-12 text-tool-accent" />
                <div className="text-sm text-secondary">
                  Preview not available for this file type.
                </div>
                <a
                  href={url}
                  download={file.name}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Download
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Native App
// ---------------------------------------------------------------------------

export default function FilesManagerApp({
  width,
  initialParamsKey,
  openApp,
}: NativeAppProps) {
  const supabase = useMemo(() => getSupabase(), []);

  // Workspace
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("Workspace");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(ACTIVE_WS_KEY);
      setActiveId(v && v.length > 0 ? v : null);

      // Pull the workspace's display name out of workspaces:list:v1 so
      // we can pass it to /api/workspaces/ensure below.
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

  // Lazy materializer — guarantees the workspace + owner-membership rows
  // exist in the DB before any upload/refresh is attempted. Runs once
  // per active workspace. The endpoint is idempotent so this is safe to
  // call repeatedly. Without this, a user whose client-side workspace
  // sync raced (or hasn't run) sees "0 B of 0 B" and gets a 403 on
  // upload because workspace_members has no row for them.
  //
  // The Postgres workspace_owner_quota trigger throws when the user is
  // already at their tier's max_owned_workspaces — we surface that as a
  // dedicated `ensureError` banner so the user can act on it (delete a
  // workspace or upgrade) instead of just seeing a half-broken UI.
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

        // 409 id_collision — this localStorage workspace id is already
        // used by another account in the cloud (caller signed out of
        // one account into another, but their browser kept the old
        // workspace UUID). Auto-recover: generate a fresh UUID, rename
        // every `ws:<old>:*` key to `ws:<new>:*`, fix the active-id
        // pointer + the workspaces:list entry, then reload so every
        // hook re-hydrates against the new id.
        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (body?.error === "id_collision") {
            const newId = crypto.randomUUID();
            try {
              const renames: Array<{ from: string; to: string; v: string }> =
                [];
              for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i);
                if (!k) continue;
                if (k.startsWith(`ws:${activeId}:`)) {
                  const v = window.localStorage.getItem(k);
                  if (v !== null) {
                    renames.push({
                      from: k,
                      to: `ws:${newId}:${k.slice(`ws:${activeId}:`.length)}`,
                      v,
                    });
                  }
                }
              }
              for (const r of renames) {
                window.localStorage.setItem(r.to, r.v);
                window.localStorage.removeItem(r.from);
              }
              const listRaw = window.localStorage.getItem(
                "workspaces:list:v1"
              );
              if (listRaw) {
                const list = JSON.parse(listRaw) as Array<{
                  id: string;
                  name: string;
                  createdAt: number;
                }>;
                const next = list.map((w) =>
                  w.id === activeId ? { ...w, id: newId } : w
                );
                window.localStorage.setItem(
                  "workspaces:list:v1",
                  JSON.stringify(next)
                );
              }
              window.localStorage.setItem(ACTIVE_WS_KEY, newId);
              window.location.reload();
            } catch {
              setEnsureError(
                "couldn't auto-recover from id collision — please sign out and back in"
              );
            }
            return;
          }
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const msg = body?.error ?? `could not prepare workspace (${res.status})`;
          setEnsureError(msg);
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
    // activeName change shouldn't re-trigger (rename happens elsewhere).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Recognise specific ensure failure modes so we can render actionable
  // banners. The Postgres trigger raises an exception that surfaces here
  // as a string containing "workspace limit reached". The id_collision
  // case is auto-recovered above so we don't render a banner for it.
  const ensureAtCap =
    !!ensureError && /workspace limit reached/i.test(ensureError);
  const ensureNotMember =
    !!ensureError && /not a member|caller is not a member/i.test(ensureError);

  // Data
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Quota
  const [cap, setCap] = useState(0);
  const [used, setUsed] = useState(0);

  // UI state
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Currently focused row id — Tab navigates, Spacebar opens preview. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmPermanentId, setConfirmPermanentId] = useState<string | null>(
    null
  );
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [quotaBanner, setQuotaBanner] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** All-files vs Trash view toggle. */
  const [view, setView] = useState<FilesView>("all");
  /** Active tag filter chip — clicking a tag chip filters the list. */
  const [filterTag, setFilterTag] = useState<string | null>(null);
  /** Tag editor popover state — file id whose tags are being edited. */
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  /** Lightweight toast — used for the "Moved to Trash · Undo" notice. */
  const [toast, setToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (next: NonNullable<typeof toast>) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(next);
      toastTimerRef.current = setTimeout(() => setToast(null), 5000);
    },
    []
  );
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(null);
  }, []);

  // Upload jobs
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  // Layout columns
  const cols = width >= 1100 ? 3 : width >= 700 ? 2 : 1;

  // -----------------------------------------------------------------------
  // Search debounce
  // -----------------------------------------------------------------------
  const setDebouncedSearch = useMemo(
    () => debounce((v: string) => setSearchTerm(v), 200),
    []
  );
  useEffect(() => {
    setDebouncedSearch(searchInput);
  }, [searchInput, setDebouncedSearch]);

  // -----------------------------------------------------------------------
  // List + quota loaders
  // -----------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    setListError(null);
    try {
      const [{ data: rows, error }, { data: storage }] = await Promise.all([
        supabase
          .from("workspace_files")
          .select(
            "id, name, size_bytes, content_type, created_at, user_id, deleted_at, tags"
          )
          .eq("workspace_id", activeId)
          .order("created_at", { ascending: false }),
        supabase.rpc("workspace_storage", { ws_id: activeId }),
      ]);
      if (error) {
        setFiles([]);
        setListError(null); // treat as empty
      } else {
        setFiles((rows as WorkspaceFile[] | null) ?? []);
      }
      const row = Array.isArray(storage) ? storage[0] : null;
      setCap(Number(row?.cap_bytes ?? 0));
      setUsed(Number(row?.used_bytes ?? 0));
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [activeId, supabase]);

  useEffect(() => {
    // Wait for the lazy materializer so workspace_storage returns real
    // values (not 0/0) and the membership check on upload passes.
    if (activeId && ensured) refresh();
    // re-list on re-open via openApp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, ensured, initialParamsKey]);

  // -----------------------------------------------------------------------
  // Upload pipeline
  // -----------------------------------------------------------------------
  const updateJob = useCallback(
    (jobId: string, patch: Partial<UploadJob>) => {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
    },
    []
  );

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const startUploads = useCallback(
    async (incoming: File[]) => {
      if (!activeId) return;
      // Block uploads if the workspace hasn't been materialized in DB
      // yet (or materialization failed). Without this, every file would
      // 403 with "not a member of that workspace" and we'd waste
      // presigned-URL requests against R2.
      if (!ensured) return;
      // Local pre-flight: project remaining cap, skip files that overflow.
      let projected = used;
      // Sum existing pending jobs' sizes that haven't completed yet
      for (const j of jobs) {
        if (j.status === "uploading" || j.status === "queued" || j.status === "finalizing") {
          projected += j.size;
        }
      }

      const newJobs: UploadJob[] = [];
      for (const f of incoming) {
        const id = crypto.randomUUID();
        if (cap > 0 && projected + f.size > cap) {
          newJobs.push({
            id,
            fileId: null,
            name: f.name,
            size: f.size,
            contentType: f.type || "application/octet-stream",
            progress: 0,
            status: "skipped",
            error: "Would exceed your storage quota",
          });
          continue;
        }
        projected += f.size;
        newJobs.push({
          id,
          fileId: null,
          name: f.name,
          size: f.size,
          contentType: f.type || "application/octet-stream",
          progress: 0,
          status: "queued",
        });
      }

      setJobs((prev) => [...newJobs, ...prev]);

      // Process queued jobs in parallel — backend will reject if quota
      // recovers a race between us and another tab.
      await Promise.all(
        newJobs.map(async (job, idx) => {
          if (job.status !== "queued") return;
          const file = incoming[idx];
          try {
            updateJob(job.id, { status: "uploading", progress: 0 });

            // 1) Reserve fileId + presigned URL
            const reserveRes = await fetch("/api/files/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId: activeId,
                name: job.name,
                contentType: job.contentType,
                sizeBytes: job.size,
              }),
            });
            if (!reserveRes.ok) {
              const errBody = (await reserveRes.json().catch(() => ({}))) as {
                error?: string;
              };
              if (errBody?.error === "storage_quota_exceeded") {
                setQuotaBanner(true);
              }
              updateJob(job.id, {
                status: "error",
                error: errBody?.error ?? `Upload reserve failed (${reserveRes.status})`,
              });
              return;
            }
            const { url, key, fileId } = (await reserveRes.json()) as {
              url: string;
              key: string;
              fileId: string;
            };
            updateJob(job.id, { fileId });

            // 2) PUT to R2 with XHR (progress + abort)
            const controller = new AbortController();
            updateJob(job.id, { controller });
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", url);
              xhr.setRequestHeader("Content-Type", job.contentType);
              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  const p = Math.round((ev.loaded / ev.total) * 100);
                  updateJob(job.id, { progress: p });
                }
              };
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`PUT failed (${xhr.status})`));
              };
              xhr.onerror = () => reject(new Error("Network error"));
              xhr.onabort = () => reject(new Error("aborted"));
              controller.signal.addEventListener("abort", () => xhr.abort());
              xhr.send(file);
            });

            updateJob(job.id, { status: "finalizing", progress: 100 });

            // 3) Finalize → DB row
            const finRes = await fetch("/api/files/finalize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId: activeId,
                fileId,
                key,
                name: job.name,
                contentType: job.contentType,
                sizeBytes: job.size,
              }),
            });
            if (!finRes.ok) {
              const errBody = (await finRes.json().catch(() => ({}))) as {
                error?: string;
              };
              updateJob(job.id, {
                status: "error",
                error: errBody?.error ?? `Finalize failed (${finRes.status})`,
              });
              return;
            }
            const { file: row } = (await finRes.json()) as {
              file: WorkspaceFile;
            };

            // Optimistic prepend
            setFiles((prev) => {
              if (prev.some((f) => f.id === row.id)) return prev;
              return [row, ...prev];
            });
            setUsed((u) => u + job.size);

            updateJob(job.id, { status: "done" });

            // Auto-dismiss successful job after 1.5s
            setTimeout(() => removeJob(job.id), 1500);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (msg === "aborted") {
              updateJob(job.id, { status: "cancelled", error: "Cancelled" });
            } else {
              updateJob(job.id, { status: "error", error: msg });
            }
          }
        })
      );
    },
    [activeId, used, cap, jobs, updateJob, removeJob]
  );

  const cancelJob = useCallback(
    (jobId: string) => {
      setJobs((prev) => {
        const j = prev.find((x) => x.id === jobId);
        j?.controller?.abort();
        return prev;
      });
    },
    []
  );

  // -----------------------------------------------------------------------
  // File chooser + drag-drop
  // -----------------------------------------------------------------------
  const handlePickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (list.length > 0) startUploads(list);
    },
    [startUploads]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const list = Array.from(e.dataTransfer.files ?? []);
      if (list.length > 0) startUploads(list);
    },
    [startUploads]
  );

  // -----------------------------------------------------------------------
  // Per-file actions
  // -----------------------------------------------------------------------
  const handleDownload = useCallback(async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/files/download?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { url?: string };
      if (!data.url) return;
      const a = document.createElement("a");
      a.href = data.url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* noop */
    }
  }, []);

  // Soft-delete (move to Trash). Optimistic — flip deleted_at locally,
  // call the API in the background. Show a 5s undo toast.
  const handleDelete = useCallback(
    async (id: string) => {
      const target = files.find((f) => f.id === id);
      const trashedAt = new Date().toISOString();
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, deleted_at: trashedAt } : f))
      );
      setPreviewId((p) => (p === id ? null : p));
      setSelectedId((s) => (s === id ? null : s));
      setConfirmDeleteId(null);
      try {
        await fetch("/api/files/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id }),
        });
      } catch {
        // Roll back if the API failed.
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, deleted_at: null } : f))
        );
        return;
      }
      showToast({
        message: target ? `Moved "${target.name}" to Trash` : "Moved to Trash",
        actionLabel: "Undo",
        onAction: () => {
          // Optimistic restore + server call
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, deleted_at: null } : f))
          );
          dismissToast();
          fetch("/api/files/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: id }),
          }).catch(() => {
            /* noop */
          });
        },
      });
    },
    [files, showToast, dismissToast]
  );

  const handleRestore = useCallback(
    async (id: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, deleted_at: null } : f))
      );
      try {
        await fetch("/api/files/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id }),
        });
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  // Hard-delete from Trash. Removes the R2 object + DB row. No undo.
  const handlePermanentDelete = useCallback(
    async (id: string) => {
      setConfirmPermanentId(null);
      setPreviewId((p) => (p === id ? null : p));
      setSelectedId((s) => (s === id ? null : s));
      thumbUrlCache.delete(id);
      // Optimistic — drop from local list immediately.
      setFiles((prev) => prev.filter((f) => f.id !== id));
      try {
        await fetch("/api/files/permanently-delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id }),
        });
        // Storage may have dropped — refresh quota in the background.
        refresh();
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  const handleEmptyTrash = useCallback(async () => {
    if (!activeId) return;
    const ids = files.filter((f) => !!f.deleted_at).map((f) => f.id);
    if (ids.length === 0) return;
    setFiles((prev) => prev.filter((f) => !f.deleted_at));
    try {
      await fetch("/api/files/empty-trash-older-than", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeId, days: 0 }),
      });
    } finally {
      refresh();
    }
  }, [activeId, files, refresh]);

  const handleSaveTags = useCallback(
    async (id: string, tags: Tag[]) => {
      // Optimistic update.
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, tags } : f))
      );
      try {
        const res = await fetch("/api/files/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id, tags }),
        });
        if (!res.ok) await refresh();
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  const handleRename = useCallback(
    async (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      // Optimistic update — flip the name in the visible list before
      // the round-trip lands so it feels instant.
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f))
      );
      try {
        const res = await fetch("/api/files/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id, name: trimmed }),
        });
        if (!res.ok) {
          // Roll back the optimistic flip by re-fetching the truth.
          await refresh();
        }
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  // -----------------------------------------------------------------------
  // Filter + sort
  // -----------------------------------------------------------------------

  /** Files in the current view (live or trash) — search, tag, sort all
   * derive from this. */
  const viewFiles = useMemo(() => {
    if (view === "trash") return files.filter((f) => !!f.deleted_at);
    return files.filter((f) => !f.deleted_at);
  }, [files, view]);

  /** Distinct tags across the live (non-trashed) view, ordered by most
   * recent use. Used to seed the tag editor's autocomplete + the sort
   * grouping. */
  const allTags = useMemo(() => {
    const map = new Map<string, Tag>();
    for (const f of files) {
      if (f.deleted_at) continue;
      for (const t of f.tags ?? []) {
        if (!map.has(t.name.toLowerCase())) {
          map.set(t.name.toLowerCase(), t);
        }
      }
    }
    return Array.from(map.values());
  }, [files]);

  const visible = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let list = term
      ? viewFiles.filter((f) => f.name.toLowerCase().includes(term))
      : viewFiles;
    if (filterTag) {
      const fl = filterTag.toLowerCase();
      list = list.filter((f) =>
        (f.tags ?? []).some((t) => t.name.toLowerCase() === fl)
      );
    }
    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        case "largest":
          return b.size_bytes - a.size_bytes;
        case "name":
          return a.name.localeCompare(b.name);
        case "tag": {
          // Group by primary tag name (first tag), files without tags
          // sink to the bottom. Within a group, fall back to newest.
          const at = (a.tags ?? [])[0]?.name?.toLowerCase() ?? "";
          const bt = (b.tags ?? [])[0]?.name?.toLowerCase() ?? "";
          if (at === bt) {
            return Date.parse(b.created_at) - Date.parse(a.created_at);
          }
          if (!at) return 1;
          if (!bt) return -1;
          return at.localeCompare(bt);
        }
        case "newest":
        default:
          return Date.parse(b.created_at) - Date.parse(a.created_at);
      }
    });
    return list;
  }, [viewFiles, searchTerm, sortMode, filterTag]);

  /** Bytes occupied by trashed files — surfaced in the Trash header so
   * users understand why their quota didn't drop after deleting. */
  const trashedBytes = useMemo(
    () =>
      files
        .filter((f) => !!f.deleted_at)
        .reduce((sum, f) => sum + (f.size_bytes ?? 0), 0),
    [files]
  );
  const trashedCount = useMemo(
    () => files.filter((f) => !!f.deleted_at).length,
    [files]
  );

  const previewFile = useMemo(
    () => files.find((f) => f.id === previewId) ?? null,
    [files, previewId]
  );

  // Quick Look — Spacebar on a focused row toggles the inline preview
  // pane. Esc collapses any open preview. Tab navigates between rows
  // (handled via tabIndex on each row).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (editable) return;
      if (e.key === " " || e.code === "Space") {
        if (selectedId) {
          e.preventDefault();
          setPreviewId((p) => (p === selectedId ? null : selectedId));
        }
        return;
      }
      if (e.key === "Escape") {
        if (previewId) {
          setPreviewId(null);
        } else if (filterTag) {
          setFilterTag(null);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, previewId, filterTag]);

  // -----------------------------------------------------------------------
  // Selection summary for upload area
  // -----------------------------------------------------------------------
  const activeJobCount = jobs.filter(
    (j) => j.status === "uploading" || j.status === "queued" || j.status === "finalizing"
  ).length;
  const activeJobBytes = jobs
    .filter((j) => j.status === "uploading" || j.status === "queued" || j.status === "finalizing")
    .reduce((sum, j) => sum + j.size, 0);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!activeId) {
    return (
      <div
        data-tool-theme="files"
        data-tool="files-manager"
        className="flex h-full w-full items-center justify-center bg-app p-8"
      >
        <div className="max-w-sm text-center">
          <FileIcon kind="other" className="mx-auto mb-3 h-10 w-10 text-tool-accent" />
          <h2 className="text-base font-bold text-app">No workspace open</h2>
          <p className="mt-1 text-sm text-secondary">
            Files are scoped to a workspace. Open or create one in the desktop, then come back here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tool-theme="files"
      data-tool="files-manager"
      className="relative flex h-full w-full flex-col overflow-hidden bg-app text-app"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-tool-accent-soft" />
            <div className="relative rounded-2xl border-2 border-dashed border-tool-accent bg-app-elevated/95 px-8 py-6 text-center shadow-xl">
              <FileIcon kind="other" className="mx-auto mb-2 h-8 w-8 text-tool-accent" />
              <div className="text-sm font-bold text-tool-accent">Drop to upload</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

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
        <div className="relative flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-tool-accent-soft ring-1 ring-tool-accent/40">
            <FileIcon kind="other" className="h-5 w-5 text-tool-accent" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tool-accent">
              Workspace · Files
            </p>
            <h1 className="text-[1.05rem] font-bold tracking-tight text-app">
              Files Manager
            </h1>
          </div>
          <div className="ml-auto">
            <QuotaBar used={used} cap={cap} />
          </div>
        </div>
      </header>

      {/* Workspace materialization error — at-cap or other */}
      <AnimatePresence>
        {ensureAtCap && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-amber-400/30 bg-amber-400/10"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
              <span className="font-semibold text-amber-300">
                Workspace not active
              </span>
              <span className="text-secondary">
                Your plan&apos;s workspace limit is reached, so this
                workspace was created locally but couldn&apos;t be saved
                to the cloud. Upload won&apos;t work here. Switch to your
                primary workspace, delete one, or upgrade.
              </span>
              <a
                href="/pricing"
                className="ml-auto rounded-md bg-tool-accent px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                Upgrade
              </a>
            </div>
          </motion.div>
        )}
        {ensureNotMember && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-rose-500/30 bg-rose-500/10"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
              <span className="font-semibold text-rose-400">
                Not a member
              </span>
              <span className="text-secondary">
                This workspace exists in the cloud but you&apos;re not a
                member. Ask the owner to invite you, or switch to a
                workspace you own.
              </span>
            </div>
          </motion.div>
        )}
        {ensureError && !ensureAtCap && !ensureNotMember && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-rose-500/30 bg-rose-500/10"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
              <span className="font-semibold text-rose-400">
                Couldn&apos;t prepare workspace
              </span>
              <span className="text-secondary">{ensureError}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quota banner */}
      <AnimatePresence>
        {quotaBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-rose-500/30 bg-rose-500/10"
          >
            <div className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="text-rose-500 font-semibold">Out of space</span>
              <span className="text-secondary">
                Some uploads were rejected. Upgrade your plan for more storage.
              </span>
              <a
                href="/pricing"
                className="ml-auto rounded-md bg-tool-accent px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                See pricing
              </a>
              <button
                onClick={() => setQuotaBanner(false)}
                className="rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto">
        {/* Upload area */}
        <section className="px-4 pt-4 sm:px-5">
          <div
            className={`relative flex flex-col gap-3 rounded-2xl border-2 border-dashed p-5 transition ${
              dragging
                ? "border-tool-accent bg-tool-accent-soft"
                : "border-app bg-app-elevated"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tool-accent-soft text-tool-accent">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4" />
                  <path d="M6 10l6-6 6 6" />
                  <path d="M4 20h16" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-app">
                  {ensureError
                    ? "Workspace not ready"
                    : !ensured
                    ? "Preparing workspace…"
                    : "Drag files here, or choose from your computer"}
                </div>
                <div className="font-mono text-[10px] tabular-nums text-muted">
                  {activeJobCount > 0
                    ? `${activeJobCount} uploading · ${fmtBytes(activeJobBytes)}`
                    : ensured && cap > 0
                    ? `${fmtBytes(cap)} of storage available`
                    : ensureError
                    ? "Resolve the issue above to upload"
                    : "Connecting to your workspace…"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openApp("documents", {})}
                  disabled={!ensured}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + New document
                </button>
                <button
                  onClick={() => openApp("sheets", {})}
                  disabled={!ensured}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + New sheet
                </button>
                <button
                  onClick={handlePickFiles}
                  disabled={!ensured}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Choose files
                </button>
              </div>
            </div>

            {/* Job list */}
            <AnimatePresence>
              {jobs.length > 0 && (
                <motion.ul
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-1.5 border-t border-app pt-3"
                >
                  {jobs.map((j) => (
                    <li
                      key={j.id}
                      className="flex items-center gap-3 rounded-lg border border-app bg-app px-3 py-2"
                    >
                      <FileIcon
                        kind={classifyFile(j.contentType, j.name)}
                        className="h-4 w-4 text-tool-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-xs font-medium text-app">
                            {j.name}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-muted">
                            {fmtBytes(j.size)}
                          </span>
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-app-elevated">
                          <div
                            className={`h-full transition-all duration-200 ${
                              j.status === "error" || j.status === "skipped"
                                ? "bg-rose-500"
                                : j.status === "cancelled"
                                ? "bg-app"
                                : j.status === "done"
                                ? "bg-emerald-500"
                                : "bg-tool-accent"
                            }`}
                            style={{
                              width:
                                j.status === "error" ||
                                j.status === "skipped" ||
                                j.status === "cancelled"
                                  ? "100%"
                                  : `${j.progress}%`,
                            }}
                          />
                        </div>
                        {j.error && (
                          <div className="mt-1 text-[10px] text-rose-500">
                            {j.error}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {j.status === "uploading" && (
                          <button
                            onClick={() => cancelJob(j.id)}
                            className="rounded-md border border-app px-2 py-1 text-[10px] font-semibold text-secondary hover:border-rose-500 hover:text-rose-500"
                          >
                            Cancel
                          </button>
                        )}
                        {(j.status === "error" ||
                          j.status === "skipped" ||
                          j.status === "cancelled" ||
                          j.status === "done") && (
                          <button
                            onClick={() => removeJob(j.id)}
                            className="rounded-md border border-app px-2 py-1 text-[10px] font-semibold text-secondary hover:text-app"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Toolbar: view toggle + search + sort */}
        <section className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
          {/* All / Trash view toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-app bg-app-elevated p-0.5 text-[11px]">
            <button
              onClick={() => setView("all")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                view === "all"
                  ? "bg-tool-accent text-white"
                  : "text-secondary hover:text-app"
              }`}
            >
              All files
            </button>
            <button
              onClick={() => setView("trash")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                view === "trash"
                  ? "bg-tool-accent text-white"
                  : "text-secondary hover:text-app"
              }`}
            >
              Trash{trashedCount > 0 ? ` · ${trashedCount}` : ""}
            </button>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-md">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input
              type="search"
              placeholder="Search files…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-app bg-app-elevated py-1.5 pl-8 pr-3 text-sm text-app outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/30"
            />
          </div>

          <div className="ml-auto flex items-center gap-1 rounded-lg border border-app bg-app-elevated p-0.5 text-[11px]">
            {(
              ["newest", "oldest", "largest", "name", "tag"] as SortMode[]
            ).map((m) => (
              <button
                key={m}
                onClick={() => setSortMode(m)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                  sortMode === m
                    ? "bg-tool-accent text-white"
                    : "text-secondary hover:text-app"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] tabular-nums text-muted">
            {visible.length} {visible.length === 1 ? "file" : "files"}
          </span>
        </section>

        {/* Trash banner — confirm what view they're in + Empty Trash CTA */}
        {view === "trash" && (
          <section className="px-4 pt-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-app bg-app-elevated px-4 py-2.5">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-tool-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-app">
                  Trashed files still count against your storage
                </div>
                <div className="font-mono text-[10px] tabular-nums text-muted">
                  {trashedCount} {trashedCount === 1 ? "file" : "files"} ·{" "}
                  {fmtBytes(trashedBytes)}
                </div>
              </div>
              <button
                onClick={handleEmptyTrash}
                disabled={trashedCount === 0}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Empty Trash
              </button>
            </div>
          </section>
        )}

        {/* Tag filter pill row — render only when at least one tag exists */}
        {view === "all" && allTags.length > 0 && (
          <section className="flex flex-wrap items-center gap-1.5 px-4 pt-3 sm:px-5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Tags
            </span>
            <button
              onClick={() => setFilterTag(null)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition ${
                filterTag === null
                  ? "bg-tool-accent text-white ring-tool-accent"
                  : "bg-app-elevated text-secondary ring-app hover:text-app"
              }`}
            >
              All
            </button>
            {allTags.map((t) => {
              const active = filterTag?.toLowerCase() === t.name.toLowerCase();
              return (
                <button
                  key={t.name}
                  onClick={() => setFilterTag(active ? null : t.name)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition ${
                    active
                      ? `${TAG_PILL_CLASS[t.color]} ring-2`
                      : `${TAG_PILL_CLASS[t.color]} hover:ring-2`
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </section>
        )}

        {/* Inline preview panel */}
        <AnimatePresence>
          {previewFile && (
            <div className="px-4 pt-3 sm:px-5">
              <PreviewPanel
                file={previewFile}
                onClose={() => setPreviewId(null)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* File grid */}
        <section className="px-4 pb-6 pt-4 sm:px-5">
          {loading && files.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-secondary">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em]">
                Loading files…
              </span>
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              hasSearch={!!searchTerm}
              hasFiles={files.length > 0}
              onChoose={handlePickFiles}
            />
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {visible.map((file) => {
                const editorSlug = editorSlugFor(file.name, file.content_type);
                return (
                  <FileCard
                    key={file.id}
                    file={file}
                    editorSlug={editorSlug}
                    view={view}
                    onPreview={() => {
                      setSelectedId(file.id);
                      setPreviewId(file.id);
                    }}
                    onOpenInEditor={
                      editorSlug
                        ? () => openApp(editorSlug, { fileId: file.id })
                        : undefined
                    }
                    onDownload={() => handleDownload(file.id, file.name)}
                    onAskRename={() => {
                      setRenameId(file.id);
                      setRenameDraft(file.name);
                    }}
                    onAskDelete={() => setConfirmDeleteId(file.id)}
                    onAskTag={() => setTagEditorId(file.id)}
                    onTagClick={(name) => setFilterTag(name)}
                    onRestore={() => handleRestore(file.id)}
                    onAskPermanentDelete={() =>
                      setConfirmPermanentId(file.id)
                    }
                    onSelect={() => setSelectedId(file.id)}
                    selected={selectedId === file.id}
                    active={previewId === file.id}
                  />
                );
              })}
            </div>
          )}
        </section>

        {listError && (
          <div className="mx-4 mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500 sm:mx-5">
            {listError}
          </div>
        )}
      </div>

      {/* Move-to-Trash confirmation */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmDeleteId(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl border border-app bg-app-elevated p-5 shadow-2xl"
            >
              <h3 className="text-base font-bold text-app">
                Move file to Trash?
              </h3>
              <p className="mt-1 text-sm text-secondary">
                You can restore it from the Trash view. Trashed files still
                count against your storage until you empty the Trash.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-secondary hover:text-app"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                >
                  Move to Trash
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permanent-delete confirmation (Trash view) */}
      <AnimatePresence>
        {confirmPermanentId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmPermanentId(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl border border-app bg-app-elevated p-5 shadow-2xl"
            >
              <h3 className="text-base font-bold text-app">Delete forever?</h3>
              <p className="mt-1 text-sm text-secondary">
                This permanently removes the file from R2 and the database.
                There&apos;s no undo.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmPermanentId(null)}
                  className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-secondary hover:text-app"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePermanentDelete(confirmPermanentId)}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                >
                  Delete forever
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tag editor popover */}
      <AnimatePresence>
        {tagEditorId && (
          <TagEditorDialog
            file={files.find((f) => f.id === tagEditorId) ?? null}
            onClose={() => setTagEditorId(null)}
            onSave={(tags) => {
              const id = tagEditorId;
              if (id) handleSaveTags(id, tags);
              setTagEditorId(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Undo / status toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2"
          >
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-app bg-app-elevated px-4 py-2 shadow-2xl">
              <span className="text-xs font-medium text-app">
                {toast.message}
              </span>
              {toast.actionLabel && toast.onAction && (
                <button
                  onClick={toast.onAction}
                  className="rounded-full bg-tool-accent px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  {toast.actionLabel}
                </button>
              )}
              <button
                onClick={dismissToast}
                aria-label="Dismiss"
                className="text-secondary hover:text-app"
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag-drop overlay — listens for active inter-app drags so we can
       * route a Files Manager drag onto the Dock or TopBar workspace
       * pills. Self-contained component, fixed position. */}
      <DragDropOverlay openApp={openApp} activeWorkspaceId={activeId} />

      {/* Rename dialog */}
      <AnimatePresence>
        {renameId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRenameId(null);
            }}
          >
            <motion.form
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (renameId && renameDraft.trim()) {
                  void handleRename(renameId, renameDraft);
                }
                setRenameId(null);
              }}
              className="w-full max-w-sm rounded-2xl border border-app bg-app-elevated p-5 shadow-2xl"
            >
              <h3 className="text-base font-bold text-app">Rename file</h3>
              <label className="mt-4 block">
                <span className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">
                  Name
                </span>
                <input
                  autoFocus
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  maxLength={200}
                  className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
                />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameId(null)}
                  className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-secondary hover:text-app"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameDraft.trim()}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File card (subcomponent)
// ---------------------------------------------------------------------------

function FileCard({
  file,
  editorSlug,
  view,
  onPreview,
  onOpenInEditor,
  onDownload,
  onAskRename,
  onAskDelete,
  onAskTag,
  onTagClick,
  onRestore,
  onAskPermanentDelete,
  onSelect,
  selected,
  active,
}: {
  file: WorkspaceFile;
  editorSlug: "documents" | "sheets" | null;
  view: FilesView;
  onPreview: () => void;
  onOpenInEditor?: () => void;
  onDownload: () => void;
  onAskRename: () => void;
  onAskDelete: () => void;
  onAskTag: () => void;
  onTagClick: (name: string) => void;
  onRestore: () => void;
  onAskPermanentDelete: () => void;
  onSelect: () => void;
  selected: boolean;
  active: boolean;
}) {
  const kind = classifyFile(file.content_type, file.name);
  const previewable = isPreviewable(kind);

  const inTrash = view === "trash";

  // Primary body-click behavior:
  //   - in trash → preview only (no editor open from trashed file)
  //   - editor file → open in editor app
  //   - previewable → open inline preview
  //   - else → download
  const onBodyClick = inTrash
    ? onPreview
    : editorSlug && onOpenInEditor
    ? onOpenInEditor
    : previewable
    ? onPreview
    : onDownload;

  // Drag start: hand off the file metadata via the custom MIME type so
  // the global DragDropOverlay can route the drop. dragend cleans up.
  const onDragStart = (e: React.DragEvent) => {
    if (inTrash) {
      e.preventDefault();
      return;
    }
    const payload = {
      fileId: file.id,
      name: file.name,
      contentType: file.content_type ?? "",
      editorSlug,
    };
    e.dataTransfer.effectAllowed = "copyMove";
    try {
      e.dataTransfer.setData(
        SPACEFIELD_FILE_MIME,
        JSON.stringify(payload)
      );
      e.dataTransfer.setData("text/plain", file.name);
    } catch {
      try {
        e.dataTransfer.setData("text/plain", file.name);
      } catch {
        /* noop */
      }
    }
    try {
      window.localStorage.setItem(
        SPACEFIELD_DRAG_KEY,
        JSON.stringify(payload)
      );
      window.dispatchEvent(new CustomEvent("spacefield:drag-start"));
    } catch {
      /* noop */
    }
  };
  const onDragEnd = () => {
    try {
      window.localStorage.removeItem(SPACEFIELD_DRAG_KEY);
      window.dispatchEvent(new CustomEvent("spacefield:drag-end"));
    } catch {
      /* noop */
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onAskTag();
  };

  const onRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onBodyClick();
    }
  };

  const tagsToShow = (file.tags ?? []).slice(0, 3);
  const tagsHidden = Math.max(0, (file.tags ?? []).length - 3);

  return (
    <div
      tabIndex={0}
      role="button"
      onFocus={onSelect}
      onClick={onSelect}
      onKeyDown={onRowKeyDown}
      onContextMenu={onContextMenu}
      draggable={!inTrash}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative flex items-center gap-3 rounded-xl border bg-app-elevated p-3 transition outline-none ${
        active || selected
          ? "border-tool-accent ring-1 ring-tool-accent/40"
          : "border-app hover:border-tool-accent/40 focus-visible:border-tool-accent focus-visible:ring-1 focus-visible:ring-tool-accent/40"
      }`}
    >
      {/* Thumb */}
      {kind === "image" ? (
        <ImageThumb fileId={file.id} name={file.name} />
      ) : (
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-app bg-tool-accent-soft text-tool-accent">
          <FileIcon kind={kind} className="h-7 w-7" />
        </div>
      )}

      {/* Body */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBodyClick();
          }}
          className="block w-full text-left"
        >
          <div className="truncate text-sm font-semibold text-app group-hover:text-tool-accent">
            {file.name}
          </div>
          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-muted">
            {fmtBytes(file.size_bytes)} · {fmtRelativeTime(file.created_at)}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-secondary">
            {kind === "other" ? file.content_type ?? "file" : kind}
          </div>
        </button>

        {/* Tag chip row */}
        {tagsToShow.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {tagsToShow.map((t) => (
              <button
                key={t.name}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(t.name);
                }}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition hover:ring-2 ${TAG_PILL_CLASS[t.color]}`}
              >
                {t.name}
              </button>
            ))}
            {tagsHidden > 0 && (
              <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-app">
                +{tagsHidden} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        {inTrash ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              title="Restore from Trash"
              aria-label="Restore"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-emerald-500/40 hover:text-emerald-500"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1015.5-6.3" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAskPermanentDelete();
              }}
              title="Delete forever"
              aria-label="Delete forever"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-rose-500 hover:text-rose-500"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </>
        ) : (
          <>
            {editorSlug && onOpenInEditor && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInEditor();
                }}
                title={
                  editorSlug === "sheets"
                    ? "Open in spreadsheet editor"
                    : "Open in document editor"
                }
                aria-label="Open in editor"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-8 8" />
                  <path d="M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
                </svg>
              </button>
            )}
            {previewable && !editorSlug && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview();
                }}
                title="Open preview"
                aria-label="Open preview"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              title="Download"
              aria-label="Download"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4v12" />
                <path d="M6 14l6 6 6-6" />
                <path d="M4 22h16" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAskTag();
              }}
              title="Tag"
              aria-label="Tag"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                <circle cx="7" cy="7" r="1.4" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAskRename();
              }}
              title="Rename"
              aria-label="Rename"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAskDelete();
              }}
              title="Move to Trash"
              aria-label="Move to Trash"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app text-secondary hover:border-rose-500 hover:text-rose-500"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag editor dialog — input + color swatches + existing tag list
// ---------------------------------------------------------------------------

function TagEditorDialog({
  file,
  onClose,
  onSave,
}: {
  file: WorkspaceFile | null;
  onClose: () => void;
  onSave: (tags: Tag[]) => void;
}) {
  const [draft, setDraft] = useState<Tag[]>(file?.tags ?? []);
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("sky");

  const addTag = () => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    if (
      draft.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setName("");
      return;
    }
    if (draft.length >= 12) return;
    setDraft([...draft, { name: trimmed, color }]);
    setName("");
  };

  const removeTag = (n: string) => {
    setDraft(draft.filter((t) => t.name.toLowerCase() !== n.toLowerCase()));
  };

  if (!file) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="w-full max-w-sm rounded-2xl border border-app bg-app-elevated p-5 shadow-2xl"
      >
        <h3 className="text-base font-bold text-app">Tags</h3>
        <p className="mt-1 truncate text-xs text-muted">{file.name}</p>

        {/* Existing tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {draft.length === 0 && (
            <span className="text-xs text-secondary">No tags yet.</span>
          )}
          {draft.map((t) => (
            <span
              key={t.name}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${TAG_PILL_CLASS[t.color]}`}
            >
              {t.name}
              <button
                onClick={() => removeTag(t.name)}
                aria-label={`Remove ${t.name}`}
                className="opacity-70 hover:opacity-100"
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        {/* Add new */}
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Add tag
          </label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              maxLength={32}
              placeholder="e.g. contracts"
              className="flex-1 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            />
            <button
              onClick={addTag}
              disabled={!name.trim() || draft.length >= 12}
              className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <div className="flex items-center gap-2">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={`h-5 w-5 rounded-full ${TAG_SWATCH_CLASS[c]} transition ring-offset-2 ring-offset-app-elevated ${
                  color === c ? "ring-2 ring-tool-accent" : "ring-1 ring-app"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-secondary hover:text-app"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Drag-drop overlay — listens for in-progress Files Manager drags, paints
// a contextual hint near the cursor, and routes drops onto the dock /
// workspace pills via `data-drop-target` / `data-drop-workspace` attrs
// the Dock + TopBar can opt into.
// ---------------------------------------------------------------------------

function DragDropOverlay({
  openApp,
  activeWorkspaceId,
}: {
  openApp: (slug: string, params?: Record<string, unknown>) => void;
  activeWorkspaceId: string | null;
}) {
  const [active, setActive] = useState<{
    fileId: string;
    name: string;
    contentType: string;
    editorSlug: "documents" | "sheets" | null;
  } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const readActive = () => {
      try {
        const raw = window.localStorage.getItem(SPACEFIELD_DRAG_KEY);
        if (!raw) {
          setActive(null);
          return;
        }
        const parsed = JSON.parse(raw) as {
          fileId?: string;
          name?: string;
          contentType?: string;
          editorSlug?: "documents" | "sheets" | null;
        };
        if (parsed.fileId && parsed.name) {
          setActive({
            fileId: parsed.fileId,
            name: parsed.name,
            contentType: parsed.contentType ?? "",
            editorSlug: parsed.editorSlug ?? null,
          });
        }
      } catch {
        setActive(null);
      }
    };
    const onStart = () => readActive();
    const onEnd = () => setActive(null);
    const onMove = (e: DragEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    const onDrop = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      if (!types || ![...types].includes(SPACEFIELD_FILE_MIME)) return;
      try {
        const raw = e.dataTransfer?.getData(SPACEFIELD_FILE_MIME);
        if (!raw) return;
        const payload = JSON.parse(raw) as {
          fileId?: string;
          editorSlug?: "documents" | "sheets" | null;
        };
        // Walk up the DOM looking for an opt-in drop target.
        let target: HTMLElement | null = e.target as HTMLElement | null;
        let dropSlug: string | null = null;
        let dropWorkspace: string | null = null;
        while (target) {
          const slug = target.getAttribute?.("data-drop-target");
          if (slug) {
            dropSlug = slug;
            dropWorkspace = target.getAttribute("data-drop-workspace");
            break;
          }
          target = target.parentElement;
        }
        if (dropSlug === "workspace" && dropWorkspace && payload.fileId) {
          if (!activeWorkspaceId || dropWorkspace === activeWorkspaceId) {
            return;
          }
          fetch("/api/files/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId: payload.fileId,
              destinationWorkspaceId: dropWorkspace,
            }),
          }).catch(() => {
            /* noop — silent for v1 */
          });
          return;
        }
        if (dropSlug && payload.fileId) {
          // Route only to editor-compatible apps; ignore for others.
          if (dropSlug === "documents" || dropSlug === "sheets") {
            openApp(dropSlug, { fileId: payload.fileId });
          }
          return;
        }
        // No explicit drop target — default to opening the editor app
        // matching the file (if there is one).
        if (payload.editorSlug && payload.fileId) {
          openApp(payload.editorSlug, { fileId: payload.fileId });
        }
      } catch {
        /* noop */
      } finally {
        try {
          window.localStorage.removeItem(SPACEFIELD_DRAG_KEY);
        } catch {
          /* noop */
        }
        setActive(null);
      }
    };

    window.addEventListener("spacefield:drag-start", onStart);
    window.addEventListener("spacefield:drag-end", onEnd);
    window.addEventListener("dragover", onMove);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onEnd);
    return () => {
      window.removeEventListener("spacefield:drag-start", onStart);
      window.removeEventListener("spacefield:drag-end", onEnd);
      window.removeEventListener("dragover", onMove);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onEnd);
    };
  }, [openApp, activeWorkspaceId]);

  if (!active) return null;
  const hint = active.editorSlug
    ? active.editorSlug === "sheets"
      ? "Drop to open in Sheets"
      : "Drop to open in Documents"
    : `Drag "${active.name}"`;

  return (
    <div
      className="pointer-events-none fixed z-[60] rounded-full border border-app bg-app-elevated px-3 py-1 text-[11px] font-semibold text-app shadow-2xl"
      style={{
        left: pos.x + 14,
        top: pos.y + 14,
      }}
    >
      {hint}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasSearch,
  hasFiles,
  onChoose,
}: {
  hasSearch: boolean;
  hasFiles: boolean;
  onChoose: () => void;
}) {
  if (hasSearch && hasFiles) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileIcon kind="other" className="mb-3 h-10 w-10 text-tool-accent" />
        <h3 className="text-sm font-bold text-app">No files match your search.</h3>
        <p className="mt-1 max-w-xs text-xs text-secondary">
          Try a different word or clear the search box.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <EmptyStateIcon />
      <h3 className="mt-3 text-base font-bold text-app">
        Drag files here to upload
      </h3>
      <p className="mt-1 max-w-xs text-sm text-secondary">
        Anything you upload here is shared with everyone in this workspace.
      </p>
      <button
        onClick={onChoose}
        className="mt-4 rounded-lg bg-tool-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
      >
        Choose files
      </button>
    </div>
  );
}
