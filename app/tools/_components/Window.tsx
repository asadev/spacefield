"use client";

import { motion } from "framer-motion";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type { WindowState } from "./useWindowManager";
import { toolBySlug, type NativeAppProps } from "../_data/tools-list";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopShell } from "./DesktopShellContext";
import { computeSnapRect, rectMatchesSnap } from "./snapZones";

/* Build the iframe URL for a tool window. RE tools default to
 * `/tools/<slug>`; cross-industry tools from /solutions set their `route`
 * in the catalog (e.g. `/solutions/tools/<slug>`). Always append frame=1
 * so the target page can strip its own chrome, and theme=<resolved> so
 * the iframe inherits the parent's resolved light/dark mode immediately
 * (the iframe's themeInitScript reads ?theme= before localStorage). */
function iframeUrlFor(slug: string, theme: "dark" | "light"): string {
  const tool = toolBySlug(slug);
  const base = tool?.route ?? `/tools/${slug}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}frame=1&theme=${theme}`;
}

interface Props {
  win: WindowState;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  /** Edge-snap commit — sets position + size + remembers prev for restore. */
  onSnap?: (x: number, y: number, w: number, h: number) => void;
  /** Restore from a snapped state to the previously-saved size at a new x/y. */
  onUnsnap?: (x: number, y: number) => void;
  /** Restore pinned (picture-in-picture) window back to normal. */
  onUnpin?: () => void;
}

const TOPBAR = 32;

