"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  TOOL_CATEGORIES,
  TOOL_ICONS,
  TOOLS,
  type ToolCategoryKey,
  type ToolItem,
} from "../_data/tools-list";
import type { IconStyleId } from "./icon-styles";
import { useIconStyle } from "./useIconStyle";
import AppIcon, { hasAppIcon } from "./AppIcon";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenTool: (slug: string, title: string) => void;
  onUninstall?: (slug: string) => void;
  onStore?: () => void;
  items?: ToolItem[]; // if provided, restrict to these tools (installed set)
}

/* Launchpad tiles — the default ("hairline") look is one neutral glass tone;
 * the category rainbow read as busy. Category colour is only shown on accent
 * chips inside the Store. The other styles (filled / squircle / rounded-square)
 * mirror the dock variants so the desktop has one cohesive look. */
const TILE_BASE =
  "flex h-16 w-16 items-center justify-center transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-2xl";

function tileClassFor(style: IconStyleId): string {
  switch (style) {
    case "filled":
      return `${TILE_BASE} rounded-2xl bg-tool-accent text-white shadow-md group-hover:opacity-90`;
    case "squircle":
      return `${TILE_BASE} rounded-[28%] bg-tool-accent-soft text-tool-accent shadow-md ring-1 ring-inset ring-tool-accent/25 group-hover:ring-tool-accent/50`;
    case "rounded-square":
      return `${TILE_BASE} rounded-lg border border-white/25 bg-white/15 text-white backdrop-blur-xl group-hover:bg-white/25`;
    case "hairline":
    default:
      return `${TILE_BASE} rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-xl group-hover:bg-white/25 group-hover:border-white/30`;
  }
}

function tileGlyphTone(style: IconStyleId): string {
  if (style === "filled") return "text-white";
  if (style === "squircle") return "text-tool-accent";
  return "text-white";
}

export default function Launchpad({
  open,
  onClose,
  onOpenTool,
  onUninstall,
  onStore,
  items,
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ToolCategoryKey | "all">("all");
  const [menu, setMenu] = useState<{ slug: string; title: string; x: number; y: number } | null>(null);
  const { style: iconStyle } = useIconStyle();
  const tileCls = tileClassFor(iconStyle);
  const glyphTone = tileGlyphTone(iconStyle);

  useEffect(() => {
    if (!open) {
      setQ("");
      setFilter("all");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tools = useMemo(() => {
    const source = items ?? TOOLS;
    let list = filter === "all" ? source : source.filter((t) => t.category === filter);
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }
    return list;
  }, [q, filter, items]);

  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(null);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-label="All tools"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute inset-0 backdrop-blur-2xl"
            style={{ background: "rgba(15, 23, 42, 0.35)" }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative mx-auto flex h-full max-w-5xl flex-col px-6 pt-14 pb-20 sm:px-10"
          >
            {/* Close — explicit exit so users don't feel trapped */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close all tools"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition-colors hover:bg-white/20 sm:right-6 sm:top-6"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Search */}
            <div className="mx-auto w-full max-w-xl">
              <div className="relative">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-white/50"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search all tools"
                  className="w-full rounded-2xl border border-white/20 bg-white/15 py-3 pl-12 pr-5 text-center text-base text-white placeholder:text-white/60 backdrop-blur-xl focus:outline-none focus:border-white/40"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </FilterPill>
              {TOOL_CATEGORIES.map((c) => (
                <FilterPill
                  key={c.key}
                  active={filter === c.key}
                  onClick={() => setFilter(c.key)}
                >
                  {c.short}
                </FilterPill>
              ))}
            </div>

            {/* Grid */}
            <div className="mt-10 flex-1 overflow-y-auto px-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {tools.map((t, i) => (
                  <motion.button
                    key={t.slug}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.4) }}
                    onClick={() => {
                      onOpenTool(t.slug, t.title);
                      onClose();
                    }}
                    onContextMenu={(e) => {
                      if (!onUninstall) return;
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenu({
                        slug: t.slug,
                        title: t.title,
                        x: rect.left,
                        y: rect.top + rect.height + 6,
                      });
                    }}
                    className="group flex flex-col items-center gap-2"
                  >
                    {hasAppIcon(t.slug) ? (
                      <AppIcon
                        slug={t.slug}
                        size={64}
                        cornerPct={24}
                        mono
                        label={t.title}
                        className="transition-transform duration-200 group-hover:-translate-y-0.5"
                      />
                    ) : (
                      <span className={tileCls}>
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                          className={glyphTone}
                        >
                          <path d={TOOL_ICONS[t.icon] ?? TOOL_ICONS.home} />
                        </svg>
                      </span>
                    )}
                    <span className="line-clamp-2 max-w-[8rem] text-center text-[0.78rem] font-medium leading-tight tracking-tight text-white/95">
                      {t.title}
                    </span>
                  </motion.button>
                ))}
                {tools.length === 0 && (
                  <div className="col-span-full py-12 text-center text-sm text-white/70">
                    {items && items.length === 0
                      ? "No tools installed yet. Open the Store to add some."
                      : "No tools match."}
                    {onStore && items && items.length === 0 && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onStore();
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-xl hover:bg-white/20 transition-colors"
                        >
                          Open the Tool Store
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Esc hint — bottom of the overlay, out of the way of the search */}
            <div className="pointer-events-none mt-4 text-center text-[11px] text-white/50">
              Press <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans">Esc</kbd> to return to the desktop
            </div>
          </motion.div>

          {/* Context menu — offers uninstall */}
          {menu && onUninstall && (
            <div
              role="menu"
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute z-[60] rounded-lg border border-white/20 bg-white/10 p-1 backdrop-blur-xl"
              style={{ left: menu.x, top: menu.y }}
            >
              <div className="px-2 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-white/60">
                {menu.title}
              </div>
              <button
                type="button"
                onClick={() => {
                  onUninstall(menu.slug);
                  setMenu(null);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/20 transition-colors"
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

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs backdrop-blur-xl transition-colors ${
        active
          ? "border border-white/40 bg-white/25 text-white"
          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
