"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { TOOL_ICONS } from "../_data/tools-list";
import { WIDGET_REGISTRY, useActiveWidgets } from "./Widgets";

/* Widget Gallery — modal for adding/removing desktop widgets.
 * Mirrors the AppStore.tsx visual pattern (overlay + spring-in panel,
 * Esc / outside-click to close) but scoped to the small widget catalog. */

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WidgetGallery({ open, onClose }: Props) {
  const { isActive, add, remove } = useActiveWidgets();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          aria-label="Widget Gallery"
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
            className="sf-glass-window relative z-10 mx-auto flex h-[min(72vh,640px)] max-w-2xl flex-col overflow-hidden rounded-2xl"
            style={{ marginTop: "10vh" }}
          >
            {/* Header */}
            <div className="sf-glass-titlebar flex items-center gap-3 px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent-soft text-app">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={TOOL_ICONS.dashboard ?? TOOL_ICONS.grid} />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-app">
                  Widgets — pick what to see on your desktop
                </div>
                <div className="text-[11px] text-muted">
                  Add or remove widgets at any time. They keep their position when you bring them back.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close widget gallery"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary hover:bg-surface hover:text-app transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {WIDGET_REGISTRY.map((w) => {
                  const active = isActive(w.id);
                  return (
                    <div
                      key={w.id}
                      className="flex items-start gap-3 rounded-lg border border-app bg-app p-3 transition-colors hover:border-app-hover"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-app">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d={TOOL_ICONS[w.iconKey] ?? TOOL_ICONS.home} />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-app">{w.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
                          {w.description}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {active ? (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-full border border-app bg-surface px-2.5 py-1 text-[0.7rem] text-secondary">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M5 12l5 5L20 7" />
                                </svg>
                                Already on desktop
                              </span>
                              <button
                                type="button"
                                onClick={() => remove(w.id)}
                                className="rounded-md border border-app bg-surface px-2.5 py-1 text-[0.7rem] text-secondary hover:text-app transition-colors"
                              >
                                Remove
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => add(w.id)}
                              className="rounded-md bg-app px-2.5 py-1 text-[0.7rem] font-medium text-app hover:opacity-90 transition-opacity"
                            >
                              Add to desktop
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
