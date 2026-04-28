"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useHomeFiles, HOME_FILE_DROP_EVENT, type HomeFileDropEventDetail } from "./useHomeFiles";

/* File shortcuts pinned to the desktop home. Source of truth for the
 * actual file bytes is the workspace's R2 bucket + workspace_files —
 * this component only renders + persists the (x, y) position and the
 * minimal metadata needed to draw the icon and route the click.
 *
 * Drop wiring: Files Manager's DragDropOverlay sees a drop with
 * data-drop-target="home-files" on the desktop and dispatches a
 * window-level CustomEvent (HOME_FILE_DROP_EVENT) that we listen for
 * here. That keeps the routing logic in one place (DragDropOverlay) and
 * lets this component own pin/move/remove without reaching into the
 * Files Manager internals. */

interface Props {
  onOpenFile: (fileId: string, params: { editorSlug: "documents" | "sheets" | null }) => void;
}

const TILE_W = 88;
const ICON_SIZE = 64;

function isImage(contentType: string, name: string): boolean {
  if (contentType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name);
}

function isVideo(contentType: string, name: string): boolean {
  if (contentType.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v)$/i.test(name);
}

function FileGlyph({ name, contentType }: { name: string; contentType: string }) {
  // Pick a doc / sheet / image / video / generic glyph based on type.
  if (contentType === "application/vnd.spacefield.doc" || /\.(md|txt|doc)$/i.test(name)) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6 2h8l4 4v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 0v6h6M8 13h8M8 17h6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (contentType === "application/vnd.spacefield.sheet" || /\.(csv|xls|xlsx)$/i.test(name)) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
      </svg>
    );
  }
  if (isImage(contentType, name)) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" fill="currentColor" />
        <path d="M21 15l-5-5-8 8" />
      </svg>
    );
  }
  if (isVideo(contentType, name)) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 4l14 8-14 8z" />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M6 2h8l4 4v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export default function HomeFiles({ onOpenFile }: Props) {
  const { files, hydrated, pin, move, remove } = useHomeFiles();

  // Pin a file when DragDropOverlay forwards a desktop-home drop.
  useEffect(() => {
    const onDrop = (e: Event) => {
      const detail = (e as CustomEvent<HomeFileDropEventDetail>).detail;
      if (!detail || !detail.fileId) return;
      pin({
        fileId: detail.fileId,
        name: detail.name,
        contentType: detail.contentType,
        editorSlug: detail.editorSlug,
        x: detail.x,
        y: detail.y,
      });
    };
    window.addEventListener(HOME_FILE_DROP_EVENT, onDrop);
    return () => window.removeEventListener(HOME_FILE_DROP_EVENT, onDrop);
  }, [pin]);

  if (!hydrated) return null;
  const ids = Object.keys(files);
  if (ids.length === 0) return null;

  return (
    <>
      {ids.map((fileId) => {
        const f = files[fileId];
        return (
          <motion.button
            key={fileId}
            type="button"
            onClick={() => onOpenFile(fileId, { editorSlug: f.editorSlug })}
            onContextMenu={(e) => {
              e.preventDefault();
              remove(fileId);
            }}
            onPointerDown={(e) => {
              // Pointer-drag to reposition within the home zone. We use
              // pointer events here (not HTML5 DnD) so the icon tracks
              // smoothly under the cursor instead of using the browser
              // ghost. Cross-zone moves aren't a thing for files (they
              // only live on the home), so HTML5 DnD isn't needed.
              if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
              const startX = e.clientX;
              const startY = e.clientY;
              const startPos = { x: f.x, y: f.y };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              let moved = false;
              const onMove = (ev: PointerEvent) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
                moved = true;
                move(fileId, Math.max(8, startPos.x + dx), Math.max(40, startPos.y + dy));
              };
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="absolute z-[5] flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing focus:outline-none"
            style={{ left: f.x, top: f.y, width: TILE_W }}
            aria-label={f.name}
            title={`${f.name} — drag to reposition, right-click to remove from desktop`}
          >
            <span className="pointer-events-none flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-xl shadow-md transition-all duration-200 hover:bg-white/25">
              <FileGlyph name={f.name} contentType={f.contentType} />
            </span>
            <span className="pointer-events-none line-clamp-2 max-w-full text-center text-[0.72rem] font-medium leading-tight tracking-tight text-white/95 drop-shadow-md">
              {f.name}
            </span>
          </motion.button>
        );
      })}
    </>
  );
}
