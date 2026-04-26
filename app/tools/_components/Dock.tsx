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
import { useIconStyle } from "./useIconStyle";

/* Dock icons render in a single neutral tone — rainbow category colors made
 * the dock feel busy / kids-made. Category accent only appears on the
 * Launchpad grid where it helps users scan a full list. */
function iconFor(slug: string) {
  const t = TOOLS.find((x) => x.slug === slug);
  return {
    path: t ? TOOL_ICONS[t.icon] ?? TOOL_ICONS.home : TOOL_ICONS.home,
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
  const { path } = iconFor(slug);
  // In hairline mode the parent button already owns the surface colour. For
  // filled/squircle/rounded the glyph inherits from this wrapper.
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(Infinity);
  const [menu, setMenu] = useState<{ slug: string; title: string; x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const { style: iconStyle } = useIconStyle();

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

          {/* Pinned tools */}
          {pinned.map((t) => {
            const openWindow = windows.find((w) => w.slug === t.slug);
            return (
              <DockIcon
                key={t.slug}
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
              >
                <ToolGlyph slug={t.slug} style={iconStyle} />
              </DockIcon>
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
