"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Fires a POST to /api/pageview on every route change. Not wired into the
 * root layout by default — the orchestrator mounts this once near the top of
 * the tree (so every navigation covers it).
 *
 * Safe to no-op if the endpoint is down or offline.
 */
export default function PageViewBeacon({
  region,
}: {
  region?: string | null;
}) {
  const pathname = usePathname();
  const sent = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Path only — avoids useSearchParams static-bailout
    const path = pathname;
    // Skip API and static paths.
    if (path.startsWith("/api/") || path.startsWith("/_next/")) return;
    if (sent.current === path) return;
    sent.current = path;

    const payload = JSON.stringify({
      path,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      region: region ?? null,
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/pageview", blob);
        return;
      }
    } catch {
      // fallthrough to fetch
    }

    fetch("/api/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // best-effort; ignore network errors
    });
  }, [pathname, region]);

  return null;
}
