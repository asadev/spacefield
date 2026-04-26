"use client";

import { useEffect, useState } from "react";

/**
 * Returns the RGB triple string for canvas particle/glow drawing that matches
 * the current theme. Use it like:
 *   const tone = useCanvasTone();
 *   ctx.fillStyle = `rgba(${tone},${alpha})`;
 *
 * Dark theme → "255,255,255" (white particles on black)
 * Light theme → "15,23,42"   (slate-900 particles on white)
 */
export function useCanvasTone(): string {
  const [tone, setTone] = useState("255,255,255");

  useEffect(() => {
    const read = () => {
      const theme = document.documentElement.getAttribute("data-theme");
      setTone(theme === "light" ? "15,23,42" : "255,255,255");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return tone;
}
