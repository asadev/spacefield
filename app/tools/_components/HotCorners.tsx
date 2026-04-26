"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

/* macOS-style hot corners for the /tools desktop.
 *
 * Renders 4 invisible 16×16 zones (one per viewport corner). Pointer-enter
 * starts a 250 ms timer; pointer-leave cancels. When the timer fires we
 * call the configured action.
 *
 * Visual feedback: a subtle accent dot pulses in 100 ms before fire so the
 * user gets a hint that the corner is "armed" and can pull away if it was
 * accidental.
 *
 * Drag guard: if any element on the page sets `data-dragging` on the
 * document root (window drags, dock reorder, etc.), we skip firing — you
 * shouldn't trigger Launchpad just because you dropped a window in the
 * top-left.
 *
 * Persistence: an enabled/disabled flag lives in
 *   localStorage["tools-desktop-hot-corners-v1"]
 * Default: enabled. Toggle is exposed in TopBar's View menu.
 */

const STORAGE_SUFFIX = "tools-desktop-hot-corners-v1";
const FIRE_DELAY_MS = 250;
const PULSE_LEAD_MS = 100; // pulse appears this long before fire

export type HotCorner = "tl" | "tr" | "bl" | "br";

interface HotCornersProps {
  onLaunchpad: () => void;
  onNotifications: () => void;
  onMissionControl?: () => void; // optional — falls back to onShowDesktop
  onShowDesktop: () => void;
}

interface PersistedState {
  enabled: boolean;
}

const DEFAULT_STATE: PersistedState = { enabled: true };

function loadState(storageKey: string): PersistedState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      enabled:
        typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_STATE.enabled,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(storageKey: string, state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* SSR / quota / private mode — ignore */
  }
}

/* Hook-based read/write so callers can stay inside the workspace provider
 * tree. Use these from any component rendered inside <WorkspaceProvider>. */
export function useHotCornersEnabled(): [boolean, (enabled: boolean) => void] {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [enabled, setEnabledState] = useState<boolean>(true);

  useEffect(() => {
    setEnabledState(loadState(STORAGE_KEY).enabled);
  }, [STORAGE_KEY]);

  const setEnabled = (next: boolean) => {
    setEnabledState(next);
    saveState(STORAGE_KEY, { enabled: next });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tools-desktop-hot-corners-changed"));
    }
  };

  return [enabled, setEnabled];
}

export default function HotCorners({
  onLaunchpad,
  onNotifications,
  onMissionControl,
  onShowDesktop,
}: HotCornersProps) {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [armed, setArmed] = useState<HotCorner | null>(null);
  const timerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  // Re-read enabled flag on storage events (other tabs) AND our custom
  // same-tab event (View menu toggle).
  useEffect(() => {
    setEnabled(loadState(STORAGE_KEY).enabled);
    const sync = () => setEnabled(loadState(STORAGE_KEY).enabled);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tools-desktop-hot-corners-changed", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tools-desktop-hot-corners-changed", sync);
    };
  }, [STORAGE_KEY]);

  // Always clean up timers on unmount / re-render.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (pulseTimerRef.current !== null)
        window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
    setArmed(null);
  };

  const fire = (corner: HotCorner) => {
    // Drag guard — if the user is mid-drag, don't trigger.
    if (
      typeof document !== "undefined" &&
      document.documentElement.hasAttribute("data-dragging")
    ) {
      return;
    }
    switch (corner) {
      case "tl":
        onLaunchpad();
        break;
      case "tr":
        onNotifications();
        break;
      case "bl":
        // Mission Control if it ever ships; else minimize all (which is
        // also what Show Desktop maps to).
        (onMissionControl ?? onShowDesktop)();
        break;
      case "br":
        onShowDesktop();
        break;
    }
  };

  const arm = (corner: HotCorner) => {
    if (!enabled) return;
    cancel();
    // Pulse leads the fire by PULSE_LEAD_MS so the user has a moment to
    // see "this is about to do something" and pull away.
    pulseTimerRef.current = window.setTimeout(() => {
      setArmed(corner);
      pulseTimerRef.current = null;
    }, Math.max(0, FIRE_DELAY_MS - PULSE_LEAD_MS));
    timerRef.current = window.setTimeout(() => {
      fire(corner);
      timerRef.current = null;
      setArmed(null);
    }, FIRE_DELAY_MS);
  };

  if (!enabled) return null;

  return (
    <>
      <CornerZone corner="tl" armed={armed === "tl"} onEnter={arm} onLeave={cancel} />
      <CornerZone corner="tr" armed={armed === "tr"} onEnter={arm} onLeave={cancel} />
      <CornerZone corner="bl" armed={armed === "bl"} onEnter={arm} onLeave={cancel} />
      <CornerZone corner="br" armed={armed === "br"} onEnter={arm} onLeave={cancel} />
    </>
  );
}

/* ───────────── Single corner zone ───────────── */

const CORNER_POSITION: Record<HotCorner, string> = {
  tl: "top-0 left-0",
  tr: "top-0 right-0",
  bl: "bottom-0 left-0",
  br: "bottom-0 right-0",
};

/* The pulse dot sits *just inside* the corner so it's visible without
 * being clipped by the viewport edge. Each corner gets its own offset. */
const PULSE_POSITION: Record<HotCorner, string> = {
  tl: "top-1 left-1",
  tr: "top-1 right-1",
  bl: "bottom-1 left-1",
  br: "bottom-1 right-1",
};

function CornerZone({
  corner,
  armed,
  onEnter,
  onLeave,
}: {
  corner: HotCorner;
  armed: boolean;
  onEnter: (c: HotCorner) => void;
  onLeave: () => void;
}) {
  return (
    <div
      data-hot-corner={corner}
      aria-hidden="true"
      onPointerEnter={() => onEnter(corner)}
      onPointerLeave={onLeave}
      // z-[70] sits above all windows and the back-layer dock/topbar but
      // below maximized windows (z-60? no — above) and modal overlays
      // (z-[80]). Hot corners shouldn't fight a fullscreen tool or modal.
      className={`pointer-events-auto fixed h-4 w-4 z-[70] ${CORNER_POSITION[corner]}`}
    >
      {armed && (
        <span
          className={`pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-app animate-ping opacity-80 ${PULSE_POSITION[corner]}`}
        />
      )}
      {armed && (
        <span
          className={`pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-app opacity-60 ${PULSE_POSITION[corner]}`}
        />
      )}
    </div>
  );
}
