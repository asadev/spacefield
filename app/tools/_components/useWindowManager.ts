"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultWindowSizeFor, toolBySlug } from "../_data/tools-list";
import { useWorkspaceKey } from "./useWorkspaces";

export interface WindowState {
  id: string;
  slug: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prev?: { x: number; y: number; w: number; h: number };
  /** One-shot intent passed to the native app via NativeAppProps. */
  initialParams?: Record<string, unknown>;
  /** Bumped each time openApp() is called for this slug — useEffect dep
   *  inside the app, so it can react to a re-open with new context. */
  initialParamsKey?: number;
}

// v2 — bumped 2026-04-26 so users get the new per-tool sized defaults on
// next open instead of inheriting oversized v1 state.
// Now namespaced per workspace via useWorkspaceKey().
const STORAGE_SUFFIX = "tools-desktop-windows-v2";
const OFFSET_STEP = 36;
const TOPBAR = 32;
const DOCK = 72;
const EDGE = 16;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

function safeParse(raw: string | null): WindowState[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v as WindowState[];
  } catch {}
  return null;
}

export function useWindowManager() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const topZ = useRef(10);

  // Hydrate from localStorage once
  useEffect(() => {
    const loaded = safeParse(localStorage.getItem(STORAGE_KEY));
    if (loaded && loaded.length > 0) {
      setWindows(loaded);
      topZ.current = Math.max(...loaded.map((w) => w.z), 10);
    }
    setHydrated(true);
    // STORAGE_KEY changes when workspace switches — but Desktop is keyed
    // on activeId so this hook is fully remounted, so we don't need to
    // refetch on key change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(windows));
    } catch {}
  }, [windows, hydrated, STORAGE_KEY]);

  const open = useCallback(
    (slug: string, title: string, params?: Record<string, unknown>) => {
    setWindows((prev) => {
      // If already open → focus + unminimize + bump initialParamsKey so the
      // native app re-reads incoming context.
      const existing = prev.find((w) => w.slug === slug);
      if (existing) {
        topZ.current += 1;
        return prev.map((w) =>
          w.slug === slug
            ? {
                ...w,
                minimized: false,
                z: topZ.current,
                initialParams: params ?? w.initialParams,
                initialParamsKey: (w.initialParamsKey ?? 0) + 1,
              }
            : w
        );
      }
      // New window — open at the tool's preferred size (per-tool override
      // beats per-category default beats safe fallback). Cap to viewport so
      // we never spawn off-screen. Subsequent windows cascade a touch so
      // each title bar stays grabbable.
      const count = prev.length;
      topZ.current += 1;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
      const vh = typeof window !== "undefined" ? window.innerHeight : 900;
      const usableW = vw - EDGE * 2;
      const usableH = vh - TOPBAR - DOCK - EDGE * 2;
      const tool = toolBySlug(slug);
      const wantSize = tool?.defaultSize ?? defaultWindowSizeFor(tool?.category ?? "calculators");
      const w = Math.min(wantSize.w, usableW);
      const h = Math.min(wantSize.h, usableH);
      const baseX = Math.max(EDGE, Math.round((vw - w) / 2));
      const baseY = Math.max(TOPBAR + EDGE, Math.round((vh - DOCK - h) / 2));
      const next: WindowState = {
        id: `${slug}-${Date.now()}`,
        slug,
        title,
        x: baseX + count * OFFSET_STEP,
        y: baseY + count * OFFSET_STEP,
        w,
        h,
        z: topZ.current,
        minimized: false,
        maximized: false,
        initialParams: params,
        initialParamsKey: params ? 1 : undefined,
      };
      return [...prev, next];
    });
    },
    []
  );

  const close = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const minimize = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, minimized: true } : w))
    );
  }, []);

  const focus = useCallback((id: string) => {
    topZ.current += 1;
    const z = topZ.current;
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, z, minimized: false } : w
      )
    );
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized && w.prev) {
          return { ...w, ...w.prev, maximized: false, prev: undefined };
        }
        // True fullscreen — covers the entire viewport. The topbar and
        // dock are at the back layer (z-[1]) so any window already covers
        // them; the maximized z-60 just keeps the maximized window above
        // any other regular windows. Modal overlays (z-[80]) still cover.
        return {
          ...w,
          prev: { x: w.x, y: w.y, w: w.w, h: w.h },
          x: 0,
          y: 0,
          w: typeof window !== "undefined" ? window.innerWidth : 1440,
          h: typeof window !== "undefined" ? window.innerHeight : 900,
          maximized: true,
        };
      })
    );
  }, []);

  const move = useCallback((id: string, x: number, y: number) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id && !w.maximized ? { ...w, x, y } : w
      )
    );
  }, []);

  const resize = useCallback(
    (id: string, w: number, h: number) => {
      setWindows((prev) =>
        prev.map((win) =>
          win.id === id && !win.maximized
            ? {
                ...win,
                w: clamp(w, 320, window.innerWidth - EDGE),
                h: clamp(h, 240, window.innerHeight - TOPBAR - EDGE),
              }
            : win
        )
      );
    },
    []
  );

  /* Edge-snap commit. Sets x/y/w/h atomically and remembers the previous
   * size so the user can drag the title bar away to restore. If the window
   * was already snapped (has a `prev`), we keep the original `prev` so a
   * second snap doesn't lose the original free-floating size. */
  const snap = useCallback(
    (id: string, x: number, y: number, w: number, h: number) => {
      setWindows((prevWins) =>
        prevWins.map((win) => {
          if (win.id !== id) return win;
          const keepPrev = win.prev ?? { x: win.x, y: win.y, w: win.w, h: win.h };
          return { ...win, x, y, w, h, maximized: false, prev: keepPrev };
        })
      );
    },
    []
  );

  /* Restore from a snap. Uses the saved `prev` size at the new x/y the
   * caller computed (typically anchored under the cursor). Clears `prev` so
   * the window is free-floating again. */
  const unsnap = useCallback((id: string, x: number, y: number) => {
    setWindows((prevWins) =>
      prevWins.map((win) => {
        if (win.id !== id) return win;
        const target = win.prev ?? { w: win.w, h: win.h };
        return {
          ...win,
          x,
          y,
          w: target.w,
          h: target.h,
          maximized: false,
          prev: undefined,
        };
      })
    );
  }, []);

  const closeAll = useCallback(() => {
    setWindows([]);
  }, []);

  const minimizeAll = useCallback(() => {
    setWindows((prev) => prev.map((w) => ({ ...w, minimized: true })));
  }, []);

  return {
    windows,
    hydrated,
    open,
    close,
    closeAll,
    minimize,
    minimizeAll,
    focus,
    toggleMaximize,
    move,
    resize,
    snap,
    unsnap,
  };
}
