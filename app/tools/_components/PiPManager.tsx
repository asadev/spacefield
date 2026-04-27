"use client";

/* PiPManager — picture-in-picture + window-close shortcuts.
 *
 * This component owns the keyboard handlers for:
 *   ⌘⇧P  — pin focused window (or unpin if already pinned)
 *   ⌘W   — close focused window
 *   ⌘⇧W  — close all windows of the focused window's tool
 *   ⌘⌥W  — close all windows globally
 *
 * Why one component:
 *   These are all single-keystroke window operations that need the same
 *   "focused window = highest z" lookup. Co-locating keeps the surface
 *   small and avoids competing keydown listeners.
 *
 * Pinned (PiP) state itself lives on WindowState in useWindowManager — the
 * Window component reads `win.pinned` to render fixed bottom-right.
 */

import { useEffect } from "react";
import type { WindowState } from "./useWindowManager";

interface Props {
  windows: WindowState[];
  pinWindow: (id: string) => void;
  unpinWindow: (id: string) => void;
  close: (id: string) => void;
  closeAll: () => void;
  closeAllOfSlug: (slug: string) => void;
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

/** Focused window = pinned wins (it's always on top), else highest z that
 *  isn't minimized. Returns undefined if there's nothing to act on. */
function focusedWindow(windows: WindowState[]): WindowState | undefined {
  if (windows.length === 0) return undefined;
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length === 0) return undefined;
  // Pinned window has visual priority but for keyboard targeting we use
  // the highest-z normal window so ⌘W on a normal window still closes the
  // one the user was looking at, not the PiP. PiP gets its own ⌘⇧P toggle.
  const sorted = [...visible].sort((a, b) => b.z - a.z);
  return sorted[0];
}

export default function PiPManager({
  windows,
  pinWindow,
  unpinWindow,
  close,
  closeAll,
  closeAllOfSlug,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Don't intercept while typing — the user might be using ⌘W in a
      // text field for a different purpose, and ⌘⇧P is fine to let through.
      if (isEditableTarget(e.target)) return;

      // ⌘⇧P — toggle PiP for focused window
      if (e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        const top = focusedWindow(windows);
        if (!top) return;
        e.preventDefault();
        // If something is already pinned and it's not the top window, pin
        // the top window (which auto-unpins the previous one). If the top
        // window IS the pinned one, toggle off.
        const currentlyPinned = windows.find((w) => w.pinned);
        if (currentlyPinned && currentlyPinned.id === top.id) {
          unpinWindow(top.id);
        } else {
          pinWindow(top.id);
        }
        return;
      }

      // ⌘⌥W — close all windows globally (most-aggressive, most-modifiers)
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "w") {
        if (windows.length === 0) return;
        e.preventDefault();
        closeAll();
        return;
      }

      // ⌘⇧W — close all windows of the focused window's tool
      if (e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        const top = focusedWindow(windows);
        if (!top) return;
        e.preventDefault();
        closeAllOfSlug(top.slug);
        return;
      }

      // ⌘W — close focused window
      if (!e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        const top = focusedWindow(windows);
        if (!top) return;
        e.preventDefault();
        close(top.id);
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [windows, pinWindow, unpinWindow, close, closeAll, closeAllOfSlug]);

  // Pure controller — renders nothing.
  return null;
}
