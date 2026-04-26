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

interface WorkspaceFile {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
  user_id: string;
  /** Local-only: optimistic placeholder, hasn't finalized yet. */
  _pending?: boolean;
}

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

type SortMode = "newest" | "oldest" | "largest" | "name";

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
}: NativeAppProps) {
  const supabase = useMemo(() => getSupabase(), []);

  // Workspace
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(ACTIVE_WS_KEY);
      setActiveId(v && v.length > 0 ? v : null);
    } catch {
      setActiveId(null);
    }
  }, []);

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [quotaBanner, setQuotaBanner] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          .select("id, name, size_bytes, content_type, created_at, user_id")
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
    if (activeId) refresh();
    // re-list on re-open via openApp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, initialParamsKey]);

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

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/files/delete?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        /* noop */
      }
      setConfirmDeleteId(null);
      setPreviewId((p) => (p === id ? null : p));
      thumbUrlCache.delete(id);
      // Re-list from server (don't trust optimistic on delete)
      refresh();
    },
    [refresh]
  );

  // -----------------------------------------------------------------------
  // Filter + sort
  // -----------------------------------------------------------------------
  const visible = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let list = term
      ? files.filter((f) => f.name.toLowerCase().includes(term))
      : files;
    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        case "largest":
          return b.size_bytes - a.size_bytes;
        case "name":
          return a.name.localeCompare(b.name);
        case "newest":
        default:
          return Date.parse(b.created_at) - Date.parse(a.created_at);
      }
    });
    return list;
  }, [files, searchTerm, sortMode]);

  const previewFile = useMemo(
    () => visible.find((f) => f.id === previewId) ?? null,
    [visible, previewId]
  );

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
                  Drag files here, or choose from your computer
                </div>
                <div className="font-mono text-[10px] tabular-nums text-muted">
                  {activeJobCount > 0
                    ? `${activeJobCount} uploading · ${fmtBytes(activeJobBytes)}`
                    : `Free tier: ${fmtBytes(cap)} of storage`}
                </div>
              </div>
              <button
                onClick={handlePickFiles}
                className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Choose files
              </button>
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

        {/* Toolbar: search + sort */}
        <section className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
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
            {(["newest", "oldest", "largest", "name"] as SortMode[]).map((m) => (
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
              {visible.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onPreview={() => setPreviewId(file.id)}
                  onDownload={() => handleDownload(file.id, file.name)}
                  onAskDelete={() => setConfirmDeleteId(file.id)}
                  active={previewId === file.id}
                />
              ))}
            </div>
          )}
        </section>

        {listError && (
          <div className="mx-4 mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500 sm:mx-5">
            {listError}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
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
              <h3 className="text-base font-bold text-app">Delete file?</h3>
              <p className="mt-1 text-sm text-secondary">
                This permanently removes the file from R2 and the database.
                There&apos;s no undo.
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
                  Delete
                </button>
              </div>
            </motion.div>
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
  onPreview,
  onDownload,
  onAskDelete,
  active,
}: {
  file: WorkspaceFile;
  onPreview: () => void;
  onDownload: () => void;
  onAskDelete: () => void;
  active: boolean;
}) {
  const kind = classifyFile(file.content_type, file.name);
  const previewable = isPreviewable(kind);

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-xl border bg-app-elevated p-3 transition ${
        active
          ? "border-tool-accent ring-1 ring-tool-accent/40"
          : "border-app hover:border-tool-accent/40"
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
      <button
        type="button"
        onClick={previewable ? onPreview : onDownload}
        className="min-w-0 flex-1 text-left"
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

      {/* Actions */}
      <div className="flex flex-col items-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        {previewable && (
          <button
            onClick={onPreview}
            title="Open preview"
            className="rounded-md border border-app bg-app px-2 py-1 text-[10px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
          >
            Open
          </button>
        )}
        <button
          onClick={onDownload}
          title="Download"
          className="rounded-md border border-app bg-app px-2 py-1 text-[10px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
        >
          Download
        </button>
        <button
          onClick={onAskDelete}
          title="Delete"
          className="rounded-md border border-app bg-app px-2 py-1 text-[10px] font-semibold text-secondary hover:border-rose-500 hover:text-rose-500"
        >
          Delete
        </button>
      </div>
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
