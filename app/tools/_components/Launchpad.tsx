"use client";

/* Launchpad — Finder-style movable window for browsing & launching apps.
 *
 * Replaces the previous fullscreen overlay. The window:
 *   - Renders its own traffic-light title bar + Finder-style toolbar.
 *   - Is movable (drag the title bar) and resizable (8-way edge handles).
 *   - Persists its bounds per-workspace at `ws:<id>:launchpad-bounds-v1`.
 *   - Persists the chosen view per-workspace at `ws:<id>:launchpad-view-v1`.
 *   - Opens at 1100×640, min 720×420, max full screen.
 *   - Stays z-stacked beneath modals (z-50) but above regular windows so
 *     it acts like a system finder rather than a tool window.
 *
 * The component still receives an `open` prop so existing callers
 * (Desktop.tsx) keep working without changes to the window-manager.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TOOL_CATEGORIES, TOOLS, type ToolItem } from "../_data/tools-list";
import {
  setAppDragPayload,
  readAppDragPayload,
  type AppDragPayload,
} from "./appDrag";
import { useRecents } from "./useRecents";
import { useWorkspaces, useWorkspaceKey } from "./useWorkspaces";

import LaunchpadSidebar from "./launchpad/LaunchpadSidebar";
import LaunchpadToolbar from "./launchpad/LaunchpadToolbar";
import LaunchpadStatusBar from "./launchpad/LaunchpadStatusBar";
import LaunchpadIconView from "./launchpad/LaunchpadIconView";
import LaunchpadListView from "./launchpad/LaunchpadListView";
import LaunchpadColumnView from "./launchpad/LaunchpadColumnView";
import LaunchpadGalleryView from "./launchpad/LaunchpadGalleryView";
import {
  useLaunchpadView,
  type LaunchpadLocation,
  locationKey,
  locationTitle,
} from "./launchpad/useLaunchpadView";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenTool: (slug: string, title: string) => void;
  onUninstall?: (slug: string) => void;
  onStore?: () => void;
  /** Restrict to these tools (the installed set). When omitted, all
   * tools are visible (used by App Store / first-launch). */
  items?: ToolItem[];
  /** Cross-zone drop hook (drag from Dock or Home onto Launchpad). */
  onAppDroppedOnLaunchpad?: (payload: AppDragPayload) => void;
  /** Optional: open the workspace switcher (used by the toolbar's
   * "Connect" button). */
  onConnect?: () => void;
}

const TOPBAR = 32;
const MIN_W = 720;
const MIN_H = 420;
const DEFAULT_W = 1100;
const DEFAULT_H = 640;
const BOUNDS_SUFFIX = "launchpad-bounds-v1";

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(v, hi));
}

