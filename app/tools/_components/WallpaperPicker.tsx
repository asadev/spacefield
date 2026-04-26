"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { TOOL_ICONS } from "../_data/tools-list";
import {
  DEFAULT_WALLPAPER_ID,
  WALLPAPER_CHANGE_EVENT,
  WALLPAPER_STORAGE_SUFFIX,
  WALLPAPERS,
  type Wallpaper,
  type WallpaperType,
} from "./wallpapers";
import { useWorkspaceKey } from "./useWorkspaces";

/* WallpaperPicker — modal overlay for swapping the desktop background.
 * Mirrors the AppStore / WidgetGallery / DockCustomizer treatment:
 * blurred backdrop, spring-in panel, foundation tokens throughout. */

interface Props {
  open: boolean;
  onClose: () => void;
}

const TABS: { id: WallpaperType; label: string }[] = [
  { id: "gradient", label: "Gradients" },
  { id: "photo", label: "Photos" },
  { id: "interactive", label: "Interactive" },
];

export default function WallpaperPicker({ open, onClose }: Props) {
  const WALLPAPER_STORAGE_KEY = useWorkspaceKey(WALLPAPER_STORAGE_SUFFIX);
  const [activeTab, setActiveTab] = useState<WallpaperType>("gradient");
  const [activeId, setActiveId] = useState<string>(DEFAULT_WALLPAPER_ID);

  // Hydrate from storage every time the modal opens so the highlighted
  // tile reflects the current selection (e.g. after a tab switch).
  useEffect(() => {
    if (!open) return;
    try {
      const id = localStorage.getItem(WALLPAPER_STORAGE_KEY);
      if (id) setActiveId(id);
    } catch {}
  }, [open, WALLPAPER_STORAGE_KEY]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const grouped = useMemo(() => {
    return WALLPAPERS.filter((w) => w.type === activeTab);
  }, [activeTab]);

  const pick = (w: Wallpaper) => {
    setActiveId(w.id);
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, w.id);
    } catch {}
    // Same-tab broadcast — DesktopBackground listens for this.
    window.dispatchEvent(new Event(WALLPAPER_CHANGE_EVENT));
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
          className="fixed inset-0 z-50"
          role="dialog"
          aria-label="Wallpaper Picker"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            className="absolute inset-0 backdrop-blur-xl"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative z-10 mx-auto flex h-[min(78vh,680px)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
            style={{ marginTop: "9vh" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-app bg-app-elevated px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d={
                      TOOL_ICONS.image ??
                      TOOL_ICONS.palette ??
                      TOOL_ICONS.dashboard ??
                      TOOL_ICONS.home
                    }
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-app">
                  Wallpaper — pick your desktop look
                </div>
                <div className="text-[11px] text-muted">
                  Choose a gradient, a photo, or an interactive scene. Saves automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close wallpaper picker"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary hover:bg-surface hover:text-app transition-colors"
              >
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
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-app bg-app-elevated px-4 py-2">
              {TABS.map((t) => {
                const active = activeTab === t.id;
                const count = WALLPAPERS.filter((w) => w.type === t.id).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[0.78rem] transition-colors ${
                      active
                        ? "bg-surface-strong text-app"
                        : "text-secondary hover:bg-surface hover:text-app"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                        active ? "bg-app-elevated text-app" : "bg-surface text-muted"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Body — grid of wallpaper tiles */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {grouped.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">
                  No wallpapers in this category yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {grouped.map((w) => {
                    const selected = activeId === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => pick(w)}
                        aria-pressed={selected}
                        aria-label={`Use wallpaper ${w.name}`}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-app text-left transition-all ${
                          selected
                            ? "border-tool-accent ring-2 ring-tool-accent ring-offset-2 ring-offset-[var(--bg-elevated,_#0a0a0a)]"
                            : "border-app hover:border-app-hover"
                        }`}
                      >
                        {/* Preview swatch */}
                        <div
                          className="relative aspect-[16/10] w-full"
                          style={{ background: w.preview }}
                        >
                          {w.type === "interactive" && (
                            <span className="absolute left-2 top-2 rounded-full bg-app/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-app backdrop-blur-md">
                              Live
                            </span>
                          )}
                          {selected && (
                            <span
                              aria-hidden="true"
                              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-tool-accent text-black shadow-lg"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M5 12l5 5L20 7" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="truncate text-[0.78rem] font-medium text-app">
                            {w.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
                            {w.type}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-app bg-app-elevated px-6 py-3">
              <div className="text-[11px] text-muted">
                Click a tile to apply. Your choice is remembered between sessions.
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-app px-3 py-1.5 text-[0.72rem] font-medium text-app hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
