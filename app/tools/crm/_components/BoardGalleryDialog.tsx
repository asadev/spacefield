"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * BoardGalleryDialog — modal showing all available board templates plus
 * a "Blank board" entry. On pick, calls onCreate(template_id | null).
 * The parent handles the actual POST and routing into the new board.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import { BOARD_TEMPLATES } from "../_boards/templates";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (templateId: string | null) => void;
  busy?: boolean;
}

export default function BoardGalleryDialog({
  open,
  onClose,
  onPick,
  busy,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a board template"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-app bg-app-elevated shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-app px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-app">
              Pick a board template
            </h2>
            <p className="mt-0.5 text-xs text-secondary">
              Pre-built columns and views. You can edit everything after
              creating the board.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-1 text-secondary hover:bg-surface hover:text-app"
          >
            ✕
          </button>
        </header>
        <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {BOARD_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(tpl.id)}
              className="group flex items-start gap-3 rounded-lg border border-app bg-app p-4 text-left transition-colors hover:border-tool-accent disabled:opacity-50"
            >
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-base font-semibold"
                style={{ backgroundColor: tpl.color, color: "#fff" }}
              >
                {tpl.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-app">
                  {tpl.name}
                </span>
                <span className="mt-1 block text-xs text-secondary">
                  {tpl.description}
                </span>
                <span className="mt-2 inline-flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  {tpl.columns.length} columns · {tpl.views.length} views
                  {tpl.sampleRecords.length > 0 && (
                    <span className="text-tool-accent">+ samples</span>
                  )}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(null)}
            className="flex items-start gap-3 rounded-lg border border-dashed border-app bg-app p-4 text-left transition-colors hover:border-tool-accent disabled:opacity-50"
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-app text-base font-semibold text-secondary"
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-app">Blank board</span>
              <span className="mt-1 block text-xs text-secondary">
                Start with one column and build it from scratch.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
