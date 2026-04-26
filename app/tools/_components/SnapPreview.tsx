"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { computeSnapRect, type SnapZone } from "./snapZones";

/* Translucent macOS/Windows-style snap-zone preview. Listens for
 * `tools-desktop-drag-edge` events dispatched by Window.tsx during a title-
 * bar drag, computes the would-be snap rectangle, and fades it in/out via
 * framer-motion. Sits above the desktop background but below the windows
 * (z-40 in Desktop.tsx), so the dragging window stays on top. */
type DragEdgeDetail = { x: number; y: number; active: boolean };

export default function SnapPreview() {
  const [zone, setZone] = useState<SnapZone | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const onEdge = (e: Event) => {
      const detail = (e as CustomEvent<DragEdgeDetail>).detail;
      if (!detail || !detail.active) {
        setZone(null);
        setRect(null);
        return;
      }
      const next = computeSnapRect(detail.x, detail.y);
      if (!next) {
        setZone(null);
        setRect(null);
        return;
      }
      setZone(next.zone);
      setRect(next.rect);
    };
    window.addEventListener("tools-desktop-drag-edge", onEdge);
    return () => window.removeEventListener("tools-desktop-drag-edge", onEdge);
  }, []);

  return (
    <AnimatePresence>
      {zone && rect && (
        <motion.div
          key={zone}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="pointer-events-none absolute rounded-lg border-2 border-tool-accent bg-tool-accent/20"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
          }}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
}
