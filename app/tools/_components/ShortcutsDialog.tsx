"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { formatShortcut } from "./useKeyboardShortcuts";

/* ShortcutsDialog — cheat sheet for every global keyboard shortcut on
 * the /tools desktop. Mirrors the AppStore / WidgetGallery modal pattern
 * (overlay + spring-in panel, Esc / outside-click to close). The list
 * itself is curated here rather than derived from the live registration
 * map so we can document shortcuts grouped by intent and include items
 * that are documented-but-not-yet-wired (e.g. ⌘, Settings). */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  spec: string;
  label: string;
  /** Optional override when a shortcut is documented but not yet wired
   *  to a handler — we still render it but tag it "soon". */
  soon?: boolean;
}

interface Group {
  title: string;
  items: Shortcut[];
}

const GROUPS: Group[] = [
  {
    title: "Workspace",
    items: [
      { spec: "cmd+k", label: "Search / Launchpad" },
      { spec: "cmd+?", label: "Keyboard shortcuts" },
      { spec: "cmd+,", label: "Settings", soon: true },
      { spec: "cmd+l", label: "Lock", soon: true },
      { spec: "cmd+n", label: "New window", soon: true },
      { spec: "cmd+shift+n", label: "New tool from store" },
    ],
  },
  {
    title: "Window",
    items: [
      { spec: "cmd+w", label: "Close window" },
      { spec: "cmd+m", label: "Minimize window" },
      { spec: "cmd+shift+m", label: "Minimize all" },
      { spec: "cmd+up", label: "Maximize / Restore", soon: true },
      { spec: "cmd+left", label: "Snap left", soon: true },
      { spec: "cmd+right", label: "Snap right", soon: true },
    ],
  },
  {
    title: "System",
    items: [
      { spec: "cmd+shift+d", label: "Toggle dark / light" },
      { spec: "cmd+shift+w", label: "Cycle wallpaper", soon: true },
      { spec: "cmd+shift+s", label: "Toggle sounds", soon: true },
      { spec: "escape", label: "Close menu / modal" },
    ],
  },
];

export default function ShortcutsDialog({ open, onClose }: Props) {
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
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-label="Keyboard shortcuts"
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
            className="sf-glass-window relative z-10 mx-auto flex h-[min(78vh,680px)] max-w-4xl flex-col overflow-hidden rounded-2xl"
            style={{ marginTop: "8vh" }}
          >
            {/* Header */}
            <div className="sf-glass-titlebar flex items-center gap-3 px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent-soft text-app">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-app">
                  Keyboard shortcuts
                </div>
                <div className="text-[11px] text-muted">
                  Press{" "}
                  <kbd className="rounded border border-app bg-surface px-1 py-0.5 font-mono text-[10px]">
                    ?
                  </kbd>{" "}
                  anywhere to open this dialog. Items marked{" "}
                  <span className="text-faint">soon</span> aren&rsquo;t wired
                  yet.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close keyboard shortcuts"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary transition-colors hover:bg-surface hover:text-app"
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

            {/* Body — three-column grid of categories */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {GROUPS.map((g) => (
                  <ShortcutGroup key={g.title} group={g} />
                ))}
              </div>
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-app bg-app-elevated px-6 py-3 text-[11px] text-muted">
              <span>Shortcuts are skipped while you&rsquo;re typing.</span>
              <span>
                Close with{" "}
                <KeyChip label="Esc" />
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShortcutGroup({ group }: { group: Group }) {
  return (
    <section className="rounded-xl border border-app bg-app p-4">
      <header className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
        {group.title}
      </header>
      <ul className="flex flex-col gap-1.5">
        {group.items.map((item) => (
          <li
            key={item.spec}
            className="flex items-center justify-between gap-3 rounded-md px-1 py-1 hover:bg-surface"
          >
            <span className="flex items-center gap-2 text-[0.78rem] text-secondary">
              {item.label}
              {item.soon && (
                <span className="rounded-full border border-app px-1.5 py-px text-[9px] uppercase tracking-wide text-faint">
                  soon
                </span>
              )}
            </span>
            <KeyCombo spec={item.spec} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Render a shortcut spec as a row of styled key chips. We split on " "
 * because formatShortcut joins Mac glyphs with spaces; on Win/Linux it
 * joins with "+" so split on that too. */
function KeyCombo({ spec }: { spec: string }) {
  const display = formatShortcut(spec);
  const tokens = display.split(/\s+|\+/).filter(Boolean);
  return (
    <span className="flex items-center gap-1">
      {tokens.map((t, i) => (
        <KeyChip key={`${t}-${i}`} label={t} />
      ))}
    </span>
  );
}

function KeyChip({ label }: { label: string }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-app bg-surface px-1.5 py-0.5 font-mono text-[0.7rem] font-medium text-app shadow-sm">
      {label}
    </kbd>
  );
}
