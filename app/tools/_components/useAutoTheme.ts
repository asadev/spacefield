"use client";

/* useAutoTheme — light/dark auto-schedule based on user-set cutoff times.
 *
 * Storage:
 *   workspace-scoped under `tools-desktop-theme-schedule-v1`
 *   shape `{ enabled: boolean, lightStart: "HH:MM", darkStart: "HH:MM" }`
 *
 * Behaviour:
 *   - When `enabled`, every minute we compare local-time HH:MM against the
 *     two cutoffs and write `localStorage.theme = "light" | "dark"` (the
 *     same key ThemeProvider already owns), which fires its storage
 *     listener and re-applies `data-theme`.
 *   - We use the existing override mechanism — ThemeProvider listens for
 *     storage events on the `theme` key and applies the new mode. No
 *     surgery required there.
 *   - When the user toggles `enabled` off, we don't restore the previous
 *     theme — the mode they were last shown stays. Next manual change or
 *     re-enable takes over normally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-theme-schedule-v1";
const THEME_KEY = "theme"; // ThemeProvider's storage key

export interface AutoThemeSchedule {
  enabled: boolean;
  lightStart: string; // "HH:MM"
  darkStart: string; // "HH:MM"
}

const DEFAULT_SCHEDULE: AutoThemeSchedule = {
  enabled: false,
  lightStart: "07:00",
  darkStart: "19:00",
};

const HHMM_RE = /^([0-1]\d|2[0-3]):[0-5]\d$/;

function isValidHHMM(s: unknown): s is string {
  return typeof s === "string" && HHMM_RE.test(s);
}

function readSchedule(storageKey: string): AutoThemeSchedule {
  if (typeof window === "undefined") return DEFAULT_SCHEDULE;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<AutoThemeSchedule>;
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_SCHEDULE.enabled,
      lightStart: isValidHHMM(parsed.lightStart)
        ? parsed.lightStart
        : DEFAULT_SCHEDULE.lightStart,
      darkStart: isValidHHMM(parsed.darkStart)
        ? parsed.darkStart
        : DEFAULT_SCHEDULE.darkStart,
    };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

function writeSchedule(storageKey: string, s: AutoThemeSchedule) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/* Returns the resolved theme ("light" or "dark") for a given local time +
 * schedule, walking the day boundary.
 *
 * Treats lightStart..darkStart as "light hours" — anything outside that
 * window (including overnight wraps when darkStart < lightStart) is dark.
 */
export function resolveScheduledTheme(
  schedule: AutoThemeSchedule,
  date: Date,
): "light" | "dark" {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const [lh, lm] = schedule.lightStart.split(":").map((n) => parseInt(n, 10));
  const [dh, dm] = schedule.darkStart.split(":").map((n) => parseInt(n, 10));
  const light = lh * 60 + lm;
  const dark = dh * 60 + dm;
  // Sensible normalisation: light interval is [lightStart, darkStart).
  if (light === dark) return "dark";
  if (light < dark) {
    return minutes >= light && minutes < dark ? "light" : "dark";
  }
  // Wrapped: light starts after dark (e.g. light at 22:00, dark at 06:00).
  // Light hours are minutes >= light OR minutes < dark.
  return minutes >= light || minutes < dark ? "light" : "dark";
}

function applyResolved(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const current = document.documentElement.getAttribute("data-theme");
  if (current === resolved) return;
  document.documentElement.setAttribute("data-theme", resolved);
  // Mirror into ThemeProvider's storage key so the rest of the app picks
  // up the change (Theme picker / system-mode hook listen on storage).
  try {
    localStorage.setItem(THEME_KEY, resolved);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: THEME_KEY,
        newValue: resolved,
      }),
    );
  }
}

export interface AutoThemeApi {
  schedule: AutoThemeSchedule;
  setEnabled: (enabled: boolean) => void;
  setLightStart: (time: string) => void;
  setDarkStart: (time: string) => void;
}

export function useAutoTheme(): AutoThemeApi {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [schedule, setSchedule] = useState<AutoThemeSchedule>(DEFAULT_SCHEDULE);
  const intervalRef = useRef<number | null>(null);

  // Hydrate from storage on mount
  useEffect(() => {
    setSchedule(readSchedule(STORAGE_KEY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setSchedule(readSchedule(STORAGE_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [STORAGE_KEY]);

  // Run the schedule when enabled. Apply once immediately, then every
  // 30 seconds re-evaluate. Cheap; no need for sub-minute precision.
  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!schedule.enabled) return;
    const tick = () => applyResolved(resolveScheduledTheme(schedule, new Date()));
    tick();
    intervalRef.current = window.setInterval(tick, 30_000);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [schedule]);

  const update = useCallback(
    (patch: Partial<AutoThemeSchedule>) => {
      setSchedule((prev) => {
        const next: AutoThemeSchedule = {
          enabled:
            typeof patch.enabled === "boolean" ? patch.enabled : prev.enabled,
          lightStart: isValidHHMM(patch.lightStart)
            ? patch.lightStart
            : prev.lightStart,
          darkStart: isValidHHMM(patch.darkStart)
            ? patch.darkStart
            : prev.darkStart,
        };
        writeSchedule(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => update({ enabled }),
    [update],
  );
  const setLightStart = useCallback(
    (time: string) => {
      if (isValidHHMM(time)) update({ lightStart: time });
    },
    [update],
  );
  const setDarkStart = useCallback(
    (time: string) => {
      if (isValidHHMM(time)) update({ darkStart: time });
    },
    [update],
  );

  return { schedule, setEnabled, setLightStart, setDarkStart };
}
