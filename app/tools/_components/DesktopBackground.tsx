"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import {
  DEFAULT_WALLPAPER_ID,
  WALLPAPER_CHANGE_EVENT,
  WALLPAPER_STORAGE_SUFFIX,
  getWallpaperById,
  wallpaperBackground,
} from "./wallpapers";
import { useWorkspaceKey } from "./useWorkspaces";

/* Animated on-brand background:
 *   1. The user-selected wallpaper (gradient / photo / interactive
 *      placeholder) painted as an inline style on the base layer.
 *   2. Three drifting gradient glows (CSS animation, pauses on
 *      prefers-reduced-motion) layered on top.
 *   3. A subtle dot grid mask.
 *   4. A cursor-follow glow that spring-trails the pointer — adds the
 *      "alive wallpaper" feel without breaking readability of content.
 *
 * The wallpaper id lives in localStorage and we subscribe to a custom
 * `tools-desktop-wallpaper-change` event so the picker can update the
 * background in the same tab without a reload. */

export default function DesktopBackground() {
  const WALLPAPER_STORAGE_KEY = useWorkspaceKey(WALLPAPER_STORAGE_SUFFIX);
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const sx = useSpring(mx, { stiffness: 70, damping: 20, mass: 1.2 });
  const sy = useSpring(my, { stiffness: 70, damping: 20, mass: 1.2 });

  // Default to the canonical default; SSR never has localStorage.
  const [wallpaperId, setWallpaperId] = useState<string>(DEFAULT_WALLPAPER_ID);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const handle = (e: PointerEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
    };
    window.addEventListener("pointermove", handle);
    return () => window.removeEventListener("pointermove", handle);
  }, [mx, my]);

  // Hydrate from localStorage + listen for changes. We listen for both
  // the cross-tab `storage` event and our same-tab custom event so the
  // picker can trigger an immediate re-render without a page reload.
  useEffect(() => {
    const read = () => {
      try {
        const id = localStorage.getItem(WALLPAPER_STORAGE_KEY);
        if (id) setWallpaperId(id);
      } catch {}
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

  const wallpaper = getWallpaperById(wallpaperId);
  const wallpaperStyle: React.CSSProperties = {
    background: wallpaperBackground(wallpaper),
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-app"
      >
        {/* Selected wallpaper painted as the base layer. */}
        <div
          className="absolute inset-0"
          style={wallpaperStyle}
          data-wallpaper-id={wallpaper.id}
        />
        <div className="desktop-glow desktop-glow-1" />
        <div className="desktop-glow desktop-glow-2" />
        <div className="desktop-glow desktop-glow-3" />
        <div className="desktop-grid" />

        {/* Cursor-follow glow — springs to the pointer and gently fades */}
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
        .desktop-glow {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.45;
          mix-blend-mode: screen;
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
        .desktop-cursor-glow {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(
            circle at center,
            color-mix(in srgb, var(--accent) 18%, transparent) 0%,
            color-mix(in srgb, var(--accent) 6%, transparent) 40%,
            transparent 70%
          );
          filter: blur(40px);
          mix-blend-mode: screen;
          opacity: 0.6;
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
