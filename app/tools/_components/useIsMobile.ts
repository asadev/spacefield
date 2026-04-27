"use client";

import { useEffect, useState } from "react";

/* useIsMobile — true when the viewport width is below the Tailwind `md`
 * breakpoint (768px). SSR-safe: returns false until the first client-side
 * effect runs, then tracks `resize` events.
 *
 * Used to swap the desktop OS shell for the iOS-style MobileShell in
 * Desktop.tsx. The window manager, install hook, dock-order hook, etc.
 * stay identical — only the chrome differs. */
const BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => setIsMobile(window.innerWidth < BREAKPOINT);
    compute();
    window.addEventListener("resize", compute);
    // Some mobile browsers fire `orientationchange` without `resize` while
    // the viewport actually changes — listen to both for safety.
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return isMobile;
}
