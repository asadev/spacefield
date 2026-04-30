"use client";

/**
 * Clipboard Manager (⌘⇧V).
 *
 * Captures the last 50 clipboard entries via a `copy` event listener and
 * a one-shot `navigator.clipboard.read()` when the popover opens. Stores
 * locally in localStorage, scoped to the active workspace. Pinned entries
 * stay forever; unpinned entries auto-expire after 24h on each open.
 *
 * UI: a compact popover near the cursor (or centered) with a list of
 * recent entries. Each row has kind icon, preview, captured-at relative
 * time, pin toggle, delete. Footer has clear-all + a clear-on-DnD-end
 * privacy toggle (stored separately, no wiring beyond the toggle).
 *
 * Privacy: nothing leaves the device. Local storage only.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVE_WORKSPACE_KEY = "workspaces:active:v1";
const MAX_ENTRIES = 50;
const UNPINNED_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type ClipKind = "text" | "image" | "html";

interface ClipEntry {
  id: string;
  kind: ClipKind;
  /** The pasteable value: text body, base64 dataURL for images, html string. */
  value: string;
  /** Short preview for text/html; tiny base64 thumbnail for images. */
  preview: string;
  capturedAt: number; // epoch ms
  pinned: boolean;
}

function storageKeyFor(workspaceId: string | null): string {
  return `ws:${workspaceId ?? "default"}:clipboard:v1`;
}
function privacyKeyFor(workspaceId: string | null): string {
  return `ws:${workspaceId ?? "default"}:clipboard:privacy:v1`;
}

function loadEntries(key: string): ClipEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClipEntry[];
    if (!Array.isArray(parsed)) return [];
    // Filter out unpinned > 24h old.
    const cutoff = Date.now() - UNPINNED_TTL_MS;
    return parsed.filter((e) => e.pinned || e.capturedAt >= cutoff);
  } catch {
    return [];
  }
}

