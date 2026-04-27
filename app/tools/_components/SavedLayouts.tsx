"use client";

/* SavedLayouts — save & restore window arrangements.
 *
 * UX:
 *   ⌘⇧L (Cmd-Shift-L) toggles a small modal listing saved layouts. Each
 *   layout captures slugs + bounds + initialParams of every open window.
 *   Restoring closes current windows and re-opens the saved set in their
 *   recorded positions/sizes.
 *
 * Storage:
 *   ws:<workspaceId>:layouts:v1   →   Layout[]
 *
 * Restore mechanics:
 *   1. closeAll() to clear the desktop.
 *   2. Iterate the saved list and call open(slug, title, params, {x,y,w,h}).
 *   The window manager's `open()` accepts an optional initialBounds arg.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toolBySlug } from "../_data/tools-list";
import type { WindowState } from "./useWindowManager";
import { useWorkspaceKey } from "./useWorkspaces";

export interface SavedLayoutWindow {
  slug: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  params?: Record<string, unknown>;
}

export interface Layout {
  id: string;
  name: string;
  createdAt: number;
  windows: SavedLayoutWindow[];
}

interface Props {
  windows: WindowState[];
  closeAll: () => void;
  open: (
    slug: string,
    title: string,
    params?: Record<string, unknown>,
    initialBounds?: { x: number; y: number; w: number; h: number },
  ) => void;
}

const STORAGE_SUFFIX = "layouts:v1";

function safeParse(raw: string | null): Layout[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v as Layout[];
  } catch {}
  return [];
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}

export default function SavedLayouts({ windows, closeAll, open: openWin }: Props) {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [visible, setVisible] = useState(false);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Hydrate
  useEffect(() => {
    setLayouts(safeParse(localStorage.getItem(STORAGE_KEY)));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
    } catch {}
  }, [layouts, hydrated, STORAGE_KEY]);

  // Hotkey: ⌘⇧L toggles
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setVisible((v) => !v);
      }
      if (visible && e.key === "Escape") {
        e.preventDefault();
        setVisible(false);
        setRenaming(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  const sortedLayouts = useMemo(
    () => [...layouts].sort((a, b) => b.createdAt - a.createdAt),
    [layouts],
  );
  const lastSaved = sortedLayouts[0];

  const saveCurrent = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (windows.length === 0) return;
    const layout: Layout = {
      id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      createdAt: Date.now(),
      windows: windows.map((w) => ({
        slug: w.slug,
        title: w.title,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        params: w.initialParams,
      })),
    };
    setLayouts((prev) => [layout, ...prev]);
    setName("");
  }, [name, windows]);

  const restoreLayout = useCallback(
    (layout: Layout) => {
      closeAll();
      // Defer one tick so the close finishes before re-opening (state batches
      // would otherwise risk race conditions with the manager's effects).
      setTimeout(() => {
        layout.windows.forEach((w) => {
          const tool = toolBySlug(w.slug);
          openWin(w.slug, tool?.title ?? w.title, w.params, {
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
          });
        });
      }, 30);
      setVisible(false);
    },
    [closeAll, openWin],
  );

  const deleteLayout = useCallback((id: string) => {
    setLayouts((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const startRename = (l: Layout) => {
    setRenaming(l.id);
    setRenameValue(l.name);
  };
  const commitRename = () => {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenaming(null);
      return;
    }
    setLayouts((prev) =>
      prev.map((l) => (l.id === renaming ? { ...l, name: trimmed } : l)),
    );
    setRenaming(null);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="hidden sm:flex fixed inset-0 z-[80] items-center justify-center bg-black/40 backdrop-blur-md"
          onClick={() => setVisible(false)}
          role="dialog"
          aria-label="Saved window layouts"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[440px] max-w-[92vw] overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
          >
            <div className="border-b border-app px-5 py-3">
              <div className="text-sm font-semibold text-app">Window layouts</div>
              <div className="mt-0.5 text-[11px] text-faint">
                Save the current arrangement, restore it on demand.
              </div>
            </div>

            {/* Save current */}
            <div className="border-b border-app px-5 py-3">
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-faint">
                Save current as…
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCurrent();
                    }
                  }}
                  placeholder={
                    windows.length === 0
                      ? "Open some windows first"
                      : "e.g. Morning research"
                  }
                  disabled={windows.length === 0}
                  className="flex-1 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={saveCurrent}
                  disabled={windows.length === 0 || !name.trim()}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              {windows.length > 0 && (
                <div className="mt-1.5 text-[11px] text-faint">
                  Captures {windows.length} window
                  {windows.length === 1 ? "" : "s"}.
                </div>
              )}
            </div>

            {/* Quick-restore last saved */}
            {lastSaved && (
              <button
                type="button"
                onClick={() => restoreLayout(lastSaved)}
                className="flex w-full items-center justify-between border-b border-app bg-tool-accent-soft px-5 py-2.5 text-left transition-opacity hover:opacity-90"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-tool-accent">
                    Quick restore
                  </span>
                  <span className="text-sm font-medium text-app">
                    {lastSaved.name}
                  </span>
                </div>
                <span className="text-xs text-tool-accent">Restore</span>
              </button>
            )}

            {/* List */}
            <div className="max-h-72 overflow-y-auto">
              {sortedLayouts.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-faint">
                  No saved layouts yet.
                </div>
              ) : (
                sortedLayouts.map((l) => (
                  <div
                    key={l.id}
                    className="group flex items-center gap-2 border-b border-app px-5 py-2.5 last:border-0 hover:bg-surface"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      {renaming === l.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setRenaming(null);
                            }
                          }}
                          className="rounded border border-tool-accent bg-app px-2 py-0.5 text-sm text-app focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => startRename(l)}
                          onClick={() => restoreLayout(l)}
                          className="truncate text-left text-sm font-medium text-app"
                          title="Click to restore, double-click to rename"
                        >
                          {l.name}
                        </button>
                      )}
                      <span className="text-[11px] text-faint">
                        {l.windows.length} window
                        {l.windows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => restoreLayout(l)}
                        className="rounded px-2 py-1 text-[11px] text-secondary hover:bg-app-elevated hover:text-app"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(l)}
                        className="rounded px-2 py-1 text-[11px] text-secondary hover:bg-app-elevated hover:text-app"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLayout(l.id)}
                        className="rounded px-2 py-1 text-[11px] text-secondary hover:bg-app-elevated hover:text-app"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-app px-5 py-2 text-[10px] text-faint">
              <span>Cmd-Shift-L to toggle</span>
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="rounded px-2 py-0.5 hover:bg-surface hover:text-app"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
