"use client";

/* MobileSheet — iOS-style slide-up bottom sheet, extracted from
 * MobileShell so it can be reused inside individual native apps.
 *
 * Behavioural contract:
 *   - Slides up from the bottom (initial y=100% → y=0).
 *   - Drag the sheet body downwards to dismiss; the threshold matches
 *     the existing MobileShell sheets (offset.y > 80 or velocity > 600).
 *   - Backdrop click dismisses.
 *   - Locks body scroll while open.
 *   - Esc dismisses (so it's still keyboard-accessible if a Bluetooth
 *     keyboard is connected).
 *   - Honours iOS safe-area inset at the bottom.
 *   - Foundation tokens only — bg-app-elevated, border-app, etc.
 *
 * The sheet is intentionally NOT full-screen. The backdrop showing
 * 12% of the parent gives the iOS card-stack feeling. If a caller
 * needs full-screen they should use a regular overlay instead.
 */

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, type ReactNode } from "react";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional right-aligned action — e.g. a "Done" button. */
  action?: ReactNode;
  children: ReactNode;
  /** Override the default 88dvh max height (e.g. for a tall list). */
  maxHeight?: string;
  /** Pass a stable id when nesting multiple sheets so they animate cleanly. */
  ariaLabel?: string;
}

/** Bottom-sheet shared between MobileShell and individual native apps. */
export default function MobileSheet({
  open,
  onClose,
  title,
  action,
  children,
  maxHeight = "88dvh",
  ariaLabel,
}: MobileSheetProps) {
  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc dismisses. Keyboard-accessibility for desktop/iPad with
  // external keyboards.
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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel ?? title}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", ease: EASE, duration: 0.32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={(_: unknown, info: PanInfo) => {
              if (info.offset.y > 80 || info.velocity.y > 600) onClose();
            }}
            className="absolute inset-x-0 bottom-0 overflow-y-auto rounded-t-[24px] border-t border-app bg-app-elevated shadow-2xl"
            style={{
              maxHeight,
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div className="sticky top-0 z-10 flex flex-col items-center bg-app-elevated/95 pt-2 backdrop-blur">
              <div
                className="h-1 w-10 rounded-full bg-app/30"
                aria-hidden="true"
              />
              {(title || action) && (
                <div className="flex w-full items-center justify-between gap-3 px-5 py-3">
                  <span className="text-base font-semibold text-app">
                    {title ?? ""}
                  </span>
                  {action}
                </div>
              )}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A flat list container used inside sheets — matches the iOS grouped
 * inset look. Reused by MobileShell. */
export function SheetList({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-app bg-app divide-y divide-[color:var(--border)]">
      {children}
    </div>
  );
}

/** A row inside a SheetList. Mirrors the iOS row pattern. */
export function SheetRow({
  label,
  trailing,
  onClick,
  destructive,
}: {
  label: string;
  trailing?: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm transition-colors active:bg-surface ${
        destructive ? "text-rose-500" : "text-app"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-secondary">
        {trailing}
        {!trailing || typeof trailing === "string" ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-faint"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
