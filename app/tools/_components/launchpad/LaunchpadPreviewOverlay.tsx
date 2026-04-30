"use client";

/* LaunchpadPreviewOverlay — fullscreen-ish "Quick Look" modal for files
 * surfaced from any Launchpad pane.
 *
 * Reachable via the file context menu's "Quick Look" entry. The modal:
 *   - Shows the file inline based on kind:
 *       image → <img>
 *       video → <video controls> (autoplay muted)
 *       pdf   → <iframe>
 *       audio → <audio controls>
 *       document/sheet → "Open in Documents"/"Open in Sheets" CTA
 *       other → "No preview available — Download" fallback
 *   - Arrow-key navigation: ← / → cycles through the adjacent files in
 *     the current view. Esc closes.
 *
 * The download URL is fetched lazily from /api/files/download (which
 * returns a presigned R2 URL) the first time we show a given file id.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fileKind, type LaunchpadFile } from "./launchpadFiles";

interface Props {
  /** All files in the surrounding view; used for ←/→ navigation. */
  files: LaunchpadFile[];
  /** Currently focused file id. The modal opens when this is non-null. */
  fileId: string | null;
  /** Tool slug to dispatch when the file is best handled by an editor
   * (documents / sheets). Caller routes via `openTool`. */
  onOpenInTool?: (slug: "documents" | "sheets", fileId: string) => void;
  onClose: () => void;
}

type PreviewKind = "image" | "video" | "audio" | "pdf" | "editor" | "other";

function previewKindFor(file: LaunchpadFile): PreviewKind {
  const ct = (file.content_type ?? "").toLowerCase();
  const name = file.name.toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (ct === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  const k = fileKind(file);
  if (k === "document" || k === "sheet") return "editor";
  return "other";
}

export default function LaunchpadPreviewOverlay({
  files,
  fileId,
  onOpenInTool,
  onClose,
}: Props) {
  const idx = useMemo(
    () => files.findIndex((f) => f.id === fileId),
    [files, fileId]
  );
  const file = idx >= 0 ? files[idx] : null;

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  // Reset url when the focused file changes.
  useEffect(() => {
    setDownloadUrl(null);
    if (!file) return;
    let cancelled = false;
    setLoadingUrl(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/files/download?id=${encodeURIComponent(file.id)}&inline=1`
        );
        if (!res.ok) return;
        const j = (await res.json()) as { url?: string };
        if (cancelled) return;
        setDownloadUrl(j.url ?? null);
      } catch {
        /* leave as null — fallback CTAs handle it */
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const goPrev = useCallback(() => {
    if (files.length === 0 || idx < 0) return;
    const next = (idx - 1 + files.length) % files.length;
    // Ask the parent to switch focus by closing + reopening with a new
    // id — but we already drive entirely off `fileId`, so we expose a
    // simpler approach: emit a custom event the host listens for.
    window.dispatchEvent(
      new CustomEvent<string>("launchpad:preview-set", {
        detail: files[next].id,
      })
    );
  }, [files, idx]);

  const goNext = useCallback(() => {
    if (files.length === 0 || idx < 0) return;
    const next = (idx + 1) % files.length;
    window.dispatchEvent(
      new CustomEvent<string>("launchpad:preview-set", {
        detail: files[next].id,
      })
    );
  }, [files, idx]);

  // Keyboard nav: Esc closes, ← → cycle.
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose, goPrev, goNext]);

  if (!file) return null;
  const kind = previewKindFor(file);

  return (
    <AnimatePresence>
      <motion.div
        key={file.id}
        role="dialog"
        aria-label={`Preview ${file.name}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // Sits above the Launchpad window's z-index (75) so it covers
        // the entire app shell. Click-outside closes; the inner card
        // stops propagation so users can interact with the media.
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.97, opacity: 0 }}
          className="sf-glass-window relative flex h-[85vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sf-glass-titlebar flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-app">
                {file.name}
              </div>
              <div className="truncate text-[11px] text-muted">
                {file.content_type || "Unknown type"}
              </div>
            </div>
            {files.length > 1 && (
              <div className="flex items-center gap-1 text-[11px] text-secondary">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Previous file"
                  className="rounded-md border border-app/60 px-2 py-0.5 hover:bg-surface hover:text-app"
                >
                  ←
                </button>
                <span className="px-1 text-muted">
                  {idx + 1} / {files.length}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Next file"
                  className="rounded-md border border-app/60 px-2 py-0.5 hover:bg-surface hover:text-app"
                >
                  →
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-md border border-app/60 px-2 py-0.5 text-[11px] text-secondary hover:bg-surface hover:text-app"
            >
              Close
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 items-center justify-center overflow-hidden bg-black/10 p-4">
            {loadingUrl && !downloadUrl ? (
              <div className="text-sm text-muted">Loading preview…</div>
            ) : !downloadUrl && kind !== "editor" && kind !== "other" ? (
              <div className="text-sm text-muted">
                Couldn&apos;t load preview.
              </div>
            ) : kind === "image" && downloadUrl ? (
              <img
                src={downloadUrl}
                alt={file.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : kind === "video" && downloadUrl ? (
              <video
                src={downloadUrl}
                controls
                autoPlay
                muted
                className="max-h-full max-w-full"
              />
            ) : kind === "audio" && downloadUrl ? (
              <audio src={downloadUrl} controls className="w-full max-w-md" />
            ) : kind === "pdf" && downloadUrl ? (
              <iframe
                src={downloadUrl}
                title={file.name}
                className="h-full w-full bg-white"
              />
            ) : kind === "editor" ? (
              <EditorCTA
                file={file}
                onOpenInTool={onOpenInTool}
                downloadUrl={downloadUrl}
              />
            ) : (
              <FallbackCTA file={file} downloadUrl={downloadUrl} />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function EditorCTA({
  file,
  onOpenInTool,
  downloadUrl,
}: {
  file: LaunchpadFile;
  onOpenInTool?: (slug: "documents" | "sheets", fileId: string) => void;
  downloadUrl: string | null;
}) {
  const k = fileKind(file);
  const slug: "documents" | "sheets" = k === "sheet" ? "sheets" : "documents";
  const label = slug === "sheets" ? "Open in Sheets" : "Open in Documents";
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-base font-semibold text-app">No inline preview</div>
      <p className="max-w-sm text-sm text-secondary">
        This file opens in the matching editor. You can also download a copy.
      </p>
      <div className="flex items-center gap-2">
        {onOpenInTool && (
          <button
            type="button"
            onClick={() => onOpenInTool(slug, file.id)}
            className="rounded-lg bg-tool-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {label}
          </button>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={file.name}
            rel="noopener"
            className="rounded-lg border border-app px-4 py-1.5 text-sm font-semibold text-secondary hover:text-app"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}

function FallbackCTA({
  file,
  downloadUrl,
}: {
  file: LaunchpadFile;
  downloadUrl: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-base font-semibold text-app">
        No preview available
      </div>
      <p className="max-w-sm text-sm text-secondary">
        We can&apos;t render this kind of file inline yet. You can still
        download the original.
      </p>
      {downloadUrl && (
        <a
          href={downloadUrl}
          download={file.name}
          rel="noopener"
          className="rounded-lg bg-tool-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Download
        </a>
      )}
    </div>
  );
}