function saveEntries(key: string, entries: ClipEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {}
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

async function thumbnailFromDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 64;
      const ratio = Math.min(max / img.width, max / img.height, 1);
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function ClipboardHistory() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [entries, setEntries] = useState<ClipEntry[]>([]);
  const [clearOnFocus, setClearOnFocus] = useState(false);
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const workspaceIdRef = useRef<string | null>(null);

  /* Track cursor so the popover can spawn near it. */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  /* Resolve workspace id once on mount. We don't subscribe — the desktop
   * remounts on workspace switch (key={activeId}). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    workspaceIdRef.current = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    setEntries(loadEntries(storageKeyFor(workspaceIdRef.current)));
    try {
      setClearOnFocus(
        localStorage.getItem(privacyKeyFor(workspaceIdRef.current)) === "1",
      );
    } catch {}
  }, []);

  /* Capture text via the `copy` event. Non-text we attempt on popover open
   * via navigator.clipboard.read(). */
  useEffect(() => {
    const onCopy = () => {
      const sel = document.getSelection()?.toString();
      if (!sel) return;
      addEntry({ kind: "text", value: sel, preview: sel.slice(0, 60) });
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Hotkey ⌘⇧V opens the popover near the cursor. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setPos({ ...cursorRef.current });
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* On open: refresh entries from storage and try to read non-text from
   * the system clipboard once. */
  useEffect(() => {
    if (!open) return;
    setEntries(loadEntries(storageKeyFor(workspaceIdRef.current)));
    void readSystemClipboardOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addEntry = useCallback(
    (input: { kind: ClipKind; value: string; preview: string }) => {
      const wsKey = storageKeyFor(workspaceIdRef.current);
      const current = loadEntries(wsKey);
      // Dedupe — if the most-recent entry has the same value, skip.
      if (current[0] && current[0].value === input.value) return;
      const next: ClipEntry[] = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: input.kind,
          value: input.value,
          preview: input.preview,
          capturedAt: Date.now(),
          pinned: false,
        },
        ...current,
      ].slice(0, MAX_ENTRIES);
      saveEntries(wsKey, next);
      setEntries(next);
    },
    [],
  );

  const readSystemClipboardOnce = useCallback(async () => {
    if (!navigator.clipboard || !navigator.clipboard.read) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const dataUrl = await new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result ?? ""));
              r.readAsDataURL(blob);
            });
            const thumb = await thumbnailFromDataUrl(dataUrl);
            addEntry({ kind: "image", value: dataUrl, preview: thumb });
            return;
          }
          if (type === "text/html") {
            const blob = await item.getType(type);
            const html = await blob.text();
            addEntry({
              kind: "html",
              value: html,
              preview: html.replace(/<[^>]+>/g, "").slice(0, 60),
            });
            return;
          }
        }
      }
    } catch {
      /* permissions denied or no items — silent */
    }
  }, [addEntry]);

  const paste = useCallback(async (entry: ClipEntry) => {
    try {
      if (entry.kind === "image") {
        // Convert dataURL back to a blob and write a ClipboardItem.
        const res = await fetch(entry.value);
        const blob = await res.blob();
        if (
          typeof ClipboardItem !== "undefined" &&
          navigator.clipboard?.write
        ) {
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
        }
      } else {
        await navigator.clipboard.writeText(entry.value);
      }
    } catch {}
    setOpen(false);
  }, []);

  const togglePin = useCallback((id: string) => {
    const wsKey = storageKeyFor(workspaceIdRef.current);
    const next = entries.map((e) =>
      e.id === id ? { ...e, pinned: !e.pinned } : e,
    );
    saveEntries(wsKey, next);
    setEntries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const removeEntry = useCallback(
    (id: string) => {
      const wsKey = storageKeyFor(workspaceIdRef.current);
      const next = entries.filter((e) => e.id !== id);
      saveEntries(wsKey, next);
      setEntries(next);
    },
    [entries],
  );

  const clearAll = useCallback(() => {
    const wsKey = storageKeyFor(workspaceIdRef.current);
    // Keep pinned, drop the rest.
    const next = entries.filter((e) => e.pinned);
    saveEntries(wsKey, next);
    setEntries(next);
  }, [entries]);

  const togglePrivacy = useCallback(
    (next: boolean) => {
      setClearOnFocus(next);
      try {
        localStorage.setItem(
          privacyKeyFor(workspaceIdRef.current),
          next ? "1" : "0",
        );
      } catch {}
    },
    [],
  );

  /* Keep popover within viewport. */
  const popoverStyle: React.CSSProperties = pos
    ? {
        left: Math.min(pos.x, window.innerWidth - 380),
        top: Math.min(pos.y, window.innerHeight - 460),
      }
    : { left: "50%", top: "20%", transform: "translateX(-50%)" };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="clip-overlay"
          className="fixed inset-0 z-[85]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="sf-glass-menu absolute w-[360px] overflow-hidden rounded-xl"
            style={popoverStyle}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sf-glass-titlebar flex items-center justify-between px-3 py-2">
              <div className="text-[0.7rem] uppercase tracking-[0.14em] text-muted">
                Clipboard
              </div>
              <kbd className="rounded border border-app bg-surface px-1.5 py-0.5 text-[0.6rem] text-muted">
                ⌘⇧V
              </kbd>
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              {entries.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-secondary">
                  Nothing copied yet
                </div>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 border-b border-app/50 px-3 py-2 hover:bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => paste(entry)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title="Click to copy to clipboard"
                  >
                    {entry.kind === "image" ? (
                      // The thumbnail is a tiny safe data URL we generated.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.preview}
                        alt=""
                        className="h-8 w-8 rounded border border-app object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded bg-surface text-tool-accent">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          {entry.kind === "html" ? (
                            <path d="M6 9l-3 3 3 3M18 9l3 3-3 3M14 4l-4 16" />
                          ) : (
                            <path d="M4 6h16M4 12h16M4 18h10" />
                          )}
                        </svg>
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-app">
                        {entry.preview || "(empty)"}
                      </span>
                      <span className="block text-[0.65rem] text-muted">
                        {relativeTime(entry.capturedAt)} · {entry.kind}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(entry.id)}
                    className={`opacity-0 transition-opacity group-hover:opacity-100 ${
                      entry.pinned
                        ? "text-tool-accent opacity-100"
                        : "text-muted hover:text-app"
                    }`}
                    title={entry.pinned ? "Unpin" : "Pin"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={entry.pinned ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 2l3 7h7l-5.5 4 2 8L12 17l-6.5 4 2-8L2 9h7z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="text-muted opacity-0 transition-opacity hover:text-app group-hover:opacity-100"
                    title="Delete"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-app px-3 py-2">
              <label className="flex items-center gap-2 text-[0.7rem] text-secondary">
                <input
                  type="checkbox"
                  checked={clearOnFocus}
                  onChange={(e) => togglePrivacy(e.target.checked)}
                  className="h-3 w-3 accent-current"
                />
                Privacy mode
              </label>
              <button
                type="button"
                onClick={clearAll}
                className="text-[0.7rem] text-muted hover:text-app"
              >
                Clear all
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
