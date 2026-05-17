"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Push / notification permission hook.
 *
 * Browsers penalise sites that auto-prompt for notifications on page
 * load (Chrome's "abusive permission" heuristics). Always call
 * `request()` from a user gesture *after* a positive moment — task
 * completed, link shared, profile saved — so the prompt looks earned.
 *
 * `state` mirrors the `NotificationPermission` enum, with two extras:
 *   - "unknown"     — first render, hydration hasn't run yet
 *   - "unsupported" — browser has no Notification API
 */

export type PushPermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

function readPermission(): PushPermissionState {
  if (typeof window === "undefined") return "unknown";
  if (!("Notification" in window)) return "unsupported";
  // `Notification.permission` is a string-typed enum; values:
  // "granted" | "denied" | "default"
  return window.Notification.permission as PushPermissionState;
}

export function usePushPermission() {
  const [state, setState] = useState<PushPermissionState>("unknown");

  useEffect(() => {
    setState(readPermission());
  }, []);

  const request = useCallback(async (): Promise<PushPermissionState> => {
    if (typeof window === "undefined") return "unknown";
    if (!("Notification" in window)) {
      setState("unsupported");
      return "unsupported";
    }
    try {
      const next = (await window.Notification.requestPermission()) as
        | "granted"
        | "denied"
        | "default";
      setState(next);
      return next;
    } catch {
      // Some browsers throw if called outside a user gesture.
      const fallback = readPermission();
      setState(fallback);
      return fallback;
    }
  }, []);

  return { state, request };
}

/**
 * Has the user already made a choice (granted or denied)?
 * Useful so callers don't show their nudge UI twice.
 */
export function hasDecidedPushPermission(state: PushPermissionState): boolean {
  return state === "granted" || state === "denied" || state === "unsupported";
}
