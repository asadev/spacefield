"use client";

import { useEffect, useState } from "react";

/**
 * Keyboard-shortcut help modal.
 *
 * Pressing `?` (no modifiers, target not a text-entry element) anywhere
 * in the app opens this modal. Esc closes it. Same defensiveness as
 * `CommandPaletteProvider` — see `isTextEntryTarget` below.
 *
 * The modal is intentionally a single self-contained component (no
 * provider, no context) — there's only one global listener and the
 * component manages its own `open` state.
 *
 * Mounted once in `app/layout.tsx`.
 */
export default function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Open with `?` — typically Shift+/ on US keyboards. We don't
      // restrict shiftKey because some layouts produce `?` without
      // shift. We do require: not in a text input, no Cmd/Ctrl/Alt.
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTextEntryTarget(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // Esc closes when open. We don't preventDefault here unless we're
      // actually open, so other Esc-handlers (palette, drawers) still
      // get their chance.
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl rounded-xl border border-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#ffffff)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--chrome-border,#0001)] px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-app">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded text-muted transition-colors hover:text-app focus:outline-none focus:ring-1 focus:ring-app"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {GROUPS.map((group) => (
            <section key={group.label} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted">
                {group.label}
              </h3>
              <ul className="divide-y divide-app/40 overflow-hidden rounded-md border border-app">
                {group.items.map((it) => (
                  <li
                    key={it.label}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-sm text-app">{it.label}</span>
                    <span className="flex flex-shrink-0 gap-1">
                      {it.keys.map((k, i) => (
                        <Kbd key={`${k}-${i}`}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="mt-3 text-[11px] text-muted">
            Press <Kbd>?</Kbd> any time to open this dialog.
          </p>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--chrome-border,#0002)] bg-app-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-app">
      {children}
    </kbd>
  );
}

interface Group {
  label: string;
  items: { label: string; keys: string[] }[];
}

const GROUPS: Group[] = [
  {
    label: "Global",
    items: [
      { label: "Open command palette", keys: ["⌘/Ctrl", "K"] },
      { label: "Quick search (when not typing)", keys: ["/"] },
      { label: "Show this help", keys: ["?"] },
      { label: "Close modal / overlay", keys: ["Esc"] },
    ],
  },
  {
    label: "Lists",
    items: [
      { label: "Move down", keys: ["j"] },
      { label: "Move up", keys: ["k"] },
      { label: "Open selected", keys: ["Enter"] },
      { label: "Focus search", keys: ["/"] },
    ],
  },
  {
    label: "Forms",
    items: [
      { label: "Submit", keys: ["⌘/Ctrl", "Enter"] },
      { label: "Cancel", keys: ["Esc"] },
    ],
  },
];

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
