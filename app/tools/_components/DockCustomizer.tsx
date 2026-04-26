"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { TOOL_ICONS, toolBySlug, type ToolItem } from "../_data/tools-list";

interface Props {
  open: boolean;
  onClose: () => void;
  /* All tools the user has installed — source of "available to pin" */
  installedTools: ToolItem[];
  /* Current pinned-order from useDockOrder */
  pinnedSlugs: string[];
  setPinnedSlugs: (slugs: string[]) => void;
  togglePin: (slug: string) => void;
  movePin: (slug: string, direction: "left" | "right") => void;
  resetToDefault: () => void;
}

/* DockCustomizer — modal overlay that lets the user reorder dock icons and
 * pin/unpin tools. Mirrors the AppStore visual treatment (backdrop blur,
 * rounded card, foundation tokens). Drag-to-reorder for keyboard-light UX
 * plus left/right arrow buttons for accessibility. */

export default function DockCustomizer({
  open,
  onClose,
  installedTools,
  pinnedSlugs,
  setPinnedSlugs,
  togglePin,
  movePin,
  resetToDefault,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Pinned tools resolved against the tool catalog. Skips slugs we don't
  // recognize (could happen if a tool was retired but still in storage).
  const pinnedTools = useMemo(() => {
    return pinnedSlugs
      .map((slug) => toolBySlug(slug))
      .filter((t): t is ToolItem => Boolean(t));
  }, [pinnedSlugs]);

  // Available = installed tools that are NOT already pinned.
  const availableTools = useMemo(() => {
    const pinSet = new Set(pinnedSlugs);
    return installedTools.filter((t) => !pinSet.has(t.slug));
  }, [installedTools, pinnedSlugs]);

  // Drag-and-drop on the pinned column. Uses simple HTML5 DnD for zero-deps.
  const [dragSlug, setDragSlug] = useState<string | null>(null);
  const [dragOverSlug, setDragOverSlug] = useState<string | null>(null);
  const dragSlugRef = useRef<string | null>(null);

  const onDragStart = (slug: string) => {
    setDragSlug(slug);
    dragSlugRef.current = slug;
  };
  const onDragEnd = () => {
    setDragSlug(null);
    setDragOverSlug(null);
    dragSlugRef.current = null;
  };
  const onDragOverItem = (e: React.DragEvent, slug: string) => {
    e.preventDefault();
    setDragOverSlug(slug);
  };
  const onDropItem = (e: React.DragEvent, targetSlug: string) => {
    e.preventDefault();
    const source = dragSlugRef.current;
    setDragSlug(null);
    setDragOverSlug(null);
    dragSlugRef.current = null;
    if (!source || source === targetSlug) return;
    const fromIdx = pinnedSlugs.indexOf(source);
    const toIdx = pinnedSlugs.indexOf(targetSlug);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = pinnedSlugs.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setPinnedSlugs(next);
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
          aria-label="Customize Dock"
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
            className="relative z-10 mx-auto flex h-[min(82vh,720px)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
            style={{ marginTop: "8vh" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-app bg-app-elevated px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-strong text-app">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={TOOL_ICONS.dots9} />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-app">
                  Customize Dock
                </div>
                <div className="text-[11px] text-muted">
                  Drag to reorder, click to pin or unpin. Changes save automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close customize dock"
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

            {/* Body — two columns */}
            <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
              {/* Pinned (left) */}
              <section className="flex min-h-0 flex-col border-b border-app md:border-b-0 md:border-r">
                <div className="border-b border-app px-6 py-3">
                  <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                    On the dock
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {pinnedTools.length} pinned
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {pinnedTools.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted">
                      No pinned tools. Add some from the right.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {pinnedTools.map((tool, idx) => {
                        const dragging = dragSlug === tool.slug;
                        const dropTarget =
                          dragOverSlug === tool.slug && dragSlug !== tool.slug;
                        return (
                          <li
                            key={tool.slug}
                            draggable
                            onDragStart={() => onDragStart(tool.slug)}
                            onDragEnd={onDragEnd}
                            onDragOver={(e) => onDragOverItem(e, tool.slug)}
                            onDrop={(e) => onDropItem(e, tool.slug)}
                            className={`group flex items-center gap-2 rounded-lg border bg-app p-2 transition-colors ${
                              dragging
                                ? "border-app-hover opacity-50"
                                : dropTarget
                                ? "border-app-hover bg-surface"
                                : "border-app hover:border-app-hover"
                            }`}
                          >
                            {/* Drag handle */}
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
                              title="Drag to reorder"
                            >
                              <svg
                                width="10"
                                height="14"
                                viewBox="0 0 10 14"
                                fill="currentColor"
                              >
                                <circle cx="2" cy="2" r="1" />
                                <circle cx="2" cy="7" r="1" />
                                <circle cx="2" cy="12" r="1" />
                                <circle cx="8" cy="2" r="1" />
                                <circle cx="8" cy="7" r="1" />
                                <circle cx="8" cy="12" r="1" />
                              </svg>
                            </span>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-app">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path
                                  d={
                                    TOOL_ICONS[tool.icon] ?? TOOL_ICONS.home
                                  }
                                />
                              </svg>
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[0.8rem] font-medium text-app">
                                {tool.title}
                              </div>
                              <div className="truncate text-[10px] text-muted">
                                Position {idx + 1} of {pinnedTools.length}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => movePin(tool.slug, "left")}
                                disabled={idx === 0}
                                aria-label={`Move ${tool.title} left`}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-app text-secondary transition-colors hover:bg-surface hover:text-app disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-secondary"
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
                                  <path d="M15 18l-6-6 6-6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => movePin(tool.slug, "right")}
                                disabled={idx === pinnedTools.length - 1}
                                aria-label={`Move ${tool.title} right`}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-app text-secondary transition-colors hover:bg-surface hover:text-app disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-secondary"
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
                                  <path d="M9 6l6 6-6 6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePin(tool.slug)}
                                aria-label={`Remove ${tool.title} from dock`}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-app text-secondary transition-colors hover:bg-surface hover:text-app"
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
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              {/* Available (right) */}
              <section className="flex min-h-0 flex-col">
                <div className="border-b border-app px-6 py-3">
                  <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                    Available tools
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    Click a tool to pin it to the dock.
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {availableTools.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted">
                      Every installed tool is already pinned. Install more from
                      the Tool Store.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {availableTools.map((tool) => (
                        <li key={tool.slug}>
                          <button
                            type="button"
                            onClick={() => togglePin(tool.slug)}
                            className="flex w-full items-center gap-2 rounded-lg border border-app bg-app p-2 text-left transition-colors hover:border-app-hover hover:bg-surface"
                            aria-label={`Pin ${tool.title} to dock`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-app">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path
                                  d={
                                    TOOL_ICONS[tool.icon] ?? TOOL_ICONS.home
                                  }
                                />
                              </svg>
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[0.8rem] font-medium text-app">
                                {tool.title}
                              </div>
                              <div className="truncate text-[10px] text-muted">
                                {tool.description}
                              </div>
                            </div>
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-app text-secondary"
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
                              >
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-app bg-app-elevated px-6 py-3">
              <div className="text-[11px] text-muted">
                Drag the rows on the left to reorder. Use the arrows for
                keyboard-friendly nudges.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetToDefault}
                  className="rounded-md border border-app bg-surface px-3 py-1.5 text-[0.72rem] text-secondary transition-colors hover:text-app"
                >
                  Reset to default
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-app px-3 py-1.5 text-[0.72rem] font-medium text-app hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
