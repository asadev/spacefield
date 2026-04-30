"use client";

/**
 * Quick Note (⌃⌘N).
 *
 * Focused composer modal: a single textarea, a tiny markdown toolbar
 * (B, I, link, list), Save / Cancel. ⌘Enter saves; ESC cancels (with
 * a confirm if there's content).
 *
 * On save, POSTs to /api/files/save-content with the active workspace id
 * and a name like `Quick Note <timestamp>.md`. The user finds it in
 * Files Manager / Documents afterwards.
 *
 * Hot-corner integration: reads `tools-desktop-hot-corner-actions-v1`
 * from localStorage. If a corner is set to `quick-note`, the same dialog
 * pops when that corner fires (we listen for a custom event the
 * HotCorners component dispatches; if not dispatched we still respect
 * the keyboard shortcut).
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVE_WORKSPACE_KEY = "workspaces:active:v1";
const HOT_CORNER_ACTIONS_PREFIX = "tools-desktop-hot-corner-actions-v1";

function btoaUtf8(s: string): string {
  // btoa with Unicode-safe encoding (matches what the save-content API expects).
  return btoa(unescape(encodeURIComponent(s)));
}

export default function QuickNote() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* Hotkey ⌃⌘N opens. Cmd+Enter saves (handled on the textarea). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌃⌘N — Control AND Meta + N. We accept Ctrl+N as a fallback on
      // non-Mac keyboards, but only when NOT typing in an input.
      const isQuickN =
        (e.ctrlKey && e.metaKey && e.key.toLowerCase() === "n") ||
        (e.ctrlKey && !e.metaKey && e.shiftKey && e.key.toLowerCase() === "n");
      if (isQuickN) {
        const tgt = document.activeElement as HTMLElement | null;
        const editable =
          tgt instanceof HTMLElement &&
          (tgt.tagName === "INPUT" ||
            tgt.tagName === "TEXTAREA" ||
            tgt.isContentEditable);
        if (editable && open) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Hot-corner integration. We listen for a custom event named
   * `quick-note:open`, which any caller (e.g. a hot-corner handler) can
   * dispatch. We also peek at the configured hot-corner actions on
   * mount to support a future wiring; today the open path is the event +
   * the hotkey. */
  useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("quick-note:open", onOpenEvent);
    return () => window.removeEventListener("quick-note:open", onOpenEvent);
  }, []);

  /* Whenever a hot-corner fires, HotCorners.tsx switches on the action.
   * We don't own that file, so we install a fallback listener: if any
   * corner element receives a pointerenter that holds for the configured
   * delay AND its action is `quick-note`, fire the open event. We read
   * the per-workspace key suffix lazily so this works regardless of
   * which workspace is active. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number | null = null;
    const FIRE_MS = 250;
    const findActions = (): Record<string, string> | null => {
      // The actual key name is workspace-prefixed, but the suffix is
      // identical. Iterate localStorage to find the matching key.
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.endsWith(HOT_CORNER_ACTIONS_PREFIX)) {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw) as Record<string, string>;
          }
        }
      } catch {}
      return null;
    };
    const onEnter = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const corner = target?.getAttribute?.("data-hot-corner");
      if (!corner) return;
      const actions = findActions();
      if (!actions) return;
      if (actions[corner] !== "quick-note") return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setOpen(true);
        timer = null;
      }, FIRE_MS);
    };
    const onLeave = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    document.addEventListener("pointerenter", onEnter, true);
    document.addEventListener("pointerleave", onLeave, true);
    return () => {
      document.removeEventListener("pointerenter", onEnter, true);
      document.removeEventListener("pointerleave", onLeave, true);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  /* On open, autofocus and clear the previous content. */
  useEffect(() => {
    if (open) {
      setContent("");
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [open]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const trimmed = content.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    const workspaceId =
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_WORKSPACE_KEY)
        : null;
    if (!workspaceId) {
      setToast("No active workspace");
      window.setTimeout(() => setToast(null), 2000);
      return;
    }
    setSaving(true);
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const name = `Quick Note ${stamp}.md`;
    try {
      const res = await fetch("/api/files/save-content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          contentType: "text/markdown",
          contentBase64: btoaUtf8(trimmed),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setToast(err.error ? `Save failed: ${err.error}` : "Save failed");
        window.setTimeout(() => setToast(null), 2400);
      } else {
        setToast("Saved to Files");
        setOpen(false);
        window.setTimeout(() => setToast(null), 1800);
      }
    } catch {
      setToast("Save failed");
      window.setTimeout(() => setToast(null), 2400);
    } finally {
      setSaving(false);
    }
  }, [content, saving]);

  const handleCancel = useCallback(() => {
    if (content.trim()) {
      const ok = window.confirm("Discard this note?");
      if (!ok) return;
    }
    setOpen(false);
  }, [content]);

  const onTextareaKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  /* Wrap the current selection in markdown markers. Pure DOM-side mutation
   * on the textarea — no rich-text engine, just a tiny convenience. */
  const wrap = useCallback((before: string, after: string = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const selected = value.slice(start, end) || "";
    const next =
      value.slice(0, start) + before + selected + after + value.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = end + before.length;
    });
  }, []);

  const insertList = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(start);
    const prefix = before.length === 0 || before.endsWith("\n") ? "" : "\n";
    const next = before + prefix + "- " + after;
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (before + prefix + "- ").length;
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
  }, []);

  const insertLink = useCallback(() => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    wrap("[", `](${url})`);
  }, [wrap]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="quick-note-overlay"
            className="fixed inset-0 z-[85] flex items-center justify-center bg-app/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={handleCancel}
          >
            <motion.div
              className="sf-glass-window w-[min(560px,92vw)] overflow-hidden rounded-2xl"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sf-glass-titlebar flex items-center justify-between px-4 py-2">
                <div className="text-[0.7rem] uppercase tracking-[0.14em] text-muted">
                  Quick Note
                </div>
                <div className="flex items-center gap-1">
                  <ToolbarButton label="B" onClick={() => wrap("**")} bold />
                  <ToolbarButton label="I" onClick={() => wrap("*")} italic />
                  <ToolbarButton label="Link" onClick={insertLink} />
                  <ToolbarButton label="List" onClick={insertList} />
                </div>
              </div>
              <textarea
                ref={taRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={onTextareaKey}
                placeholder="Quick note..."
                className="block min-h-[220px] w-full resize-none bg-transparent px-4 py-3 text-sm text-app placeholder:text-muted focus:outline-none"
              />
              <div className="flex items-center justify-between border-t border-app bg-app-elevated/45 px-3 py-2 backdrop-blur-xl">
                <span className="text-[0.65rem] text-muted">
                  ⌘Enter saves · ESC cancels
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-md border border-app bg-surface px-3 py-1 text-xs text-app hover:bg-app-elevated"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="rounded-md bg-tool-accent px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            key="quick-note-toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="sf-glass-menu fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-md px-3 py-2 text-xs text-app"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ToolbarButton({
  label,
  onClick,
  bold,
  italic,
}: {
  label: string;
  onClick: () => void;
  bold?: boolean;
  italic?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-xs text-secondary hover:bg-surface hover:text-app ${
        bold ? "font-bold" : ""
      } ${italic ? "italic" : ""}`}
    >
      {label}
    </button>
  );
}
