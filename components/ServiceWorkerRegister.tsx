"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` on mount.
 *
 * - Runs after first paint so it never blocks LCP.
 * - Silent on failure — service workers are progressive enhancement;
 *   the app must work without them.
 * - Skipped in dev to avoid stale-cache headaches while iterating.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Avoid registering in local dev — Next dev server + SW caching = pain.
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          /* Mobile-perf (Wave 4 Z2): the SW was bumped from v1 → v2
           * (page-cache layer added). Existing installs ship the old
           * worker; ping the SW for an update on each fresh load so
           * users transition without needing to close every tab. The
           * `skipWaiting()` inside the new SW completes the swap on
           * the next navigation. Update checks are cheap (HEAD-ish)
           * and the failure is silent. */
          reg.update().catch(() => {});
        })
        .catch(() => {
          /* swallow — fall back to no SW */
        });
    };

    // Defer past first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
