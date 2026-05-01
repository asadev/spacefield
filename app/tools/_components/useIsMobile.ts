"use client";

import { useEffect, useState } from "react";

/* useIsMobile — true when the device should render the iOS-style
 * MobileShell instead of the desktop OS chrome.
 *
 * Two breakpoints. Mouse/trackpad devices ("(pointer: fine)") flip at
 * 768px — the Tailwind `md` line. Touch-primary devices ("(pointer:
 * coarse)") flip at 1024px so iPad portrait (820×1180) gets mobile
 * chrome instead of cramped desktop chrome; iPad landscape (≥1180) still
 * gets desktop. Touch-screen laptops usually report `pointer: fine` for
 * the primary pointer (trackpad), so they keep the desktop chrome.
 *
 * SSR-safe: returns false until the first client-side effect runs, then
 * tracks resize, orientationchange, and pointer-mode changes. */
const BREAKPOINT_FINE = 768;
const BREAKPOINT_COARSE = 1024;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarseQuery = window.matchMedia?.("(pointer: coarse)");
    const compute = () => {
      const breakpoint = coarseQuery?.matches ? BREAKPOINT_COARSE : BREAKPOINT_FINE;
      setIsMobile(window.innerWidth < breakpoint);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    coarseQuery?.addEventListener?.("change", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
      coarseQuery?.removeEventListener?.("change", compute);
    };
  }, []);

  return isMobile;
}
