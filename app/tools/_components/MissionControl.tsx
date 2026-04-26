"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { TOOL_ICONS, toolBySlug } from "../_data/tools-list";
import type { WindowState } from "./useWindowManager";

interface Props {
  open: boolean;
  windows: WindowState[];
  /** Bring a window to the foreground (and unminimize it). */
  onFocus: (id: string) => void;
  /** Close one window. */
  onCloseWindow: (id: string) => void;
  /** Wipe all windows. */
  onCloseAll: () => void;
  /** Dismiss the exposé overlay. */
  onClose: () => void;
}

/* Mission Control — macOS-style window exposé.
 *
 * Live thumbnails of arbitrary iframe content aren't possible cross-origin
 * (and even same-origin would require html2canvas-class hackery), so each
 * window is represented by a STYLIZED card: tool icon, title, dimensions,
 * minimized pill, and a row of traffic-light dots. Click a card → focus
 * + close exposé. Esc dismisses. Stagger-in animation. */
export default function MissionControl({
  open,
  windows,
  onFocus,
  onCloseWindow,
  onCloseAll,
  onClose,
}: Props) {
  // Esc key closes the overlay
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Sort by z-index descending so the active window appears first
  const sorted = useMemo(
    () => [...windows].sort((a, b) => b.z - a.z),
    [windows],
  );

  const handlePick = (id: string) => {
    onFocus(id);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[55]"
          role="dialog"
          aria-label="Mission Control — all open windows"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* Backdrop with strong blur — same vibe as Launchpad */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 backdrop-blur-2xl"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}
          />

          {/* Foreground content shell */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative mx-auto flex h-full max-w-7xl flex-col px-6 pt-14 pb-24 sm:px-10"
          >
            {/* Close — explicit exit so users never feel trapped */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Mission Control"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xl transition-colors hover:bg-white/20 sm:right-6 sm:top-6"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="mx-auto mb-8 flex w-full max-w-3xl flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Mission Control
              </h1>
              <p className="text-[0.78rem] text-white/65">
                {windows.length === 0
                  ? "No windows are open"
                  : windows.length === 1
                    ? "1 window open"
                    : `${windows.length} windows open`}
                {" "}
                <span className="text-white/40"> · Click any card to focus, or press </span>
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-sans text-white/85">
                  Esc
                </kbd>
                <span className="text-white/40"> to dismiss</span>
              </p>
            </div>

            {/* Grid (or empty state) */}
            <div className="flex-1 overflow-y-auto px-1">
              {sorted.length === 0 ? (
                <EmptyState />
              ) : (
                <div
                  className="grid gap-5"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(280px, 1fr))",
                  }}
                >
                  {sorted.map((w, i) => (
                    <WindowCard
                      key={w.id}
                      win={w}
                      index={i}
                      onPick={() => handlePick(w.id)}
                      onClose={() => onCloseWindow(w.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer — Close all button */}
            {sorted.length > 0 && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    onCloseAll();
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-xl transition-colors hover:bg-white/20"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Close all windows
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────── Window card ───────────── */

function WindowCard({
  win,
  index,
  onPick,
  onClose,
}: {
  win: WindowState;
  index: number;
  onPick: () => void;
  onClose: () => void;
}) {
  const tool = toolBySlug(win.slug);
  const iconKey = tool?.icon ?? "home";
  const iconPath = TOOL_ICONS[iconKey] ?? TOOL_ICONS.home;
  const dims = `${Math.round(win.w)} × ${Math.round(win.h)}`;
  const isMin = win.minimized;

  return (
    <motion.div
      // Stagger in — capped delay so big lists don't take forever
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: isMin ? 0.55 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 16 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 26,
        delay: Math.min(index * 0.04, 0.4),
      }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onPick}
        className="block w-full overflow-hidden rounded-2xl border border-white/15 bg-white/10 text-left text-white shadow-2xl backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/15 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
      >
        {/* Faux titlebar — traffic lights + dimensions */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="block h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
            <span className="block h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
            <span className="block h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-white/50">
            {dims}
          </span>
        </div>

        {/* Card body — icon + title + meta */}
        <div className="flex h-32 flex-col items-center justify-center gap-3 px-4 py-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={iconPath} />
            </svg>
          </span>
          <div className="text-center">
            <div className="line-clamp-1 text-[0.85rem] font-semibold leading-tight text-white">
              {win.title}
            </div>
            {tool?.category && (
              <div className="mt-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-white/50">
                {tool.category}
              </div>
            )}
          </div>
        </div>

        {/* Status row — minimized / maximized pills */}
        {(isMin || win.maximized) && (
          <div className="flex items-center justify-center gap-1.5 border-t border-white/10 bg-white/5 px-3 py-1.5">
            {isMin && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-white/85">
                <span className="block h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                Minimized
              </span>
            )}
            {win.maximized && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-white/85">
                <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Maximized
              </span>
            )}
          </div>
        )}
      </button>

      {/* Per-card close — appears on hover, doesn't trigger card focus */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${win.title}`}
        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-[#ff5f57] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}

/* ───────────── Empty state ───────────── */

function EmptyState() {
  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
      {/* Stylised illustration — three faded "windows" stacked */}
      <div className="relative mb-6 h-32 w-44">
        <div className="absolute left-2 top-6 h-20 w-32 rounded-xl border border-white/15 bg-white/5 backdrop-blur-xl" />
        <div className="absolute left-6 top-3 h-20 w-32 rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl" />
        <div className="absolute left-10 top-0 flex h-20 w-32 flex-col rounded-xl border border-white/30 bg-white/15 backdrop-blur-xl">
          <div className="flex items-center gap-1 border-b border-white/15 px-2 py-1.5">
            <span className="block h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
            <span className="block h-1.5 w-1.5 rounded-full bg-[#febc2e]" />
            <span className="block h-1.5 w-1.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-white/45">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
        </div>
      </div>
      <h2 className="text-base font-semibold text-white">No open windows</h2>
      <p className="mt-1.5 max-w-sm text-[0.8rem] text-white/65">
        Open a tool from the dock or press{" "}
        <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans text-[0.7rem] text-white/85">
          ⌘ K
        </kbd>{" "}
        to launch one.
      </p>
    </div>
  );
}
