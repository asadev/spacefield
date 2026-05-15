"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Minimal in-house cookie consent banner.
 *
 * - Bottom-right card. No third-party JS, no heavy library.
 * - Persists the choice in `localStorage` under
 *   `spacefield-cookie-consent` as either `"all"` or `"essential"`.
 * - Mirrors the choice into the same-named cookie so SSR can decide
 *   whether to render the banner on the next page load (avoids flash).
 * - Parent (`app/layout.tsx`) mounts us with `initialAccepted={true}` if
 *   the cookie was already set — we then render nothing.
 *
 * Analytics gating is the parent's responsibility — read the cookie /
 * localStorage value before mounting `<Analytics />`.
 */

const STORAGE_KEY = "spacefield-cookie-consent";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function writeCookie(value: "all" | "essential") {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie =
    `${STORAGE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}` +
    `; samesite=lax${secure}`;
}

export default function CookieConsent({
  initialAccepted = false,
}: {
  initialAccepted?: boolean;
}) {
  // Start hidden — only show once we've confirmed (on the client) that no
  // choice has been recorded yet. Avoids a banner flash for returning
  // users when SSR didn't know about the cookie.
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (initialAccepted) return;
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v !== "all" && v !== "essential") setVisible(true);
    } catch {
      // localStorage blocked (private mode, etc.) — show the banner so
      // the user can still make a choice; we'll fall back to the cookie.
      setVisible(true);
    }
  }, [initialAccepted]);

  if (!visible) return null;

  const choose = (value: "all" | "essential") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore — cookie still wins
    }
    writeCookie(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[9999] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-app bg-app-elevated p-4 shadow-2xl"
      style={{ backdropFilter: "saturate(140%)" }}
    >
      <p className="text-sm leading-relaxed text-app">
        We use essential cookies to keep you signed in + optional analytics
        cookies to improve the product.
      </p>
      <p className="mt-2 text-xs text-muted">
        <Link href="/legal/cookies" className="underline hover:no-underline">
          Read our cookie policy
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => choose("all")}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={() => choose("essential")}
          className="rounded-md border border-app px-3 py-1.5 text-xs font-medium text-app hover:bg-app-muted"
        >
          Essentials only
        </button>
      </div>
    </div>
  );
}