export default function Window({
  win,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onMove,
  onResize,
  onSnap,
  onUnsnap,
  onUnpin,
}: Props) {
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ sw: number; sh: number; sx: number; sy: number } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const { resolved } = useTheme();
  const shell = useDesktopShell();
  const tool = useMemo(() => toolBySlug(win.slug), [win.slug]);

  // Whenever the parent theme flips, force the iframe to re-render with the
  // matching ?theme= so the inner page's themeInitScript runs again with the
  // right value. (Same-origin localStorage propagates too, but a hard reset
  // guarantees the inline init script picks it up at parse time.)
  useEffect(() => {
    const f = iframeRef.current;
    if (!f) return;
    const next = iframeUrlFor(win.slug, resolved);
    if (f.src !== new URL(next, window.location.href).toString()) {
      f.src = next;
    }
  }, [resolved, win.slug]);

  const resetIframe = () => {
    const f = iframeRef.current;
    if (!f) return;
    f.src = iframeUrlFor(win.slug, resolved);
    setIframeReady(false);
  };

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      onFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWinX = win.x;
      const startWinY = win.y;
      const startWinW = win.w;
      const startWinH = win.h;
      // Snap state at drag start — if the window is currently snapped (or
      // maximized), the first sufficient pointer movement should restore the
      // prev size and re-anchor the window so the cursor stays on the title
      // bar (matches macOS / Windows behavior).
      const startedSnapped =
        win.maximized || (!!win.prev && rectMatchesSnap(win));
      const restoreSize = win.prev ?? { w: startWinW, h: startWinH };
      let didUnsnap = false;
      dragRef.current = { ox: startX - startWinX, oy: startY - startWinY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      let lastClientX = startX;
      let lastClientY = startY;

      const move = (ev: PointerEvent) => {
        lastClientX = ev.clientX;
        lastClientY = ev.clientY;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        // Restore-from-snap: once the user has dragged ~6px, swap dimensions
        // back to the saved prev and anchor the window so the cursor sits
        // proportionally along the (now-shorter) title bar instead of jumping.
        if (startedSnapped && !didUnsnap && Math.hypot(dx, dy) > 6) {
          didUnsnap = true;
          // Anchor so the cursor's relative X across the old (snapped) width
          // maps to the same relative X across the restored width.
          const ratio = startWinW > 0 ? (startX - startWinX) / startWinW : 0.5;
          const nx = Math.max(0, ev.clientX - restoreSize.w * ratio);
          const ny = Math.max(0, ev.clientY - 12);
          if (onUnsnap) onUnsnap(nx, ny);
          else {
            // Fallback for older callers without onUnsnap wired up.
            onResize(restoreSize.w, restoreSize.h);
            onMove(nx, ny);
          }
          // Recalibrate the drag origin so subsequent moves track the cursor
          // smoothly from the new anchor point.
          dragRef.current = { ox: ev.clientX - nx, oy: ev.clientY - ny };
          return;
        }

        if (didUnsnap) {
          const offset = dragRef.current;
          if (offset) {
            onMove(
              Math.max(0, ev.clientX - offset.ox),
              Math.max(0, ev.clientY - offset.oy),
            );
          }
        } else if (!startedSnapped) {
          onMove(
            Math.max(0, startWinX + dx),
            Math.max(0, startWinY + dy)
          );
        }

        // Broadcast the cursor position so SnapPreview can render the zone
        // overlay. Only emit while we're actually moving the window — i.e.
        // either we've unsnapped or we never started snapped.
        if (!startedSnapped || didUnsnap) {
          window.dispatchEvent(
            new CustomEvent("tools-desktop-drag-edge", {
              detail: { x: ev.clientX, y: ev.clientY, active: true },
            }),
          );
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        dragRef.current = null;
        // Always clear the preview, regardless of whether we snapped.
        window.dispatchEvent(
          new CustomEvent("tools-desktop-drag-edge", {
            detail: { x: lastClientX, y: lastClientY, active: false },
          }),
        );
        // Only commit a snap if we actually moved the window (i.e. we
        // unsnapped from a previous snap, or we started free). PiP windows
        // never snap — they stay in their floating bottom-right zone.
        if (startedSnapped && !didUnsnap) return;
        if (win.pinned) return;
        const snap = computeSnapRect(lastClientX, lastClientY);
        if (!snap) return;
        if (snap.zone === "top") {
          // Top-edge → maximize (delegates to the existing toggleMaximize so
          // window.maximized + prev get set the canonical way).
          if (!win.maximized) onMaximize();
          return;
        }
        if (onSnap) {
          onSnap(snap.rect.x, snap.rect.y, snap.rect.w, snap.rect.h);
        } else {
          onResize(snap.rect.w, snap.rect.h);
          onMove(snap.rect.x, snap.rect.y);
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [
      win.x,
      win.y,
      win.w,
      win.h,
      win.maximized,
      win.pinned,
      win.prev,
      onFocus,
      onMove,
      onResize,
      onMaximize,
      onSnap,
      onUnsnap,
    ]
  );

  // 8-way resize: n / s / e / w + the four corners. Each handle anchors the
  // OPPOSITE edge so the user's grabbed point tracks the cursor exactly.
  // Handles north/west also adjust x/y so the bottom-right stays pinned.
  const startResize = useCallback(
    (edge: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") =>
      (e: React.PointerEvent) => {
        e.stopPropagation();
        onFocus();
        const startMx = e.clientX;
        const startMy = e.clientY;
        const startX = win.x;
        const startY = win.y;
        const startW = win.w;
        const startH = win.h;
        const minW = 320;
        const minH = 240;
        resizeRef.current = { sw: startW, sh: startH, sx: startMx, sy: startMy };

        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startMx;
          const dy = ev.clientY - startMy;
          let nx = startX;
          let ny = startY;
          let nw = startW;
          let nh = startH;

          if (edge.includes("e")) nw = Math.max(minW, startW + dx);
          if (edge.includes("w")) {
            const tryW = startW - dx;
            if (tryW >= minW) {
              nw = tryW;
              nx = startX + dx;
            } else {
              nw = minW;
              nx = startX + (startW - minW);
            }
          }
          if (edge.includes("s")) nh = Math.max(minH, startH + dy);
          if (edge.includes("n")) {
            const tryH = startH - dy;
            if (tryH >= minH) {
              nh = tryH;
              ny = Math.max(TOPBAR, startY + dy);
            } else {
              nh = minH;
              ny = Math.max(TOPBAR, startY + (startH - minH));
            }
          }

          if (nx !== startX || ny !== startY) onMove(nx, ny);
          if (nw !== startW || nh !== startH) onResize(nw, nh);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          resizeRef.current = null;
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    [win.x, win.y, win.w, win.h, onFocus, onMove, onResize]
  );

  // Keep maximized windows in sync with viewport changes — true fullscreen
  // means edge-to-edge coverage with no menu-bar inset.
  useEffect(() => {
    if (!win.maximized) return;
    const onResizeWindow = () => {
      onResize(window.innerWidth, window.innerHeight);
      onMove(0, 0);
    };
    window.addEventListener("resize", onResizeWindow);
    return () => window.removeEventListener("resize", onResizeWindow);
  }, [win.maximized, onResize, onMove]);

  return (
    <motion.div
      role="dialog"
      aria-label={win.title}
      // Pure opacity fade on enter/exit. The earlier
      // initial={{ scale: 0.96, y: 8 }} caused a one-frame
      // transform/layout race that read as flicker — the motion.div
      // mounted at its target left/top with a CSS transform from
      // initial, the browser composited on the next frame, and any
      // re-layout from sibling windows or the wallpaper canvas
      // underneath repainted the new layer. Opacity-only on enter
      // avoids any transform/layout work during mount.
      // Scale + y still animate when MINIMIZED so the dock animation
      // reads — that's a state-driven animate, not a mount race.
      initial={{ opacity: 0 }}
      animate={{
        opacity: win.minimized ? 0 : 1,
        scale: win.minimized ? 0.85 : 1,
        y: win.minimized ? 40 : 0,
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: win.maximized || win.pinned ? "fixed" : "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        // Promote to its own compositor layer so opening / closing
        // doesn't repaint the wallpaper canvas underneath.
        willChange: "opacity, transform",
        contain: "layout paint",
        // Maximized windows render above the topbar (z-50) so true fullscreen
        // hides the menu bar. Pinned (PiP) windows float above all regular
        // windows but below modals (z-[80]). Non-maximized stack uses each
        // window's own z.
        zIndex: win.pinned ? 70 : win.maximized ? 60 : win.z,
        pointerEvents: win.minimized ? "none" : "auto",
        borderRadius: win.maximized ? 0 : undefined,
      }}
      className={
        win.maximized
          ? "overflow-hidden bg-app-elevated shadow-2xl"
          : win.pinned
            ? "sf-glass-window overflow-hidden rounded-xl ring-1 ring-tool-accent-soft"
            : "sf-glass-window overflow-hidden rounded-xl"
      }
    >
      {/* Title bar */}
      <div
        onPointerDown={onDragStart}
        onDoubleClick={onMaximize}
        className="sf-glass-titlebar flex h-9 select-none items-center gap-2 px-3"
        style={{ cursor: "grab" }}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5" data-no-drag>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="group h-3 w-3 rounded-full bg-[#ff5f57] transition-colors"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#4d0000]"
              aria-hidden="true"
            >
              <path
                d="M3.5 3.5l5 5M8.5 3.5l-5 5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize"
            className="group h-3 w-3 rounded-full bg-[#febc2e] transition-colors"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#604000]"
              aria-hidden="true"
            >
              <path
                d="M3 6h6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMaximize}
            aria-label={win.maximized ? "Restore" : "Maximize"}
            className="group h-3 w-3 rounded-full bg-[#28c840] transition-colors"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#013000]"
              aria-hidden="true"
            >
              <path
                d="M3.5 6l2.5-2.5L8.5 6M3.5 6l2.5 2.5L8.5 6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 truncate text-center text-xs font-medium text-app">
          {win.title}
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          {win.pinned && onUnpin && (
            <button
              type="button"
              onClick={onUnpin}
              aria-label="Restore window from picture-in-picture"
              title="Restore window"
              className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent transition-opacity hover:opacity-80"
            >
              Restore
            </button>
          )}
          <button
            type="button"
            onClick={resetIframe}
            aria-label="Reset tool (go to start)"
            title="Reset tool"
            className="flex h-6 w-6 items-center justify-center rounded text-secondary hover:bg-surface hover:text-app transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12l9-9 9 9" />
              <path d="M9 21V12h6v9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body — native React component when ToolItem.app is set, otherwise
       * iframe fallback. Native apps run in-process: no chrome leak, no
       * theme flash, instant cross-app navigation via openApp(). */}
      <div className="relative h-[calc(100%-2.25rem)] bg-app overflow-hidden">
        {tool?.app ? (
          <NativeAppHost
            slug={win.slug}
            windowId={win.id}
            width={win.w}
            height={Math.max(0, win.h - 36)}
            initialParams={win.initialParams}
            initialParamsKey={win.initialParamsKey}
            resolved={resolved}
            openApp={shell.openApp}
            closeWindow={() => onClose()}
            loader={tool.app}
          />
        ) : (
          <>
            {!iframeReady && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
                Loading…
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={iframeUrlFor(win.slug, resolved)}
              title={win.title}
              onLoad={() => setIframeReady(true)}
              className="h-full w-full border-0"
              style={{ colorScheme: "light dark", backgroundColor: "var(--bg)" }}
            />
          </>
        )}
      </div>

      {/* 8-way resize handles — 4 invisible edge strips (8px) + 4 corners
       * (12x12). Cursor changes per edge. Edges are positioned just inside
       * the window border so they don't fight title-bar drag or content
       * clicks. The SE corner gets a subtle visible chevron grip. */}
      {!win.maximized && !win.pinned && (
        <>
          <div onPointerDown={startResize("n")} aria-label="Resize top edge" className="absolute left-3 right-3 top-0 h-1.5 cursor-ns-resize" />
          <div onPointerDown={startResize("s")} aria-label="Resize bottom edge" className="absolute left-3 right-3 bottom-0 h-1.5 cursor-ns-resize" />
          <div onPointerDown={startResize("w")} aria-label="Resize left edge" className="absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize" />
          <div onPointerDown={startResize("e")} aria-label="Resize right edge" className="absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize" />
          <div onPointerDown={startResize("nw")} aria-label="Resize top-left corner" className="absolute top-0 left-0 h-3 w-3 cursor-nw-resize" />
          <div onPointerDown={startResize("ne")} aria-label="Resize top-right corner" className="absolute top-0 right-0 h-3 w-3 cursor-ne-resize" />
          <div onPointerDown={startResize("sw")} aria-label="Resize bottom-left corner" className="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize" />
          <div
            onPointerDown={startResize("se")}
            aria-label="Resize bottom-right corner"
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize opacity-40 hover:opacity-80"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, currentColor 50%, currentColor 62%, transparent 62%, transparent 72%, currentColor 72%, currentColor 84%, transparent 84%)",
              color: "var(--text-muted)",
            }}
          />
        </>
      )}
    </motion.div>
  );
}

/* Native-app host: lazy-loads the tool's React component once per slug and
 * mounts it inside the window body with NativeAppProps. The lazy() ref is
 * memoized via a module-level cache so re-renders don't re-instantiate. */
const lazyCache = new Map<string, ComponentType<NativeAppProps>>();

function NativeAppHost(props: {
  slug: string;
  windowId: string;
  width: number;
  height: number;
  initialParams?: Record<string, unknown>;
  initialParamsKey?: number;
  resolved: "dark" | "light";
  openApp: (slug: string, params?: Record<string, unknown>) => void;
  closeWindow: () => void;
  loader: () => Promise<{ default: ComponentType<NativeAppProps> }>;
}) {
  const { slug, loader, ...rest } = props;
  let App = lazyCache.get(slug);
  if (!App) {
    App = lazy(loader);
    lazyCache.set(slug, App);
  }
  return (
    <Suspense fallback={<NativeAppLoadingFallback />}>
      <App {...rest} />
    </Suspense>
  );
}

/* Loading fallback shown while the lazy tool chunk downloads + parses.
 * A subtle skeleton frame + spinner + label so the user sees a clear
 * "this is loading" signal instead of a blank window. Styled to match
 * the rest of the OS chrome — same dark/light surface, native feel. */
function NativeAppLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading app"
      className="absolute inset-0 flex flex-col bg-app"
    >
      {/* Skeleton toolbar */}
      <div className="flex items-center gap-2 border-b border-app/60 bg-app-elevated/40 px-4 py-3">
        <div className="h-6 w-6 rounded-md bg-surface" />
        <div className="h-3 w-32 rounded-full bg-surface" />
        <div className="ml-auto flex gap-1.5">
          <div className="h-6 w-16 rounded-md bg-surface" />
          <div className="h-6 w-6 rounded-md bg-surface" />
        </div>
      </div>
      {/* Skeleton body */}
      <div className="grid flex-1 grid-cols-[180px_1fr] gap-0">
        <div className="border-r border-app/60 bg-app-elevated/30 p-3 space-y-2">
          <div className="h-3 w-24 rounded-full bg-surface" />
          <div className="h-3 w-20 rounded-full bg-surface" />
          <div className="h-3 w-28 rounded-full bg-surface" />
          <div className="h-3 w-16 rounded-full bg-surface" />
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6">
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-tool-accent-soft border-t-tool-accent"
          />
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
            Loading
          </span>
        </div>
      </div>
    </div>
  );
}
