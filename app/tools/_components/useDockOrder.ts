"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-dock-order-v1";

/* Default pinned slugs — the original PINNED_SLUGS const that used to live in
 * Desktop.tsx. Kept here so resetToDefault always has a stable target. */
export const DEFAULT_PINNED_SLUGS: string[] = [
  "property-valuation",
  "deal-scoring",
  "market-pulse",
  "yield-heatmap",
  "property-poster-creator",
  "sales-offer-generator",
];

function load(storageKey: string): string[] {
  if (typeof window === "undefined") return DEFAULT_PINNED_SLUGS;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        const slugs = parsed as string[];
        // Files Manager retirement (Round D): strip "files-manager"
        // from any user's pinned dock list. Pre-retirement default
        // pin sets never included it, but template installs and old
        // saved layouts could.
        const stripped = slugs.filter((s) => s !== "files-manager");
        if (stripped.length !== slugs.length) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(stripped));
          } catch {}
        }
        return stripped;
      }
    }
  } catch {}
  return DEFAULT_PINNED_SLUGS;
}

function save(storageKey: string, slugs: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(slugs));
  } catch {}
}

export function useDockOrder() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  // SSR-safe init: default first, then hydrate from localStorage on mount.
  const [pinnedSlugs, setPinnedSlugsState] = useState<string[]>(
    DEFAULT_PINNED_SLUGS
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPinnedSlugsState(load(STORAGE_KEY));
    setHydrated(true);
    // STORAGE_KEY changes when workspace switches, but Desktop is keyed
    // on activeId so this hook fully remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPinnedSlugs = useCallback((slugs: string[]) => {
    setPinnedSlugsState(slugs);
    save(STORAGE_KEY, slugs);
  }, [STORAGE_KEY]);

  const togglePin = useCallback((slug: string) => {
    setPinnedSlugsState((prev) => {
      const next = prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug];
      save(STORAGE_KEY, next);
      return next;
    });
  }, [STORAGE_KEY]);

  const movePin = useCallback((slug: string, direction: "left" | "right") => {
    setPinnedSlugsState((prev) => {
      const idx = prev.indexOf(slug);
      if (idx === -1) return prev;
      const swapWith = direction === "left" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      save(STORAGE_KEY, next);
      return next;
    });
  }, [STORAGE_KEY]);

  const resetToDefault = useCallback(() => {
    setPinnedSlugsState(DEFAULT_PINNED_SLUGS);
    save(STORAGE_KEY, DEFAULT_PINNED_SLUGS);
  }, [STORAGE_KEY]);

  return {
    pinnedSlugs,
    setPinnedSlugs,
    togglePin,
    movePin,
    resetToDefault,
    hydrated,
  };
}
