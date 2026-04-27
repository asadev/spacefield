"use client";

/* ScreenshotCapture — ⌘⇧3 (full viewport) and ⌘⇧4 (rectangle).
 *
 * Uses navigator.mediaDevices.getDisplayMedia to grab a frame of the
 * user's screen. The browser shows its own permission prompt — that's
 * fine, the spec says to expect it. We grab a single video frame, draw
 * to a canvas, optionally crop to a rectangle, then upload as a PNG to
 * Files Manager via the existing `/api/files/save-content` endpoint.
 *
 * Why getDisplayMedia and not html2canvas: the spec asked for the entire
 * visible browser viewport, including OS-level chrome the user sees.
 * html2canvas would only capture our DOM. getDisplayMedia hits the
 * actual pixels — same as a real screenshot tool.
 *
 * Toast: a small "Saved as Screenshot YYYY-MM-DD HH:MM.png" appears in
 * the bottom-right with an Open button that uses a postMessage convention
 * the desktop already wires for cross-tool launches.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaces } from "./useWorkspaces";

interface Toast {
  id: number;
  filename: string;
  status: "saving" | "saved" | "error";
  error?: string;
  /** The slug to open (for the Open button). */
  openSlug?: "documents" | "files-manager";
}

function fmtTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pngBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("expected dataURL"));
        return;
      }
      // result is `data:image/png;base64,<DATA>` — strip the prefix.
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Acquire one frame from getDisplayMedia. Returns the canvas the frame
 * was drawn into (so caller can crop) plus a teardown for the stream.
 */
async function captureScreenFrame(): Promise<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture not supported in this browser");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" } as MediaTrackConstraints,
    audio: false,
  });
  try {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
      // Failsafe — most loadedmetadata fires within a few hundred ms.
      window.setTimeout(() => resolve(), 1500);
    });
    try {
      await video.play();
    } catch {
      /* some browsers reject the play() promise even though the frame is ready */
    }
    // Wait one rAF so the first frame is decoded.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );

    const w = video.videoWidth || window.innerWidth;
    const h = video.videoHeight || window.innerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.drawImage(video, 0, 0, w, h);

    return { canvas, width: w, height: h };
  } finally {
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* */
      }
    }
  }
}

