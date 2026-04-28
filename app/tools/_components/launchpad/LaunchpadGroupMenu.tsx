"use client";

/* LaunchpadGroupMenu — small popover anchored to the toolbar's Group
 * button. Mirrors Finder's "Group By" menu: None / Category / Recent /
 * Tag. The selected mode persists per-workspace via useLaunchpadView.
 */

import { useEffect, useRef } from "react";
import type { LaunchpadGroupMode } from "./useLaunchpadView";

interface Props {
  open: boolean;
  group: LaunchpadGroupMode;
  onPick: (g: LaunchpadGroupMode) => void;
  onClose: () => void;
}

const OPTIONS: Array<{ value: LaunchpadGroupMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "category", label: "Category" },
  { value: "recent", label: "Recent" },
  { value: "tag", label: "Tag" },
];

export default function LaunchpadGroupMenu({
  open,
  group,
  onPick,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const node = ref.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Group items"
      className="absolute right-[120px] top-[44px] z-[80] w-44 overflow-hidden rounded-lg border border-app bg-app-elevated p-1 shadow-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        Group by
      </div>
      {OPTIONS.map((opt) => {
        const sel = opt.value === group;
        return (
          <button
            key={opt.value}
            type="button"
            role="menuitemradio"
            aria-checked={sel}
            onClick={() => {
              onPick(opt.value);
              onClose();
            }}
            className={
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors " +
              (sel
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-app hover:bg-surface")
            }
          >
            <span className="flex h-3 w-3 items-center justify-center">
              {sel && (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
