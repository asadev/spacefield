"use client";

/* LaunchpadActionMenu — popover surface for the toolbar's "…" button.
 *
 * Items: Refresh, Reset window size, About Spacefield, Reset Launchpad.
 * Anchored to the trigger via `style.top/right` so it tracks the toolbar
 * even while the window is resized. Closes on outside click + Escape.
 */

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onResetWindow: () => void;
  onAbout: () => void;
  onResetLaunchpad: () => void;
}

export default function LaunchpadActionMenu({
  open,
  onClose,
  onRefresh,
  onResetWindow,
  onAbout,
  onResetLaunchpad,
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
      aria-label="Launchpad actions"
      className="absolute right-3 top-[44px] z-[80] w-52 overflow-hidden rounded-lg border border-app bg-app-elevated p-1 shadow-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Item
        label="Refresh"
        onClick={() => {
          onRefresh();
          onClose();
        }}
      />
      <Item
        label="Reset window size"
        onClick={() => {
          onResetWindow();
          onClose();
        }}
      />
      <Divider />
      <Item
        label="About Spacefield"
        onClick={() => {
          onAbout();
          onClose();
        }}
      />
      <Item
        label="Reset Launchpad"
        onClick={() => {
          onResetLaunchpad();
          onClose();
        }}
      />
    </div>
  );
}

function Item({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className="block w-full rounded px-2 py-1.5 text-left text-[13px] text-app transition-colors hover:bg-surface"
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div aria-hidden="true" className="my-1 h-px bg-app/60" />;
}
