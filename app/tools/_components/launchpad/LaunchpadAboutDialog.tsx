"use client";

/* LaunchpadAboutDialog — small modal launched from the Action menu.
 *
 * 320 x 220, centered, dismissable by Close button or Escape. Shows the
 * Spacefield wordmark, the Vercel commit hash baked at build time
 * (NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, "dev" locally), and the current
 * year. No marketing copy — this is a system About box, not a splash
 * screen.
 */

import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LaunchpadAboutDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const sha =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)
      : "dev";
  const year = new Date().getFullYear();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About Spacefield"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[220px] w-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-app bg-app-elevated p-6 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="text-2xl font-semibold tracking-tight text-app">
          Spacefield
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted">
          Build {sha}
        </div>
        <div className="text-[11px] text-muted">© {year} Spacefield</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded-md border border-app bg-app px-4 py-1.5 text-[12px] font-medium text-app transition-colors hover:bg-surface"
          autoFocus
        >
          Close
        </button>
      </div>
    </div>
  );
}
