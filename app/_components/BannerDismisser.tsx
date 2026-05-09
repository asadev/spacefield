"use client";

import { useEffect } from "react";

const STORAGE_KEY = "sf:banners:dismissed";

/* Tiny client child for SiteBanner. Reads the dismissed-id list from
 * localStorage on mount, hides matching banners, and wires the per-banner
 * × buttons to append-and-hide. We keep all banners server-rendered so
 * the markup is cacheable and ships zero React state for the message
 * itself — the only client work is toggling display on existing nodes.
 *
 * The `ids` prop is the set of banner ids that ARE dismissible according
 * to the server. We use it to (a) prune the localStorage list when an
 * admin re-enables a banner with the same id, and (b) bound the
 * stored-id set so it doesn't grow forever. */
export function BannerDismisser({ ids }: { ids: string[] }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = readDismissed();
    // Drop any stored ids that are no longer in the current dismissible
    // set — keeps the cookie-jar from accumulating dead entries.
    const known = new Set(ids);
    const kept = raw.filter((id) => known.has(id));
    if (kept.length !== raw.length) {
      writeDismissed(kept);
    }

    const dismissedSet = new Set(kept);
    applyHidden(dismissedSet);

    function onClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest<HTMLElement>("[data-banner-dismiss]");
      if (!btn) return;
      const id = btn.getAttribute("data-banner-id");
      if (!id) return;
      ev.preventDefault();
      dismissedSet.add(id);
      writeDismissed(Array.from(dismissedSet));
      const node = document.querySelector<HTMLElement>(
        `[data-site-banner][data-banner-id="${cssEscape(id)}"]`,
      );
      if (node) node.style.display = "none";
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [ids]);

  return null;
}

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage may be unavailable (private mode, quota) — nothing
     * we can do; the banner stays hidden for this session via DOM only. */
  }
}

function applyHidden(ids: Set<string>): void {
  for (const id of ids) {
    const node = document.querySelector<HTMLElement>(
      `[data-site-banner][data-banner-id="${cssEscape(id)}"]`,
    );
    if (node) node.style.display = "none";
  }
}

/* Minimal CSS.escape polyfill — we control the id format (uuid) so the
 * native function would suffice everywhere, but check anyway in case
 * the host environment is older. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