function cropCanvas(
  source: HTMLCanvasElement,
  rectViewport: { x: number; y: number; w: number; h: number }
): HTMLCanvasElement {
  // Map viewport-space rect → captured-frame coordinates. We assume the
  // capture covers the browser tab 1:1 (displaySurface: "browser"), so
  // the scale factor is the captured frame size / window size.
  const scaleX = source.width / window.innerWidth;
  const scaleY = source.height / window.innerHeight;
  const sx = Math.max(0, Math.round(rectViewport.x * scaleX));
  const sy = Math.max(0, Math.round(rectViewport.y * scaleY));
  const sw = Math.max(
    1,
    Math.min(source.width - sx, Math.round(rectViewport.w * scaleX))
  );
  const sh = Math.max(
    1,
    Math.min(source.height - sy, Math.round(rectViewport.h * scaleY))
  );
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

export default function ScreenshotCapture() {
  const { activeId } = useWorkspaces();
  const [selecting, setSelecting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const pushToast = useCallback((toast: Omit<Toast, "id">): number => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const updateToast = useCallback((id: number, patch: Partial<Toast>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auto-dismiss saved/errored toasts after a few seconds.
  useEffect(() => {
    const timers = toasts
      .filter((t) => t.status !== "saving")
      .map((t) =>
        window.setTimeout(() => {
          dismissToast(t.id);
        }, 6000)
      );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [toasts, dismissToast]);

  /** Save a captured canvas to Files Manager as a PNG. */
  const saveCanvas = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const filename = `Screenshot ${fmtTimestamp(new Date())}.png`;
      const toastId = pushToast({
        filename,
        status: "saving",
      });
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
            "image/png"
          );
        });
        const base64 = await pngBlobToBase64(blob);
        if (!activeId) {
          updateToast(toastId, {
            status: "error",
            error: "No active workspace",
          });
          return;
        }
        const res = await fetch("/api/files/save-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: activeId,
            name: filename,
            contentType: "image/png",
            contentBase64: base64,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          updateToast(toastId, {
            status: "error",
            error: body?.error ?? `Save failed (${res.status})`,
          });
          return;
        }
        updateToast(toastId, {
          status: "saved",
          openSlug: "files-manager",
        });
      } catch (err) {
        updateToast(toastId, {
          status: "error",
          error: err instanceof Error ? err.message : "save failed",
        });
      }
    },
    [activeId, pushToast, updateToast]
  );

  /** ⌘⇧3 — full viewport. */
  const captureFull = useCallback(async () => {
    try {
      const { canvas } = await captureScreenFrame();
      await saveCanvas(canvas);
    } catch (err) {
      // Most likely the user denied the permission prompt — that's a
      // soft fail, not a bug.
      const message = err instanceof Error ? err.message : "capture failed";
      // Only surface a toast for non-NotAllowed errors. Permission denial
      // already gets the browser's own UI.
      if (!/permission|denied|NotAllowed/i.test(message)) {
        const id = pushToast({
          filename: "Screenshot",
          status: "error",
          error: message,
        });
        // Keep the dismissal in the standard auto-dismiss path.
        void id;
      }
    }
  }, [saveCanvas, pushToast]);

  /** ⌘⇧4 — rectangle selection, then capture + crop. */
  const startSelection = useCallback(() => {
    setSelecting(true);
  }, []);

  const onSelectionDone = useCallback(
    async (rect: { x: number; y: number; w: number; h: number } | null) => {
      setSelecting(false);
      if (!rect || rect.w < 4 || rect.h < 4) return;
      try {
        const { canvas } = await captureScreenFrame();
        const cropped = cropCanvas(canvas, rect);
        await saveCanvas(cropped);
      } catch (err) {
        const message = err instanceof Error ? err.message : "capture failed";
        if (!/permission|denied|NotAllowed/i.test(message)) {
          pushToast({
            filename: "Screenshot",
            status: "error",
            error: message,
          });
        }
      }
    },
    [saveCanvas, pushToast]
  );

  // Keyboard shortcuts — ⌘⇧3 / ⌘⇧4. Skip when typing into an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.shiftKey) return;
      if (e.key === "3" || e.code === "Digit3") {
        e.preventDefault();
        void captureFull();
      } else if (e.key === "4" || e.code === "Digit4") {
        e.preventDefault();
        startSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureFull, startSelection]);

  // Listen for external screenshot requests (e.g. Control Center menu
  // item). Mirrors the ambient-sounds event channel.
  useEffect(() => {
    const onFull = () => void captureFull();
    const onRect = () => startSelection();
    window.addEventListener("spacefield:screenshot-full", onFull);
    window.addEventListener("spacefield:screenshot-rect", onRect);
    return () => {
      window.removeEventListener("spacefield:screenshot-full", onFull);
      window.removeEventListener("spacefield:screenshot-rect", onRect);
    };
  }, [captureFull, startSelection]);

  /** Open Files Manager via the same postMessage convention the desktop
   * uses for cross-tool launches. Falls back to nothing if the desktop
   * isn't listening (e.g. inside an iframe). */
  const openFilesManager = useCallback(() => {
    window.postMessage(
      { type: "tools-open", slug: "files-manager", title: "Files Manager" },
      window.location.origin
    );
  }, []);

  return (
    <>
      {selecting && (
        <SelectionOverlay
          onDone={onSelectionDone}
          onCancel={() => setSelecting(false)}
        />
      )}

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-24 right-4 z-[60] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex w-[300px] items-start gap-3 rounded-xl border border-app bg-app-elevated/95 p-3 shadow-2xl backdrop-blur-xl"
            >
              <div
                className={
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md " +
                  (t.status === "error"
                    ? "bg-rose-500/15 text-rose-500"
                    : t.status === "saved"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-tool-accent-soft text-tool-accent")
                }
              >
                {t.status === "saving" ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-spin"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                  </svg>
                ) : t.status === "saved" ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.78rem] font-medium text-app">
                  {t.status === "error"
                    ? "Couldn't save screenshot"
                    : t.status === "saved"
                      ? `Saved as ${t.filename}`
                      : `Saving ${t.filename}…`}
                </div>
                {t.status === "error" && t.error && (
                  <div className="mt-0.5 text-[0.7rem] text-rose-400">
                    {t.error}
                  </div>
                )}
                {t.status === "saved" && (
                  <button
                    type="button"
                    onClick={() => {
                      openFilesManager();
                      dismissToast(t.id);
                    }}
                    className="mt-1 text-[0.7rem] font-medium text-tool-accent transition-opacity hover:opacity-80"
                  >
                    Open in Files
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:bg-surface hover:text-app"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SelectionOverlay({
  onDone,
  onCancel,
}: {
  onDone: (rect: { x: number; y: number; w: number; h: number } | null) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const rect =
    start && end
      ? {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(end.x - start.x),
          h: Math.abs(end.y - start.y),
        }
      : null;

  return (
    <div
      className="fixed inset-0 z-[90] cursor-crosshair"
      onPointerDown={(e) => {
        setStart({ x: e.clientX, y: e.clientY });
        setEnd({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start) setEnd({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={() => {
        if (rect && rect.w >= 4 && rect.h >= 4) {
          onDone(rect);
        } else {
          onDone(null);
        }
      }}
      style={{ background: "rgba(0,0,0,0.25)" }}
    >
      {/* Instructional caption */}
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-app-elevated/95 px-3 py-1 text-[0.7rem] font-medium text-app shadow-lg backdrop-blur-xl">
        Drag to select an area · Esc to cancel
      </div>

      {rect && (
        <div
          className="pointer-events-none absolute border border-tool-accent bg-tool-accent/15"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
          }}
        >
          <div className="absolute -top-5 left-0 rounded bg-tool-accent px-1 text-[10px] font-medium text-white">
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </div>
        </div>
      )}
    </div>
  );
}
