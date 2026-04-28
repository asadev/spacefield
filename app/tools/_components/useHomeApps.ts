"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

/* Apps placed as free-positioned shortcuts on the desktop home, sitting
 * alongside widgets. Mirrors the widget-rect pattern but is one-shot:
 * each home app has only an x,y (icon size is fixed). */

const STORAGE_SUFFIX = "tools-desktop-home-apps-v1";
const CHANGE_EVENT = "tools-desktop-home-apps-change";

export interface HomeAppPos {
  x: number;
  y: number;
}

function load(storageKey: string): Record<string, HomeAppPos> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, HomeAppPos> = {};
    for (const [slug, val] of Object.entries(parsed)) {
      if (
        val &&
        typeof val === "object" &&
        typeof (val as HomeAppPos).x === "number" &&
        typeof (val as HomeAppPos).y === "number"
      ) {
        out[slug] = { x: (val as HomeAppPos).x, y: (val as HomeAppPos).y };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(storageKey: string, positions: Record<string, HomeAppPos>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(positions));
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function useHomeApps() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [positions, setPositions] = useState<Record<string, HomeAppPos>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPositions(load(STORAGE_KEY));
    setHydrated(true);
    const onChange = () => setPositions(load(STORAGE_KEY));
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [STORAGE_KEY]);

  const setPosition = useCallback(
    (slug: string, x: number, y: number) => {
      setPositions((prev) => {
        const next = { ...prev, [slug]: { x, y } };
        save(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY]
  );

  const remove = useCallback(
    (slug: string) => {
      setPositions((prev) => {
        if (!(slug in prev)) return prev;
        const next = { ...prev };
        delete next[slug];
        save(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY]
  );

  const has = useCallback((slug: string) => slug in positions, [positions]);

  return {
    positions,
    hydrated,
    apps: Object.keys(positions),
    setPosition,
    remove,
    has,
  };
}