function defaultBounds(): Bounds {
  if (typeof window === "undefined") {
    return { x: 80, y: 80, w: DEFAULT_W, h: DEFAULT_H };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(DEFAULT_W, vw - 32);
  const h = Math.min(DEFAULT_H, vh - TOPBAR - 32);
  return {
    x: Math.max(16, Math.round((vw - w) / 2)),
    y: Math.max(TOPBAR + 16, Math.round((vh - h) / 2)),
    w,
    h,
  };
}

export default function Launchpad({
  open,
  onClose,
  onOpenTool,
  onUninstall,
  onStore,
  items,
  onAppDroppedOnLaunchpad,
  onConnect,
}: Props) {
  const BOUNDS_KEY = useWorkspaceKey(BOUNDS_SUFFIX);
  const { workspaces, activeId, switchWorkspace } = useWorkspaces();
  const { recents } = useRecents();
  const launchpadView = useLaunchpadView();

  const [bounds, setBounds] = useState<Bounds>(defaultBounds);
  const [maximized, setMaximized] = useState(false);
  const [prevBounds, setPrevBounds] = useState<Bounds | null>(null);
  const [q, setQ] = useState("");
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    slug: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);

  // Hydrate persisted bounds.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(BOUNDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Bounds>;
        if (
          typeof parsed.x === "number" &&
          typeof parsed.y === "number" &&
          typeof parsed.w === "number" &&
          typeof parsed.h === "number"
        ) {
          setBounds({
            x: parsed.x,
            y: parsed.y,
            w: Math.max(MIN_W, parsed.w),
            h: Math.max(MIN_H, parsed.h),
          });
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setBounds(defaultBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist bounds (debounced via useEffect deps — small writes are fine).
  useEffect(() => {
    if (maximized) return; // don't overwrite saved free bounds
    try {
      localStorage.setItem(BOUNDS_KEY, JSON.stringify(bounds));
    } catch {
      /* storage quota — ignore */
    }
  }, [bounds, maximized, BOUNDS_KEY]);

  // Reset transient UI when the window closes.
  useEffect(() => {
    if (!open) {
      setQ("");
      setMenu(null);
    }
  }, [open]);

  // ⌘W closes; Escape closes; ⌘Shift+A toggles (handled by the parent — we
  // only listen for window-local close keys here).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        onClose();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Dismiss the right-click context menu on any pointer-down outside it.
  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(null);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  // Resolve the items shown in the main pane based on the current location.
  const sourceTools = useMemo<ToolItem[]>(() => {
    return items ?? TOOLS;
  }, [items]);

  const locationItems = useMemo<ToolItem[]>(() => {
    const loc = launchpadView.location;
    switch (loc.kind) {
      case "applications":
        return sourceTools;
      case "recents": {
        const order: string[] = [];
        for (const r of recents) {
          if (r.kind === "tool") order.push(r.slug);
          if (order.length >= 8) break;
        }
        const bySlug = new Map(sourceTools.map((t) => [t.slug, t]));
        return order
          .map((slug) => bySlug.get(slug))
          .filter((t): t is ToolItem => Boolean(t));
      }
      case "shared":
        // Communication-style apps (chat). Empty if nothing matches —
        // sidebar tooltip already says "Coming soon".
        return [];
      case "workspace":
        // Workspace rows are jump targets, not item lists. The click
        // handler swaps the active workspace and resets to Applications.
        return sourceTools;
      case "category":
        return sourceTools.filter((t) => t.category === loc.id);
      case "tag":
      case "downloads":
      case "documents":
      case "desktop":
      default:
        return [];
    }
  }, [launchpadView.location, sourceTools, recents]);

  // Filter by search query.
  const visibleTools = useMemo<ToolItem[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) return locationItems;
    return locationItems.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
    );
  }, [locationItems, q]);

  // Keep focused item valid when the visible set shrinks.
  useEffect(() => {
    if (!focusedSlug) return;
    if (!visibleTools.find((t) => t.slug === focusedSlug)) {
      setFocusedSlug(visibleTools[0]?.slug ?? null);
    }
  }, [visibleTools, focusedSlug]);

  // Title shown in title bar + toolbar = current location's friendly name.
  const currentTitle = useMemo<string>(() => {
    const loc = launchpadView.location;
    if (loc.kind === "workspace") {
      return workspaces.find((w) => w.id === loc.id)?.name ?? "Workspace";
    }
    if (loc.kind === "category") {
      return TOOL_CATEGORIES.find((c) => c.key === loc.id)?.label ?? loc.id;
    }
    return locationTitle(loc);
  }, [launchpadView.location, workspaces]);

  const handleSelectLocation = useCallback(
    (loc: LaunchpadLocation) => {
      // Workspace switch: tell the workspace context, then close — the
      // outer Desktop remounts and reopens the window with fresh state.
      if (loc.kind === "workspace") {
        if (loc.id !== activeId) {
          switchWorkspace(loc.id);
          onClose();
        } else {
          launchpadView.setLocation({ kind: "applications" });
        }
        return;
      }
      // Desktop: minimize the window like macOS "Show Desktop".
      if (loc.kind === "desktop") {
        onClose();
        return;
      }
      // Shared: pretend we open Chat. We don't have a comm slug list to
      // filter against, so for v1 we just show an empty list (tooltip in
      // the sidebar already says "Coming soon").
      launchpadView.setLocation(loc);
    },
    [activeId, switchWorkspace, onClose, launchpadView]
  );

  const handleOpen = useCallback(
    (tool: ToolItem) => {
      onOpenTool(tool.slug, tool.title);
      onClose();
    },
    [onOpenTool, onClose]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tool: ToolItem) => {
      if (!onUninstall) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({
        slug: tool.slug,
        title: tool.title,
        x: rect.left,
        y: rect.top + rect.height + 6,
      });
    },
    [onUninstall]
  );

  /* Drag-to-move on the title bar */
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const onTitleDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      if (maximized) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startBx = bounds.x;
      const startBy = bounds.y;
      dragRef.current = { ox: startX - startBx, oy: startY - startBy };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const offset = dragRef.current;
        if (!offset) return;
        setBounds((b) => ({
          ...b,
          x: Math.max(0, ev.clientX - offset.ox),
          y: Math.max(TOPBAR, ev.clientY - offset.oy),
        }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        dragRef.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [bounds.x, bounds.y, maximized]
  );

  /* 8-way resize, mirroring Window.tsx behavior. */
  const startResize = useCallback(
    (edge: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") =>
      (e: React.PointerEvent) => {
        e.stopPropagation();
        if (maximized) return;
        const startMx = e.clientX;
        const startMy = e.clientY;
        const startB = { ...bounds };

        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startMx;
          const dy = ev.clientY - startMy;
          let nx = startB.x;
          let ny = startB.y;
          let nw = startB.w;
          let nh = startB.h;
          if (edge.includes("e")) nw = Math.max(MIN_W, startB.w + dx);
          if (edge.includes("w")) {
            const tryW = startB.w - dx;
            if (tryW >= MIN_W) {
              nw = tryW;
              nx = startB.x + dx;
            } else {
              nw = MIN_W;
              nx = startB.x + (startB.w - MIN_W);
            }
          }
          if (edge.includes("s")) nh = Math.max(MIN_H, startB.h + dy);
          if (edge.includes("n")) {
            const tryH = startB.h - dy;
            if (tryH >= MIN_H) {
              nh = tryH;
              ny = Math.max(TOPBAR, startB.y + dy);
            } else {
              nh = MIN_H;
              ny = Math.max(TOPBAR, startB.y + (startB.h - MIN_H));
            }
          }
          setBounds({ x: nx, y: ny, w: nw, h: nh });
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    [bounds, maximized]
  );

  const toggleMaximize = useCallback(() => {
    if (typeof window === "undefined") return;
    if (maximized && prevBounds) {
      setBounds(prevBounds);
      setPrevBounds(null);
      setMaximized(false);
      return;
    }
    setPrevBounds(bounds);
    setBounds({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
    setMaximized(true);
  }, [maximized, prevBounds, bounds]);

  // Arrow-key navigation between items in the main pane (icon / list /
  // column / gallery views all share the same focused-slug state).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (visibleTools.length === 0) return;
      const idx = focusedSlug
        ? visibleTools.findIndex((t) => t.slug === focusedSlug)
        : -1;
      const cols = launchpadView.view === "icon" ? 6 : 1;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) + 1, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) - 1, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) + cols, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) - cols, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "Enter" && focusedSlug) {
        e.preventDefault();
        const tool = visibleTools.find((t) => t.slug === focusedSlug);
        if (tool) handleOpen(tool);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, visibleTools, focusedSlug, launchpadView.view, handleOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Applications"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={{
            position: "fixed",
            left: bounds.x,
            top: bounds.y,
            width: bounds.w,
            height: bounds.h,
            zIndex: 75,
            borderRadius: maximized ? 0 : undefined,
          }}
          className={
            "overflow-hidden border border-app bg-app-elevated shadow-2xl " +
            (maximized ? "" : "rounded-xl")
          }
          onPointerDown={(e) => {
            // Stop bubbling so the desktop's drop handlers don't grab events.
            e.stopPropagation();
          }}
        >
          {/* Title bar */}
          <div
            onPointerDown={onTitleDrag}
            onDoubleClick={toggleMaximize}
            className="flex h-9 select-none items-center gap-2 border-b border-app bg-app-elevated px-3"
            style={{ cursor: maximized ? "default" : "grab" }}
          >
            <div className="flex items-center gap-1.5" data-no-drag>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="group h-3 w-3 rounded-full bg-[#ff5f57] transition-colors"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#4d0000]" aria-hidden="true">
                  <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Minimize"
                className="group h-3 w-3 rounded-full bg-[#febc2e] transition-colors"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#604000]" aria-hidden="true">
                  <path d="M3 6h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleMaximize}
                aria-label={maximized ? "Restore" : "Maximize"}
                className="group h-3 w-3 rounded-full bg-[#28c840] transition-colors"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#013000]" aria-hidden="true">
                  <path d="M3.5 6l2.5-2.5L8.5 6M3.5 6l2.5 2.5L8.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                </svg>
              </button>
            </div>
            <div className="flex-1 truncate text-center text-xs font-medium text-app">
              {currentTitle}
            </div>
            <div className="flex items-center gap-1" data-no-drag>
              {onStore && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStore();
                  }}
                  className="rounded px-2 py-0.5 text-[11px] text-secondary hover:bg-surface hover:text-app transition-colors"
                  title="Open the Store"
                >
                  Store
                </button>
              )}
            </div>
          </div>

          {/* Toolbar */}
          <LaunchpadToolbar
            title={currentTitle}
            query={q}
            onQuery={setQ}
            view={launchpadView.view}
            onView={launchpadView.setView}
            canBack={launchpadView.canBack}
            canForward={launchpadView.canForward}
            onBack={launchpadView.back}
            onForward={launchpadView.forward}
            previewOpen={launchpadView.previewOpen}
            onTogglePreview={launchpadView.togglePreview}
            onConnect={() => {
              if (onConnect) onConnect();
            }}
          />

          {/* Body — sidebar + main pane (+ optional preview). */}
          <div
            className="flex bg-app"
            style={{ height: bounds.h - 36 - 48 - 24 }}
            onDragOver={(e) => {
              if (!onAppDroppedOnLaunchpad) return;
              if (e.dataTransfer.types.includes("application/x-spacefield-app")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              if (!onAppDroppedOnLaunchpad) return;
              const payload = readAppDragPayload(e.dataTransfer);
              if (!payload) return;
              e.preventDefault();
              onAppDroppedOnLaunchpad(payload);
            }}
          >
            <LaunchpadSidebar
              current={launchpadView.location}
              onSelect={handleSelectLocation}
              workspaces={workspaces}
              activeWorkspaceId={activeId}
            />

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto">
                <MainPane
                  view={launchpadView.view}
                  tools={visibleTools}
                  focusedSlug={focusedSlug}
                  onFocus={setFocusedSlug}
                  onOpen={handleOpen}
                  onContextMenu={handleContextMenu}
                  itemsHint={items}
                  locationKey={locationKey(launchpadView.location)}
                  onOpenStore={onStore}
                  onClose={onClose}
                />
              </div>

              {launchpadView.previewOpen && (
                <PreviewPane
                  tool={visibleTools.find((t) => t.slug === focusedSlug) ?? null}
                  onOpen={handleOpen}
                />
              )}
            </div>
          </div>

          {/* Status bar */}
          <LaunchpadStatusBar
            itemCount={visibleTools.length}
            workspaceId={activeId}
          />

          {/* Resize handles — only when not maximized. */}
          {!maximized && (
            <>
              <div onPointerDown={startResize("n")} aria-label="Resize top edge" className="absolute left-3 right-3 top-0 h-1.5 cursor-ns-resize" />
              <div onPointerDown={startResize("s")} aria-label="Resize bottom edge" className="absolute left-3 right-3 bottom-0 h-1.5 cursor-ns-resize" />
              <div onPointerDown={startResize("w")} aria-label="Resize left edge" className="absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize" />
              <div onPointerDown={startResize("e")} aria-label="Resize right edge" className="absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize" />
              <div onPointerDown={startResize("nw")} aria-label="Resize top-left corner" className="absolute top-0 left-0 h-3 w-3 cursor-nw-resize" />
              <div onPointerDown={startResize("ne")} aria-label="Resize top-right corner" className="absolute top-0 right-0 h-3 w-3 cursor-ne-resize" />
              <div onPointerDown={startResize("sw")} aria-label="Resize bottom-left corner" className="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize" />
              <div onPointerDown={startResize("se")} aria-label="Resize bottom-right corner" className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" />
            </>
          )}

          {/* Right-click context menu — preserved from the original
           * Launchpad. Offers Uninstall for the right-clicked tool. */}
          {menu && onUninstall && (
            <div
              role="menu"
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto fixed z-[90] rounded-lg border border-app bg-app-elevated p-1 shadow-xl"
              style={{ left: menu.x, top: menu.y }}
            >
              <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                {menu.title}
              </div>
              <button
                type="button"
                onClick={() => {
                  onUninstall(menu.slug);
                  setMenu(null);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-app hover:bg-surface transition-colors"
                role="menuitem"
              >
                Uninstall
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface MainPaneProps {
  view: ReturnType<typeof useLaunchpadView>["view"];
  tools: ToolItem[];
  focusedSlug: string | null;
  onFocus: (slug: string) => void;
  onOpen: (tool: ToolItem) => void;
  onContextMenu: (e: React.MouseEvent, tool: ToolItem) => void;
  itemsHint?: ToolItem[];
  locationKey: string;
  onOpenStore?: () => void;
  onClose: () => void;
}

function MainPane({
  view,
  tools,
  focusedSlug,
  onFocus,
  onOpen,
  onContextMenu,
  itemsHint,
  locationKey: locKey,
  onOpenStore,
  onClose,
}: MainPaneProps) {
  // First-launch helper: surface a prominent "Open the Store" CTA when
  // the user has no installed tools at all (matches the previous
  // overlay's empty-state UX).
  if (
    locKey === "applications" &&
    itemsHint &&
    itemsHint.length === 0 &&
    onOpenStore
  ) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-secondary">
          No tools installed yet. Open the Store to add some.
        </p>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenStore();
          }}
          className="rounded-md bg-tool-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Open the Tool Store
        </button>
      </div>
    );
  }

  switch (view) {
    case "list":
      return (
        <LaunchpadListView
          tools={tools}
          focusedSlug={focusedSlug}
          onFocus={onFocus}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      );
    case "column":
      return (
        <LaunchpadColumnView
          tools={tools}
          focusedSlug={focusedSlug}
          onFocus={onFocus}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      );
    case "gallery":
      return (
        <LaunchpadGalleryView
          tools={tools}
          focusedSlug={focusedSlug}
          onFocus={onFocus}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      );
    case "icon":
    default:
      return (
        <LaunchpadIconView
          tools={tools}
          focusedSlug={focusedSlug}
          onFocus={onFocus}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      );
  }
}

/* Right-side preview pane — shown when the toolbar's Preview toggle is on.
 * Mirrors Finder's preview behavior: large icon, name, kind, description,
 * Open button. */
function PreviewPane({
  tool,
  onOpen,
}: {
  tool: ToolItem | null;
  onOpen: (tool: ToolItem) => void;
}) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col items-center gap-3 overflow-y-auto border-l border-app bg-app-elevated p-5 lg:flex">
      {tool ? (
        <>
          <div className="pt-2">
            <PreviewIcon slug={tool.slug} title={tool.title} />
          </div>
          <div className="text-center text-base font-semibold text-app">
            {tool.title}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {TOOL_CATEGORIES.find((c) => c.key === tool.category)?.label ??
              tool.category}
          </div>
          <p className="text-center text-[12px] leading-relaxed text-secondary">
            {tool.description}
          </p>
          <button
            type="button"
            onClick={() => onOpen(tool)}
            className="mt-2 rounded-md bg-tool-accent px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Open
          </button>
        </>
      ) : (
        <div className="pt-12 text-sm text-muted">No item selected</div>
      )}
    </aside>
  );
}

/* Tiny wrapper so PreviewPane can stay framework-agnostic. We re-import
 * AppIcon here at use-time to avoid lifting it to the file's top scope
 * twice (also used in the view modules). */
import AppIcon, { hasAppIcon } from "./AppIcon";
function PreviewIcon({ slug, title }: { slug: string; title: string }) {
  if (hasAppIcon(slug)) {
    return <AppIcon slug={slug} size={120} cornerPct={24} label={title} />;
  }
  return <div className="h-[120px] w-[120px] rounded-2xl bg-surface" />;
}
