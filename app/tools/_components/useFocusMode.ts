"use client";

/* useFocusMode — Do-Not-Disturb state for the desktop OS.
 *
 * State machine:
 *   - off                 → notifications + sounds flow normally
 *   - until-time          → DnD is on until `endsAt` epoch ms; the hook
 *                           auto-disables itself when the time passes
 *   - until-toggle        → DnD is on until the user explicitly turns it off
 *
 * Storage:
 *   - workspace-scoped under `tools-desktop-focus-v1`
 *   - shape `{ mode, endsAt }`
 *
 * Cross-hook consumer pattern:
 *   We expose a module-level `isFocusActive()` so non-React callers (e.g.
 *   the Web-Audio sound layer that fires from raw event handlers) can
 *   check DnD state without subscribing. The hook keeps that flag in sync
 *   on every state change. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-focus-v1";

export type FocusMode = "off" | "until-time" | "until-toggle";

export interface FocusState {
  mode: FocusMode;
  endsAt: number | null;
}

const DEFAULT_STATE: FocusState = { mode: "off", endsAt: null };

/* ─── Module-level read API for non-hook consumers (sounds, notifs). ─── */

let _activeFlag = false;

export function isFocusActive(): boolean {
  return _activeFlag;
}

function setFlag(active: boolean) {
  _activeFlag = active;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("spacefield:focus-changed", { detail: { active } }),
    );
  }
}

/* ─── Helpers ─── */

function readState(storageKey: string): FocusState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<FocusState>;
    const mode: FocusMode =
      parsed.mode === "off" ||
      parsed.mode === "until-time" ||
      parsed.mode === "until-toggle"
        ? parsed.mode
        : "off";
    const endsAt =
      typeof parsed.endsAt === "number" && Number.isFinite(parsed.endsAt)
        ? parsed.endsAt
        : null;
    return { mode, endsAt };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(storageKey: string, state: FocusState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* quota / private mode — ignore */
  }
}

function isCurrentlyActive(state: FocusState, now: number): boolean {
  if (state.mode === "off") return false;
  if (state.mode === "until-toggle") return true;
  if (state.mode === "until-time") {
    return state.endsAt !== null && state.endsAt > now;
  }
  return false;
}

/* ─── Public hook ─── */

export interface FocusModeApi {
  active: boolean;
  mode: FocusMode;
  endsAt: number | null;
  /** Turn DnD on until a specific epoch ms (`until-time`) or indefinitely
   * (`until-toggle`). Pass `0` minutes to mean "until I turn off". */
  enable: (durationMinutes: number | "until-toggle") => void;
  disable: () => void;
}

export function useFocusMode(): FocusModeApi {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [state, setState] = useState<FocusState>(DEFAULT_STATE);
  const [active, setActive] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Hydrate on mount (workspace context is now ready)
  useEffect(() => {
    const initial = readState(STORAGE_KEY);
    setState(initial);
    const now = Date.now();
    const isOn = isCurrentlyActive(initial, now);
    setActive(isOn);
    setFlag(isOn);
    // If the persisted timer already expired, normalise storage.
    if (initial.mode === "until-time" && !isOn) {
      writeState(STORAGE_KEY, DEFAULT_STATE);
      setState(DEFAULT_STATE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync — workspace-scoped key.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readState(STORAGE_KEY);
      setState(next);
      const isOn = isCurrentlyActive(next, Date.now());
      setActive(isOn);
      setFlag(isOn);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [STORAGE_KEY]);

  // Schedule auto-disable for "until-time" mode.
  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (state.mode !== "until-time" || state.endsAt === null) return;
    const remaining = state.endsAt - Date.now();
    if (remaining <= 0) {
      // Already past — disable immediately.
      writeState(STORAGE_KEY, DEFAULT_STATE);
      setState(DEFAULT_STATE);
      setActive(false);
      setFlag(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      writeState(STORAGE_KEY, DEFAULT_STATE);
      setState(DEFAULT_STATE);
      setActive(false);
      setFlag(false);
    }, remaining);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, STORAGE_KEY]);

  const enable = useCallback(
    (durationMinutes: number | "until-toggle") => {
      const next: FocusState =
        durationMinutes === "until-toggle"
          ? { mode: "until-toggle", endsAt: null }
          : {
              mode: "until-time",
              endsAt: Date.now() + Math.max(1, durationMinutes) * 60_000,
            };
      writeState(STORAGE_KEY, next);
      setState(next);
      setActive(true);
      setFlag(true);
    },
    [STORAGE_KEY],
  );

  const disable = useCallback(() => {
    writeState(STORAGE_KEY, DEFAULT_STATE);
    setState(DEFAULT_STATE);
    setActive(false);
    setFlag(false);
  }, [STORAGE_KEY]);

  return {
    active,
    mode: state.mode,
    endsAt: state.endsAt,
    enable,
    disable,
  };
}
