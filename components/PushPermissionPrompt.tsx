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
 * Two ways to drive it:
 *
 * 1. **Auto mode (default)** — mount once globally and fire via the
 *    `firePushPermissionPrompt(trigger)` helper from anywhere in the
 *    tree after a positive moment.
 *
 *        // app/tools/_components/Desktop.tsx (mounted once)
 *        <PushPermissionPrompt />
 *
 *        // somewhere far away, after a task is completed:
 *        import { firePushPermissionPrompt } from "@/components/PushPermissionPrompt";
 *        firePushPermissionPrompt("task-completed");
 *
 * 2. **Controlled mode** — pass `open={true}` and `onOpenChange` if you
 *    prefer to drive state via parent React state.
 *
 * The card auto-hides once the user has decided (granted/denied),
 * once they dismiss it (sticky for 14 days), or if the browser doesn't
 * support notifications.
 *
 * NEVER auto-show on page load — Chrome's abusive-permission filter
 * silences sites that prompt without a user gesture. That's why this
 * file flipped from "auto on first mount" to "fire on trigger".
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

/**
 * DOM event name used by the auto-mode trigger helper. Mounted
 * <PushPermissionPrompt /> listens for this and shows itself with the
 * event's detail.trigger as the trigger string.
 */
const FIRE_EVENT = "spacefield:push-permission-prompt";

interface FireDetail {
  trigger: string;
  message?: string;
}

/**
 * Fire from anywhere on the client after a positive moment.
 *
 *   import { firePushPermissionPrompt } from "@/components/PushPermissionPrompt";
 *   firePushPermissionPrompt("task-completed");
 *   firePushPermissionPrompt("workspace-created", { message: "Get pinged when teammates jump in?" });
 */
export function firePushPermissionPrompt(
  trigger: string,
  options?: { message?: string }
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<FireDetail>(FIRE_EVENT, {
        detail: { trigger, message: options?.message },
      })
    );
  } catch {
    // ignore
  }
}

export type PushPermissionPromptProps = {
  /** Optional trigger label for analytics; defaults to "manual". */
  trigger?: string;
  message?: string;
  ctaLabel?: string;
  dismissLabel?: string;
  onDecide?: (state: PushPermissionState, trigger: string) => void;
};

export default function PushPermissionPrompt({
  trigger: triggerProp,
  message: messageProp,
  ctaLabel = "Enable notifications",
  dismissLabel = "Not now",
  onDecide,
}: PushPermissionPromptProps) {
  const { state, request } = usePushPermission();
  const [visible, setVisible] = useState(false);
  // Current trigger and message — overwritten by event payloads.
  const [trigger, setTrigger] = useState<string>(triggerProp ?? "manual");
  const [message, setMessage] = useState<string>(
    messageProp ?? "Want a heads-up when something needs your attention?"
  );

  // Listen for global trigger events so any far-away component can pop
  // the prompt without prop drilling. We still bail when the user has
  // already decided or recently dismissed.
  useEffect(() => {
    function onFire(e: Event) {
      const detail = (e as CustomEvent<FireDetail>).detail;
      if (!detail) return;
      // Browser support / user has already decided / recently dismissed
      // — silently no-op. We re-check rather than trust the last
      // `state` snapshot to dodge a stale-closure race.
      if (typeof window === "undefined") return;
      if (!("Notification" in window)) return;
      if (
        window.Notification.permission === "granted" ||
        window.Notification.permission === "denied"
      ) {
        return;
      }
      if (recentlyDismissed()) return;
      setTrigger(detail.trigger);
      if (detail.message) setMessage(detail.message);
      setVisible(true);
    }
    window.addEventListener(FIRE_EVENT, onFire);
    return () => window.removeEventListener(FIRE_EVENT, onFire);
  }, []);

  // If the user transitions to a decided state mid-render, hide.
  useEffect(() => {
    if (hasDecidedPushPermission(state) || state === "unsupported") {
      setVisible(false);
    }
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
      className="fixed bottom-4 start-4 z-[9997] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-app bg-app-elevated p-4 shadow-2xl"
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
