"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_WALLPAPER_ID,
  WALLPAPER_CHANGE_EVENT,
  WALLPAPER_STORAGE_SUFFIX,
} from "./wallpapers";
import {
  buildUnified,
  findEntry,
  type CustomWallpaper,
} from "./wallpaper-resolver";
import { useWorkspaceKey } from "./useWorkspaces";
import { useTheme } from "@/components/ThemeProvider";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

/* Interactive wallpapers are lazy-loaded so the 11 canvas components
 * don't bloat the initial desktop bundle. The dispatcher (a single
 * lazy-loaded module) reads the active interactiveKey and mounts the
 * matching canvas. The static-CSS fallback layer renders underneath
 * so a slow first paint still shows a tinted background. */
const InteractiveBackground = lazy(() => import("./InteractiveBackground"));

/* Animated on-brand background:
 *   1. The user-selected wallpaper, theme-aware (light + dark variants
 *      cross-fade when the user flips the theme on the same wallpaper).
 *   2. Three drifting gradient glows.
 *   3. A subtle dot grid mask.
 *   4. A cursor-follow glow.
 *
 * The wallpaper id lives in localStorage. We listen for both the
 * cross-tab `storage` event and a same-tab custom
 * `tools-desktop-wallpaper-change` event so the picker can update the
 * background instantly.
 *
 * Custom (admin-uploaded) wallpapers are pulled once at mount from
 * `public.wallpapers` and merged into the unified entry list. The
 * fetch is best-effort — if Supabase isn't configured or the request
 * fails, only the builtin entries are available. */

const CUSTOM_RELOAD_EVENT = "tools-desktop-custom-wallpapers-reload";

