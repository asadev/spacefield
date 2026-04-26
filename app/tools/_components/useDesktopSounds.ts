"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

/* Web-Audio synthesized UI sound system for the /tools desktop.
 *
 * Pattern borrowed from imatch — singleton AudioContext, lazily created on
 * first user interaction (browser autoplay policy blocks contexts created
 * outside of user gesture). All synthesis is in-process; no audio assets to
 * ship.
 *
 * Two voices:
 *   - tap   : short sine click (~30ms decay) for routine UI actions
 *   - chime : pleasant 2-note bell (~200ms decay) for notifications
 *
 * Persistence: `muted` (boolean) + `volume` (0-1) live in localStorage under
 * `ws:<workspaceId>:tools-desktop-sound-v1` (per-workspace). When muted,
 * all calls no-op (we still construct the context lazily so unmute works
 * without a refresh).
 */

const STORAGE_SUFFIX = "tools-desktop-sound-v1";

interface PersistedState {
  muted: boolean;
  volume: number; // 0..1
}

const DEFAULT_STATE: PersistedState = { muted: false, volume: 0.35 };

function loadState(storageKey: string): PersistedState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_STATE.muted,
      volume:
        typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULT_STATE.volume,
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
    /* quota / SSR / private mode — ignore */
  }
}

/* Module-level singleton — survives React StrictMode double-mount and
 * shared across every component that calls the hook. */
let sharedCtx: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

interface PlayTone {
  freq: number;
  duration: number; // seconds
  delay?: number; // seconds offset from "now"
  type?: OscillatorType;
  peak?: number; // multiplied by master volume
}

function playTones(ctx: AudioContext, master: number, tones: PlayTone[]) {
  const now = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, now);
    const start = now + (tone.delay ?? 0);
    const peak = (tone.peak ?? 1) * master;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * 0.001),
      start + tone.duration,
    );
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }
}

export interface DesktopSoundsApi {
  tap: () => void;
  chime: () => void;
  muted: boolean;
  toggleMute: () => void;
  volume: number;
  setVolume: (v: number) => void;
}

export function useDesktopSounds(): DesktopSoundsApi {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [{ muted, volume }, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Keep latest state in a ref so the play callbacks don't need to be
  // recreated on every render — important for stable hover/click handlers.
  const stateRef = useRef({ muted, volume });
  useEffect(() => {
    stateRef.current = { muted, volume };
  }, [muted, volume]);

  // Hydrate after mount (workspace context is ready)
  useEffect(() => {
    setState(loadState(STORAGE_KEY));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync across tabs / windows
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(loadState(STORAGE_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [STORAGE_KEY]);

  // Suppress unused warning in dev — `hydrated` reserved for future SSR guards.
  void hydrated;

  const ensureRunning = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      // Returns a promise; we don't await — Chrome resumes synchronously
      // when triggered from a user-gesture stack frame.
      void ctx.resume().catch(() => {});
    }
    return ctx;
  }, []);

  const tap = useCallback(() => {
    if (stateRef.current.muted) return;
    const ctx = ensureRunning();
    if (!ctx) return;
    playTones(ctx, stateRef.current.volume, [
      { freq: 800, duration: 0.03, type: "sine", peak: 0.6 },
    ]);
  }, [ensureRunning]);

  const chime = useCallback(() => {
    if (stateRef.current.muted) return;
    const ctx = ensureRunning();
    if (!ctx) return;
    playTones(ctx, stateRef.current.volume, [
      { freq: 880, duration: 0.2, type: "sine", peak: 0.5 },
      { freq: 1320, duration: 0.2, delay: 0.06, type: "sine", peak: 0.4 },
    ]);
  }, [ensureRunning]);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, muted: !prev.muted };
      saveState(STORAGE_KEY, next);
      // Confirm with a chime when unmuting (after the new state is committed)
      if (!next.muted) {
        const ctx = getCtx();
        if (ctx) {
          if (ctx.state === "suspended") void ctx.resume().catch(() => {});
          playTones(ctx, next.volume, [
            { freq: 880, duration: 0.18, type: "sine", peak: 0.5 },
            { freq: 1320, duration: 0.18, delay: 0.06, type: "sine", peak: 0.4 },
          ]);
        }
      }
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setState((prev) => {
      const next = { ...prev, volume: clamped };
      saveState(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { tap, chime, muted, toggleMute, volume, setVolume };
}
