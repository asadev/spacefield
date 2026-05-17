"use client";

import { useEffect, useState } from "react";
import {
  hasDecidedPushPermission,
  usePushPermission,
  type PushPermissionState,
} from "@/lib/push-permission";

/**
 * Small dismissable card that requests notification permission.
 *
 * Mount this AFTER a positive moment (task done, link shared, profile
 * saved). Never mount on bare page-load — that's what gets Spacefield
 * silenced by Chrome's abusive-permission filter.
 *
 * The card hides itself once the user has decided (granted/denied),
 * once they dismiss it, or if the browser doesn't support notifications.
 *
 * Usage:
 *   <PushPermissionPrompt
 *     trigger="task-completed"
 *     message="Want a heads-up when your tasks get assigned?"
 *     onDecide={(state) => log("push.decided", { state })}
 *   />
 */

const DISMISS_KEY = "spacefield-push-prompt-dismissed-at";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export type PushPermissionPromptProps = {
  /** Caller-supplied label, included in any onDecide callbacks. */
  trigger: string;
  message?: string;
  ctaLabel?: string;
  dismissLabel?: string;
  onDecide?: (state: PushPermissionState, trigger: string) => void;
};

export default function PushPermissionPrompt({
  trigger,
  message = "Want a heads-up when something needs your attention?",
  ctaLabel = "Enable notifications",
  dismissLabel = "Not now",
  onDecide,
}: PushPermissionPromptProps) {
  const { state, request } = usePushPermission();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state === "unknown") return;
    if (hasDecidedPushPermission(state)) {
      setVisible(false);
      return;
    }
    if (recentlyDismissed()) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [state]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
    onDecide?.("default", trigger);
  };

  const enable = async () => {
    const next = await request();
    setVisible(false);
    onDecide?.(next, trigger);
  };

  return (
    <div
      role="dialog"
      aria-label="Enable notifications"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[9997] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-app bg-app-elevated p-4 shadow-2xl"
    >
      <p className="text-sm font-semibold text-app">Stay in the loop</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={enable}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-app px-3 py-1.5 text-xs font-medium text-app hover:bg-app-muted"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
