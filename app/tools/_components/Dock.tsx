"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { WindowState } from "./useWindowManager";
import { TOOL_ICONS, TOOLS, type ToolItem } from "../_data/tools-list";
import type { IconStyleId } from "./icon-styles";
import { useDockBadges } from "./useDockBadges";
import { useIconStyle } from "./useIconStyle";
import AppIcon, { hasAppIcon } from "./AppIcon";
import {
  setAppDragPayload,
  readAppDragPayload,
  type AppDragPayload,
} from "./appDrag";

/* Dock icons fall back to the legacy outline-path glyph when the tool
 * doesn't have a launcher SVG (e.g. Documents/Sheets, added after the
 * Spacefield Suite design pass). For everything else we render the
 * monochrome launcher icon — same aesthetic across dock + launchpad. */
function iconFor(slug: string) {
  const t = TOOLS.find((x) => x.slug === slug);
  return {
    path: t ? TOOL_ICONS[t.icon] ?? TOOL_ICONS.home : TOOL_ICONS.home,
    iconKey: (t?.icon ?? "home") as keyof typeof TOOL_ICONS,
  };
}

interface Props {
  pinned: ToolItem[];
  windows: WindowState[];
  onLaunchpad: () => void;
  onStore: () => void;
  onOpenTool: (slug: string, title: string) => void;
  onFocusWindow: (id: string) => void;
  onUninstall: (slug: string) => void;
  /* Cross-zone drop: an app dragged from Launchpad/Home was released on
   * the dock. The orchestrator pins it (and removes from Home if that's
   * the source). atIndex is the insertion point within pinnedSlugs;
   * undefined = append. */
  onAppDroppedOnDock?: (payload: AppDragPayload, atIndex?: number) => void;
}

/* macOS-style magnify — item scales with proximity to cursor */
function DockIcon({
  mouseX,
  containerRef,
  children,
  onClick,
  onContextMenu,
  ariaLabel,
  active,
  minimized,
  iconStyle,
  badge,
}: {
  mouseX: ReturnType<typeof useMotionValue<number>>;
  containerRef: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  ariaLabel: string;
  active?: boolean;
  minimized?: boolean;
  iconStyle: IconStyleId;
  /** Optional red badge — number > 0 renders a counter, 0 hides. */
  badge?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const distance = useTransform(mouseX, (x) => {
    const rect = ref.current?.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!rect || !containerRect) return 1000;
    const cx = rect.left + rect.width / 2;
    return x - cx;
  });
  const size = useTransform(distance, [-140, -70, 0, 70, 140], [40, 48, 58, 48, 40]);
  const springSize = useSpring(size, { mass: 0.1, stiffness: 180, damping: 15 });

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-label={ariaLabel}
      style={{ width: springSize, height: springSize }}
      className="relative flex shrink-0 items-center justify-center"
    >
      {/* Hover tooltip — macOS-style name bubble above the icon */}
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute bottom-[calc(100%+8px)] whitespace-nowrap rounded-md border border-app bg-app-elevated px-2 py-1 text-[0.7rem] font-medium text-app shadow-lg"
          >
            {ariaLabel}
          </motion.span>
        )}
      </AnimatePresence>
      <div
        className={
          iconStyle === "hairline"
            ? `flex h-full w-full items-center justify-center rounded-xl transition-colors ${
                active
                  ? "bg-surface-strong text-app"
                  : "bg-surface text-secondary hover:bg-surface-hover hover:text-app"
              }`
            : dockWrapperClass(iconStyle, !!active)
        }
      >
        {children}
      </div>
      {active && !minimized && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-app"
        />
      )}
      {minimized && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-muted"
        />
      )}
      {/* Notification badge — small red bubble at the top-right of the
       * icon, mirroring iOS / macOS app badges. The ring matches the
       * dock background so the bubble visually "lifts" off the icon
       * even on light themes. */}
      {badge !== undefined && badge > 0 && (
        <span
          aria-label={`${badge} notifications`}
          className="pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-app-elevated"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </motion.button>
  );
}

/* Returns the wrapper class for a given icon style. The wrapper sits inside
 * the magnify circle, fills it, and frames the SVG glyph. The glyph itself
 * keeps a fixed size — only the frame visuals change. */
