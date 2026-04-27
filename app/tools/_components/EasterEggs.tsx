"use client";

/**
 * EasterEggs — three small keyboard / pointer triggers, each in its own
 * useEffect. Self-contained; mount once on the desktop and forget.
 *
 *  1. Konami code (↑ ↑ ↓ ↓ ← → ← → B A) → 5-second confetti shower
 *     once per session.
 *  2. Typing "spacefield" anywhere on the desktop (no input focused) →
 *     pulse the workspace name pill in the top bar with a glow effect
 *     for 2 seconds.
 *  3. Triple-click the workspace name pill → rotate the wallpaper one
 *     step. Triple-click again to keep cycling.
 */

import { useEffect } from "react";
import { WALLPAPERS, WALLPAPER_CHANGE_EVENT } from "./wallpapers";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const KONAMI_FIRED_FLAG = "ee:konami:fired:session";
const SPACEFIELD_WORD = "spacefield";

/** Pulse helper: temporarily tag the topbar wordmark with a glow class. */
function pulseWordmark() {
  const el = document.querySelector('[aria-label="Space Field"]') as
    | HTMLElement
    | null;
  if (!el) return;
  el.classList.add("ee-wordmark-glow");
  window.setTimeout(() => el.classList.remove("ee-wordmark-glow"), 2000);
}

/** Inject a tiny stylesheet for confetti + wordmark glow. We only do this
 * once per page (idempotent via a sentinel id). */
function ensureStylesInjected() {
  if (document.getElementById("ee-styles")) return;
  const style = document.createElement("style");
  style.id = "ee-styles";
  style.textContent = `
.ee-wordmark-glow {
  animation: ee-pulse 0.6s ease-in-out 3;
  text-shadow: 0 0 8px currentColor, 0 0 16px currentColor;
}
@keyframes ee-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.6); }
}
.ee-confetti-piece {
  position: fixed;
  top: -20px;
  width: 8px;
  height: 12px;
  border-radius: 1px;
  pointer-events: none;
  z-index: 200;
  animation: ee-fall linear forwards;
}
@keyframes ee-fall {
  0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(var(--ee-dx, 0), 110vh, 0) rotate(720deg); opacity: 0.9; }
}
  `;
  document.head.appendChild(style);
}

function showerConfetti(durationMs: number = 5000) {
  ensureStylesInjected();
  const colors = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];
  const count = 80;
  const pieces: HTMLDivElement[] = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "ee-confetti-piece";
    el.style.left = `${Math.random() * 100}vw`;
    el.style.background = colors[i % colors.length];
    el.style.setProperty("--ee-dx", `${(Math.random() - 0.5) * 200}px`);
    el.style.animationDuration = `${3 + Math.random() * 2}s`;
    el.style.animationDelay = `${Math.random() * 1.2}s`;
    document.body.appendChild(el);
    pieces.push(el);
  }
  window.setTimeout(() => {
    for (const p of pieces) p.remove();
  }, durationMs + 1500);
}

export default function EasterEggs() {
  /* 1. Konami code — global keydown match, fires once per session. */
  useEffect(() => {
    let progress = 0;
    const onKey = (e: KeyboardEvent) => {
      const expected = KONAMI[progress];
      const got =
        e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (got === expected.toLowerCase()) {
        progress += 1;
        if (progress === KONAMI.length) {
          progress = 0;
          try {
            if (sessionStorage.getItem(KONAMI_FIRED_FLAG)) return;
            sessionStorage.setItem(KONAMI_FIRED_FLAG, "1");
          } catch {}
          showerConfetti(5000);
        }
      } else {
        // Allow restart from a partial that matches the head.
        progress = got === KONAMI[0].toLowerCase() ? 1 : 0;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* 2. Type "spacefield" on the desktop (no input focused). */
  useEffect(() => {
    let buffer = "";
    let resetTimer: number | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const tgt = document.activeElement as HTMLElement | null;
      const editable =
        tgt instanceof HTMLElement &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.tagName === "SELECT" ||
          tgt.isContentEditable);
      if (editable) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-SPACEFIELD_WORD.length);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        buffer = "";
      }, 1500);
      if (buffer === SPACEFIELD_WORD) {
        buffer = "";
        pulseWordmark();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
    };
  }, []);

  /* 3. Triple-click the wordmark / workspace pill → cycle wallpaper. The
   * wallpaper hook lives at WALLPAPER_STORAGE_SUFFIX inside the
   * workspace-prefixed key. We find the matching key in localStorage
   * and bump it. */
  useEffect(() => {
    let clicks: number[] = [];
    const TRIPLE_WINDOW_MS = 600;
    const findWallpaperKey = (): string | null => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.endsWith("tools-desktop-wallpaper-v1")) return key;
        }
      } catch {}
      return null;
    };
    const cycle = () => {
      const key = findWallpaperKey();
      if (!key) return;
      let currentId: string | null = null;
      try {
        currentId = localStorage.getItem(key);
      } catch {}
      const idx = WALLPAPERS.findIndex((w) => w.id === currentId);
      const nextIdx = (idx + 1 + WALLPAPERS.length) % WALLPAPERS.length;
      const nextId = WALLPAPERS[nextIdx].id;
      try {
        localStorage.setItem(key, nextId);
      } catch {}
      window.dispatchEvent(new CustomEvent(WALLPAPER_CHANGE_EVENT));
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const wordmark = target.closest('[aria-label="Space Field"]');
      if (!wordmark) return;
      const now = Date.now();
      clicks = clicks.filter((t) => now - t < TRIPLE_WINDOW_MS);
      clicks.push(now);
      if (clicks.length >= 3) {
        clicks = [];
        cycle();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