export default function DesktopBackground() {
  const WALLPAPER_STORAGE_KEY = useWorkspaceKey(WALLPAPER_STORAGE_SUFFIX);
  const { resolved } = useTheme();
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const sx = useSpring(mx, { stiffness: 70, damping: 20, mass: 1.2 });
  const sy = useSpring(my, { stiffness: 70, damping: 20, mass: 1.2 });

  // Start as null (not DEFAULT_WALLPAPER_ID) so SSR + first paint don't
  // render the wrong wallpaper. The mount effect below reads localStorage
  // and sets the real wallpaperId — by then we know what to paint. This
  // avoids the flash Asad caught 2026-05-27 where his chosen wallpaper
  // (beach) appeared briefly after a default one. With this change the
  // underlying `bg-app` (solid dark) shows for one render cycle, then
  // crossfades into the user's actual wallpaper via the existing
  // framer-motion key-change animation. Much less jarring than two
  // different photos flickering.
  const [wallpaperId, setWallpaperId] = useState<string | null>(null);
  const [customs, setCustoms] = useState<CustomWallpaper[]>([]);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const handle = (e: PointerEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
    };
    window.addEventListener("pointermove", handle);
    return () => window.removeEventListener("pointermove", handle);
  }, [mx, my]);

  // Hydrate selected id from localStorage. Falls back to the
  // DEFAULT_WALLPAPER_ID if no preference is stored — so users on the
  // default still see something on first paint, not a permanent void.
  useEffect(() => {
    const read = () => {
      try {
        const id = localStorage.getItem(WALLPAPER_STORAGE_KEY);
        setWallpaperId(id || DEFAULT_WALLPAPER_ID);
      } catch {
        setWallpaperId(DEFAULT_WALLPAPER_ID);
      }
    };
    read();
    const onChange = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === WALLPAPER_STORAGE_KEY) read();
    };
    window.addEventListener(WALLPAPER_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WALLPAPER_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WALLPAPER_STORAGE_KEY]);

  // Pull custom (admin-uploaded) wallpapers once at mount, and again
  // whenever the picker fires CUSTOM_RELOAD_EVENT (e.g. after admin
  // uploads a new one in another tab).
  useEffect(() => {
    let cancelled = false;
    const fetchCustoms = async () => {
      if (!isSupabaseConfigured()) return;
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("wallpapers")
          .select(
            "id, slug, name, light_url, dark_url, mode_preference, created_at"
          )
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (error || !data) {
          setCustoms([]);
          return;
        }
        setCustoms(data as CustomWallpaper[]);
      } catch {
        if (!cancelled) setCustoms([]);
      }
    };
    void fetchCustoms();
    const onReload = () => void fetchCustoms();
    window.addEventListener(CUSTOM_RELOAD_EVENT, onReload);
    return () => {
      cancelled = true;
      window.removeEventListener(CUSTOM_RELOAD_EVENT, onReload);
    };
  }, []);

  const entries = useMemo(() => buildUnified(customs), [customs]);
  const entry = useMemo(
    () => findEntry(wallpaperId ?? DEFAULT_WALLPAPER_ID, entries),
    [wallpaperId, entries]
  );
  const background = useMemo(
    () => entry.getBackground(resolved),
    [entry, resolved]
  );

  // Use a key on the background layer so React mounts a fresh element
  // on every change — the previous one stays in the DOM during the
  // exit animation, producing a clean cross-fade between variants.
  const bgKey = `${entry.id}:${resolved}`;

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-app"
      >
        {wallpaperId !== null && (
          <motion.div
            key={bgKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="absolute inset-0"
            style={{ background }}
            data-wallpaper-id={entry.id}
            data-wallpaper-theme={resolved}
          />
        )}
        {entry.section === "interactive" && entry.interactiveKey && (
          <Suspense fallback={null}>
            <div
              key={`interactive:${entry.interactiveKey}`}
              className="absolute inset-0"
              data-wallpaper-canvas={entry.interactiveKey}
            >
              <InteractiveBackground interactiveKey={entry.interactiveKey} />
            </div>
          </Suspense>
        )}
        <div className="desktop-glow desktop-glow-1" />
        <div className="desktop-glow desktop-glow-2" />
        <div className="desktop-glow desktop-glow-3" />
        <div className="desktop-grid" />

        {/* Cursor-follow glow */}
        <motion.div
          className="desktop-cursor-glow"
          style={{
            x: sx,
            y: sy,
            translateX: "-50%",
            translateY: "-50%",
          }}
        />
      </div>
      <style jsx>{`
        /* Glow blobs: a giant blur radius (80px+) is the single biggest
         * GPU cost on this page — Safari/Chrome allocate offscreen
         * surfaces sized to the layer + the blur margin and re-composite
         * every animation frame. Cutting the radius from 80px to 32px is
         * visually almost identical on a 60vw blob (the blob itself is
         * already a soft radial gradient that fades to transparent at
         * 70%) but ~3-5x cheaper. We also raise opacity slightly so the
         * smaller blur reads at the same intensity. */
        .desktop-glow {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(32px);
          opacity: 0.55;
          mix-blend-mode: screen;
          will-change: transform;
        }
        .desktop-glow-1 {
          background: radial-gradient(
            circle at center,
            rgba(139, 92, 246, 0.55) 0%,
            rgba(139, 92, 246, 0) 70%
          );
          top: -10vw;
          left: -10vw;
          animation: glow-drift-1 22s ease-in-out infinite;
        }
        .desktop-glow-2 {
          background: radial-gradient(
            circle at center,
            rgba(6, 182, 212, 0.45) 0%,
            rgba(6, 182, 212, 0) 70%
          );
          bottom: -15vw;
          right: -10vw;
          animation: glow-drift-2 26s ease-in-out infinite;
        }
        .desktop-glow-3 {
          background: radial-gradient(
            circle at center,
            rgba(245, 158, 11, 0.35) 0%,
            rgba(245, 158, 11, 0) 70%
          );
          top: 30vh;
          right: 20vw;
          width: 40vw;
          height: 40vw;
          animation: glow-drift-3 30s ease-in-out infinite;
        }
        :global([data-theme="light"]) .desktop-glow {
          opacity: 0.28;
          mix-blend-mode: multiply;
        }
        /* Cursor-follow glow: re-paints on every mouse move at 520px
         * blurred. Replaced the 40px filter blur with a softer larger
         * gradient stop — visually similar but no filter pass. Trimmed
         * size + opacity so it doesn't read as harsh under the smaller
         * blur. */
        .desktop-cursor-glow {
          position: absolute;
          width: 380px;
          height: 380px;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(
            circle at center,
            color-mix(in srgb, var(--accent) 14%, transparent) 0%,
            color-mix(in srgb, var(--accent) 4%, transparent) 55%,
            transparent 78%
          );
          mix-blend-mode: screen;
          opacity: 0.5;
          will-change: transform;
        }
        :global([data-theme="light"]) .desktop-cursor-glow {
          mix-blend-mode: multiply;
          opacity: 0.35;
        }
        .desktop-grid {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(
            circle at center,
            var(--text-faint) 1px,
            transparent 1px
          );
          background-size: 28px 28px;
          opacity: 0.18;
          mask-image: radial-gradient(
            ellipse at center,
            black 30%,
            transparent 75%
          );
        }
        @keyframes glow-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(6vw, 4vw) scale(1.08); }
          66% { transform: translate(-4vw, 8vw) scale(0.95); }
        }
        @keyframes glow-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-8vw, -5vw) scale(1.12); }
          80% { transform: translate(5vw, -10vw) scale(0.92); }
        }
        @keyframes glow-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10vw, 8vw) scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .desktop-glow,
          .desktop-glow-1,
          .desktop-glow-2,
          .desktop-glow-3 {
            animation: none;
          }
          .desktop-cursor-glow { display: none; }
        }
      `}</style>
    </>
  );
}

/** Broadcast that the picker should re-fetch custom wallpapers (e.g.
 *  immediately after admin upload). Exported so other surfaces can
 *  trigger a refresh without reload. */
export const TOOLS_CUSTOM_WALLPAPERS_RELOAD_EVENT = CUSTOM_RELOAD_EVENT;