function dockWrapperClass(style: IconStyleId, active: boolean): string {
  switch (style) {
    case "filled":
      return `flex h-full w-full items-center justify-center rounded-xl bg-tool-accent text-white shadow-sm ${
        active ? "ring-1 ring-inset ring-white/30" : ""
      }`;
    case "squircle":
      return `flex h-full w-full items-center justify-center rounded-[28%] bg-tool-accent-soft text-tool-accent shadow-md ring-1 ring-inset ring-tool-accent/20 ${
        active ? "ring-tool-accent/40" : ""
      }`;
    case "rounded-square":
      return `flex h-full w-full items-center justify-center rounded-lg border border-app bg-app-elevated text-secondary ${
        active ? "text-app" : ""
      }`;
    case "hairline":
    default:
      // Original look — let the parent DockIcon handle the bg/active swap.
      return "flex h-full w-full items-center justify-center";
  }
}

function ToolGlyph({ slug, style }: { slug: string; style: IconStyleId }) {
  const { iconKey } = iconFor(slug);
  // When the tool has a launcher SVG, render it directly — it ships its
  // own squircle bg, so the parent button chrome (border/fill) becomes
  // pure padding around it. Mono filter keeps the dock visually quiet
  // (rainbow gradients in the dock looked busy).
  if (hasAppIcon(slug)) {
    return (
      <AppIcon
        slug={slug}
        size={28}
        cornerPct={20}
        flatShadow
        mono
        label={slug}
      />
    );
  }
  // Outline-path fallback for tools without a launcher SVG.
  const path = TOOL_ICONS[iconKey] ?? TOOL_ICONS.home;
  const glyphTone =
    style === "hairline"
      ? "text-secondary"
      : style === "filled"
        ? "text-white"
        : style === "squircle"
          ? "text-tool-accent"
          : "text-secondary";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={glyphTone}
    >
      <path d={path} />
    </svg>
  );
}

