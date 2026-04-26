"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CursorGlow() {
  const [hasHover, setHasHover] = useState(false);
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);

  const sx = useSpring(x, { stiffness: 100, damping: 30, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 100, damping: 30, mass: 0.5 });

  useEffect(() => {
    setHasHover(window.matchMedia('(hover: hover)').matches);
  }, []);

  useEffect(() => {
    if (!hasHover) return;
    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [x, y, hasHover]);

  if (!hasHover) return null;

  return (
    <motion.div
      className="pointer-events-none fixed z-50 h-[600px] w-[600px] rounded-full"
      style={{
        x: sx,
        y: sy,
        translateX: "-50%",
        translateY: "-50%",
        background:
          "radial-gradient(circle, color-mix(in srgb, var(--text) 3%, transparent) 0%, color-mix(in srgb, var(--text) 1%, transparent) 30%, transparent 70%)",
      }}
    />
  );
}
