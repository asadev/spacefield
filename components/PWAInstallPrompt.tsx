"use client";

import { useEffect, useState } from "react";

/**
 * Passive "Install Spacefield" banner.
 *
 * - Listens for `beforeinstallprompt` (Chrome/Edge/Android). iOS Safari
 *   does NOT fire this — install on iOS is manual via the share sheet.
 * - Shows a small bottom-LEFT card so it doesn't fight CookieConsent
 *   (which sits bottom-right).
 * - Dismissal persists for 30 days. After install we hide forever.
 *
 * If the browser doesn't fire the event, we render nothing — no fallback
 * "click here to install" pseudo-banner. Real CTA only.
 */

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const DISMISS_KEY = "spacefield-pwa-install-dismissed-at";
const INSTALLED_KEY = "spacefield-pwa-installed";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

function isAlreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(INSTALLED_KEY) === "true") return true;
  } catch {
    // ignore
  }
  // Standalone display modes — already running as an installed PWA.
  const navWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  if (navWithStandalone.standalone === true) return true;
  if (
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches
  ) {
    return true;
  }
  return false;
}

export default function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isAlreadyInstalled()) return;
    if (recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      try {
        window.localStorage.setItem(INSTALLED_KEY, "true");
      } catch {
        // ignore
      }
      setDeferred(null);
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        try {
          window.localStorage.setItem(INSTALLED_KEY, "true");
        } catch {
          // ignore
        }
      } else {
        dismiss();
        return;
      }
    } catch {
      // Some browsers throw if prompt() is called twice; just hide.
    }
    setDeferred(null);
    setVisible(false);
  };

  if (!visible || !deferred) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Spacefield"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[9998] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-app bg-app-elevated p-4 shadow-2xl"
    >
      <p className="text-sm font-semibold text-app">Install Spacefield</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Add it to your home screen for a faster, full-screen workspace.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={install}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-app px-3 py-1.5 text-xs font-medium text-app hover:bg-app-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
