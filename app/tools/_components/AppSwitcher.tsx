"use client";

/* AppSwitcher — ⌘Tab / Ctrl+Tab overlay.
 *
 * Behavior (matches macOS Cmd-Tab):
 *   - Press ⌘Tab (or Ctrl+Tab) with at least one window open → overlay opens
 *     showing horizontally-arranged cards of every open window.
 *   - Overlay stays open WHILE the modifier (⌘ or Ctrl) is held.
 *   - Pressing Tab again advances the highlight; Shift+Tab reverses.
 *   - Releasing the modifier focuses the highlighted window and closes.
 *   - Esc dismisses without focusing.
 *   - ⌘`  cycles between windows of the SAME tool (multi-instance).
 *
 * Order:
 *   Most-recently-focused first (sorted by z descending), so the first Tab
 *   press lands on the previously-active window — matching macOS.
 *
 * Mobile:
 *   Hidden — mobile has its own switcher in MobileShell, and ⌘Tab is
 *   reserved by the OS / browser anyway.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TOOL_ICONS, toolBySlug } from "../_data/tools-list";
import type { WindowState } from "./useWindowManager";

interface Props {
  windows: WindowState[];
  onFocus: (id: string) => void;
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

export default function AppSwitcher({ windows, onFocus }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // sameTool = true when the user hit ⌘` to cycle within one tool's windows.
  const [sameTool, setSameTool] = useState<string | null>(null);
  // Snapshot the window order at overlay-open so it doesn't reshuffle as we
  // cycle (focus() bumps z, which would reorder mid-cycle and feel jittery).
  const snapshotRef = useRef<WindowState[]>([]);

  // Build the list to render. When sameTool is set, filter to that slug.
  const list = useMemo(() => {
    if (!open) return [];
    const base = snapshotRef.current.length
      ? snapshotRef.current
      : [...windows].sort((a, b) => b.z - a.z);
    return sameTool ? base.filter((w) => w.slug === sameTool) : base;
  }, [open, windows, sameTool]);

  const close = useCallback(() => {
    setOpen(false);
    setSameTool(null);
    setIndex(0);
    snapshotRef.current = [];
  }, []);

  const commit = useCallback(() => {
    const target = list[index];
    if (target) onFocus(target.id);
    close();
  }, [list, index, onFocus, close]);

  // Hotkey listener — runs once. Reads current windows via a ref-ish closure
  // by depending on the freshest array each render (re-binds the listener).
  useEffect(() => {
    const winsRef = windows;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept while typing into a form field.
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      // ⌘Tab / Ctrl+Tab — open / advance
      if (mod && e.key === "Tab") {
        if (winsRef.length === 0) return;
        e.preventDefault();
        if (!open) {
          // Snapshot ordered by most-recently-focused first.
          const ordered = [...winsRef].sort((a, b) => b.z - a.z);
          snapshotRef.current = ordered;
          setOpen(true);
          setSameTool(null);
          // Initial highlight: second item if available (matches macOS — first
          // Tab moves to the prior window). Otherwise stay on first.
          setIndex(ordered.length > 1 ? 1 : 0);
          return;
        }
        // Already open — advance / reverse highlight.
        const dir = e.shiftKey ? -1 : 1;
        setIndex((i) => {
          const len = list.length || winsRef.length;
          if (len === 0) return 0;
          return (i + dir + len) % len;
        });
        return;
      }

      // ⌘` / Ctrl+` — cycle within the same tool (multi-instance).
      if (mod && e.key === "`") {
        if (winsRef.length === 0) return;
        e.preventDefault();
        const ordered = [...winsRef].sort((a, b) => b.z - a.z);
        const topSlug = ordered[0]?.slug;
        if (!topSlug) return;
        const sameSlug = ordered.filter((w) => w.slug === topSlug);
        if (sameSlug.length < 2) return;
        if (!open) {
          snapshotRef.current = sameSlug;
          setSameTool(topSlug);
          setOpen(true);
          setIndex(1);
        } else {
          // Cycle one further within the same-tool subset.
          const dir = e.shiftKey ? -1 : 1;
          setIndex((i) => (i + dir + sameSlug.length) % sameSlug.length);
        }
        return;
      }

      // Esc dismisses without focusing.
      if (open && e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!open) return;
      // Releasing the modifier commits the highlighted choice.
      if (e.key === "Meta" || e.key === "Control") {
        commit();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [windows, open, list.length, commit, close]);

  // Auto-close if all windows close while overlay is open.
  useEffect(() => {
    if (open && windows.length === 0) close();
  }, [open, windows.length, close]);

  return (
    <AnimatePresence>
      {open && list.length > 0 && (
        <motion.div
          key="app-switcher-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="hidden sm:flex fixed inset-0 z-[85] items-center justify-center bg-black/40 backdrop-blur-md"
          aria-hidden="false"
          role="dialog"
          aria-label="Application switcher"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="sf-glass-window max-w-[92vw] overflow-x-auto rounded-2xl px-4 py-4"
          >
            <div className="flex items-end gap-2">
              {list.map((w, i) => {
                const tool = toolBySlug(w.slug);
                const iconKey = tool?.icon;
                const path = iconKey ? TOOL_ICONS[iconKey] : null;
                const active = i === index;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      // Click commits immediately.
                      const target = list[i];
                      if (target) onFocus(target.id);
                      close();
                    }}
                    onMouseEnter={() => setIndex(i)}
                    className={
                      "group flex w-24 flex-col items-center gap-1 rounded-xl border p-3 transition-colors " +
                      (active
                        ? "border-tool-accent bg-tool-accent-soft text-app"
                        : "border-transparent hover:border-app hover:bg-surface text-secondary")
                    }
                  >
                    <div
                      className={
                        "flex h-14 w-14 items-center justify-center rounded-xl " +
                        (active
                          ? "bg-app-elevated text-tool-accent"
                          : "bg-surface text-secondary group-hover:text-app")
                      }
                    >
                      {path ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d={path} />
                        </svg>
                      ) : (
                        <span className="text-xs font-semibold">
                          {w.title.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="line-clamp-1 max-w-full text-[11px] font-medium">
                      {w.title}
                    </span>
                    {i === 0 && !sameTool && (
                      <span className="text-[9px] uppercase tracking-wider text-faint">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-faint">
              <span>
                {sameTool
                  ? "Cycle within tool"
                  : "Hold modifier, Tab to advance, Shift+Tab to reverse"}
              </span>
              <span>Release to switch · Esc to cancel</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
