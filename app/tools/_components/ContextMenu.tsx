"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface ContextMenuItem {
  /** When `divider` is true, label/onClick are ignored and a separator renders. */
  divider?: boolean;
  label?: string;
  /** Optional 14x14 icon — usually a small SVG. */
  icon?: ReactNode;
  /** Right-aligned hint, e.g. "⌘W". */
  shortcut?: string;
  onClick?: () => void;
  /** Renders the item in a destructive tone. */
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  open: boolean;
  /** Cursor X in viewport coordinates. */
  x: number;
  /** Cursor Y in viewport coordinates. */
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
  /** Optional aria label for the menu container. */
  ariaLabel?: string;
}

/* macOS-style floating context menu. Positions at (x,y), then once measured
 * flips horizontally / vertically if it would overflow the viewport. Closes
 * on outside pointerdown and Escape. Each non-divider item fires onClick
 * then closes. Visual tokens come from the foundation theme so light/dark
 * both look native. */
export default function ContextMenu({
  open,
  x,
  y,
  onClose,
  items,
  ariaLabel = "Context menu",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // Re-measure after layout so we can flip the menu inside the viewport.
  // We render at the cursor first, then on the next frame check the bounding
  // rect against window.innerWidth/Height. If we'd overflow the right edge
  // we anchor from the right (flip-left); same for the bottom edge.
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, x - rect.width);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, y - rect.height);
    }
    setPos({ left, top });
  }, [open, x, y, items.length]);

  // Outside-click and Escape both close. We listen on window pointerdown
  // (not click) so the menu vanishes the instant the user starts a drag
  // outside, matching native macOS behaviour.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer a frame so the right-click that opened us doesn't immediately
    // close us via the same gesture.
    const t = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDown);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          aria-label={ariaLabel}
          initial={{ opacity: 0, scale: 0.96, y: -2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -2 }}
          transition={{ duration: 0.08, ease: "easeOut" }}
          // We block default + propagation on the menu's own contextmenu so a
          // right-click inside the menu doesn't open a nested one.
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            left: pos.left,
            top: pos.top,
            transformOrigin: "top left",
            minWidth: 200,
          }}
          className="pointer-events-auto fixed z-[100] rounded-lg border border-app bg-app-elevated p-1.5 shadow-2xl backdrop-blur-xl"
        >
          {items.map((item, i) => {
            if (item.divider) {
              return (
                <div
                  key={`divider-${i}`}
                  role="separator"
                  className="my-1 h-px bg-app/60"
                />
              );
            }
            return (
              <button
                key={`${item.label}-${i}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  onClose();
                }}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.8rem] transition-colors " +
                  (item.disabled
                    ? "cursor-not-allowed text-muted opacity-60"
                    : item.danger
                      ? "text-red-500 hover:bg-red-500/10 hover:text-red-400"
                      : "text-app hover:bg-surface")
                }
              >
                {item.icon && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center text-current">
                    {item.icon}
                  </span>
                )}
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="ml-3 text-[0.7rem] font-mono text-muted">
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
