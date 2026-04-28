"use client";

import { useEffect } from "react";

/* Sets `<html data-tab-hidden="1">` whenever the document is hidden (tab
 * backgrounded, window minimized) and clears it when visible again.
 * The selector in globals.css uses that attribute to pause every
 * `animation: ... infinite` rule and disable transitions, which lets
 * the GPU stop compositing animated blur layers and saves significant
 * heat/battery on idle tabs.
 *
 * Mounted once at the root layout. The body of this component is
 * empty — it just attaches a listener. */
export default function TabVisibility() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) {
        document.documentElement.setAttribute("data-tab-hidden", "1");
      } else {
        document.documentElement.removeAttribute("data-tab-hidden");
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return null;
}
