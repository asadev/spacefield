"use client";

import { useEffect, useState } from "react";

import { dismissUndo, runUndo, subscribeUndo, type UndoAction } from "@/lib/undo";

/**
 * Single global undo-snackbar renderer.
 *
 * Subscribes to the `lib/undo` bus and renders a Gmail-style card in
 * the bottom-left corner with the most recently pushed undo. The card
 * auto-dismisses when the action's `expiresAt` passes. Clicking UNDO
 * fires the callback and dismisses immediately.
 *
 * Mounted once in the root layout, next to <Toaster />. Distinct from
 * the toast bus so we can position separately (left vs right) and so
 * "undo" semantics — single active card, replace-on-push — don't bleed
 * into ordinary toast queueing.
 */
export default function UndoSnackbar() {
  const [active, setActive] = useState<UndoAction | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    return subscribeUndo((next) => {
      setActive(next);
      setRestoring(false);
      setRemaining(next ? Math.max(0, next.expiresAt - Date.now()) : 0);
    });
  }, []);

  // Tick the progress bar.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const left = active.expiresAt - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const ttl = active.expiresAt - (active.expiresAt - 5000); // assume 5s baseline for the progress UI
  const totalApprox = Math.max(ttl, remaining);
  const pct = totalApprox > 0 ? Math.max(0, Math.min(100, (remaining / totalApprox) * 100)) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-[9997] w-[min(360px,calc(100vw-2rem))]"
    >
      <div className="pointer-events-auto overflow-hidden rounded-md border border-app bg-app-elevated/95 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1 text-sm text-app">{active.label}</span>
          <button
            type="button"
            disabled={restoring}
            onClick={async () => {
              if (restoring) return;
              setRestoring(true);
              try {
                await runUndo(active.id);
              } finally {
                setRestoring(false);
              }
            }}
            className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-tool-accent transition-colors hover:bg-tool-accent-soft disabled:opacity-50"
          >
            {restoring ? "Restoring…" : "Undo"}
          </button>
          <button
            type="button"
            onClick={() => dismissUndo(active.id)}
            aria-label="Dismiss"
            className="ml-1 flex-shrink-0 rounded text-muted transition-colors hover:text-app"
          >
            <span aria-hidden className="text-base leading-none">×</span>
          </button>
        </div>
        {/* Progress bar across the bottom — shrinks as the window closes. */}
        <div
          aria-hidden
          className="h-0.5 bg-tool-accent transition-all duration-100 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