export default function Dock({
  pinned,
  windows,
  onLaunchpad,
  onStore,
  onOpenTool,
  onFocusWindow,
  onUninstall,
  onAppDroppedOnDock,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(Infinity);
  const [menu, setMenu] = useState<{ slug: string; title: string; x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const { style: iconStyle } = useIconStyle();
  const { getCount } = useDockBadges();

  useEffect(() => {
    setMounted(true);
  }, []);

  const openUninstallMenu = (e: React.MouseEvent, slug: string, title: string) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ slug, title, x: rect.left, y: rect.top - 52 });
  };

  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Dock is always at the back layer (z-[1]) — windows freely cover it,
  // matching the topbar behavior. Maximized windows (z-60) still cover
  // any modal-style content; the dock context menu portals out with z-[60]
  // to ensure it stays clickable above windows.
  const visible = true;

  const pinnedSlugs = new Set(pinned.map((t) => t.slug));
  const extraOpen = windows
    .filter((w) => !pinnedSlugs.has(w.slug))
    .filter((w, i, arr) => arr.findIndex((x) => x.slug === w.slug) === i);

  return (
    <>
      <motion.div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] flex justify-center pb-3"
        initial={false}
        animate={{
          y: visible ? 0 : 72,
          opacity: visible ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <motion.div
          ref={containerRef}
          data-dock
          onPointerMove={(e) => mouseX.set(e.clientX)}
          onPointerLeave={() => mouseX.set(Infinity)}
          onDragOver={(e) => {
            if (!onAppDroppedOnDock) return;
            if (e.dataTransfer.types.includes("application/x-spacefield-app")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(e) => {
            if (!onAppDroppedOnDock) return;
            const payload = readAppDragPayload(e.dataTransfer);
            if (!payload) return;
            e.preventDefault();
            // Compute insertion index from the cursor's x position relative
            // to each pinned tile's center — drop on the left half inserts
            // before, right half inserts after. Falls back to "append" when
            // dropped past the last tile.
            const dockEl = containerRef.current;
            let atIndex: number | undefined;
            if (dockEl) {
              const tiles = dockEl.querySelectorAll<HTMLElement>(
                "[data-dock-pinned]"
              );
              for (let i = 0; i < tiles.length; i++) {
                const r = tiles[i].getBoundingClientRect();
                if (e.clientX < r.left + r.width / 2) {
                  atIndex = i;
                  break;
                }
              }
            }
            onAppDroppedOnDock(payload, atIndex);
          }}
          className="pointer-events-auto flex items-end gap-2 rounded-2xl border border-app bg-app-elevated/80 px-3 py-2 shadow-2xl backdrop-blur-xl"
        >
          {/* Launchpad — 9-dot mark, deliberately not a 4-pane Windows start
           * tile. Colour-shifts on hover. */}
          <DockIcon
            mouseX={mouseX}
            containerRef={containerRef}
            onClick={onLaunchpad}
            ariaLabel="All tools"
            iconStyle={iconStyle}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className={
                iconStyle === "filled"
                  ? "text-white"
                  : iconStyle === "squircle"
                    ? "text-tool-accent"
                    : "text-secondary"
              }
            >
              <path d={TOOL_ICONS.dots9} />
            </svg>
          </DockIcon>

          <div className="h-11 w-px bg-app" />

          {/* Pinned tools — each wrapped in a draggable shell so users
           * can pull them out to Launchpad or Home, or reorder within the
           * dock by dropping onto another pinned tile. The wrapper is
           * `display: contents` so the dock's flex magnify math is
           * unchanged. */}
          {pinned.map((t, idx) => {
            const openWindow = windows.find((w) => w.slug === t.slug);
            return (
              <div
                key={t.slug}
                data-dock-pinned
                draggable
                onDragStart={(e) => {
                  setAppDragPayload(e.dataTransfer, {
                    type: "spacefield-app",
                    slug: t.slug,
                    fromZone: "dock",
                    fromIndex: idx,
                  });
                }}
                style={{ display: "contents" }}
              >
                <DockIcon
                  mouseX={mouseX}
                  containerRef={containerRef}
                  onClick={() =>
                    openWindow
                      ? onFocusWindow(openWindow.id)
                      : onOpenTool(t.slug, t.title)
                  }
                  onContextMenu={(e) => openUninstallMenu(e, t.slug, t.title)}
                  ariaLabel={t.title}
                  active={!!openWindow}
                  minimized={openWindow?.minimized}
                  iconStyle={iconStyle}
                  badge={getCount(t.slug)}
                >
                  <ToolGlyph slug={t.slug} style={iconStyle} />
                </DockIcon>
              </div>
            );
          })}

          {/* Other open (not pinned) */}
          {extraOpen.length > 0 && <div className="h-11 w-px bg-app" />}
          {extraOpen.map((w) => (
            <DockIcon
              key={w.id}
              mouseX={mouseX}
              containerRef={containerRef}
              onClick={() => onFocusWindow(w.id)}
              onContextMenu={(e) => openUninstallMenu(e, w.slug, w.title)}
              ariaLabel={w.title}
              active
              minimized={w.minimized}
              iconStyle={iconStyle}
              badge={getCount(w.slug)}
            >
              <ToolGlyph slug={w.slug} style={iconStyle} />
            </DockIcon>
          ))}

          {/* App Store */}
          <div className="h-11 w-px bg-app" />
          <DockIcon
            mouseX={mouseX}
            containerRef={containerRef}
            onClick={onStore}
            ariaLabel="Tool Store"
            iconStyle={iconStyle}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className={
                iconStyle === "filled"
                  ? "text-white"
                  : iconStyle === "squircle"
                    ? "text-tool-accent"
                    : "text-secondary"
              }
            >
              <path d="M4 7h16l-1.3 11.2a2 2 0 01-2 1.8H7.3a2 2 0 01-2-1.8L4 7zm3 0V5a5 5 0 0110 0v2h-2V5a3 3 0 10-6 0v2H7z" />
            </svg>
          </DockIcon>
        </motion.div>
      </motion.div>

      {/* Right-click context menu on a dock icon — offers uninstall.
        * Portaled to body with z-[60] so it stays above windows even though
        * the dock itself sits at z-[1]. */}
      {menu && mounted && createPortal(
        <div
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed z-[60] rounded-lg border border-app bg-app-elevated p-1 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="px-2 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
            {menu.title}
          </div>
          <button
            type="button"
            onClick={() => {
              onUninstall(menu.slug);
              setMenu(null);
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-sm text-secondary hover:bg-surface hover:text-app transition-colors"
            role="menuitem"
          >
            Uninstall
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
