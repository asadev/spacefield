"use client";

/* HomeGate — decides whether to render the marketing Landing or the
 * Desktop OS for visitors hitting `/`.
 *
 * Decision tree:
 *   1. Returning local user (workspaces:list:v1 has entries) → Desktop.
 *   2. Signed-in Supabase user → Desktop.
 *   3. Otherwise → Landing.
 *
 * We read the Supabase session directly via the singleton client rather
 * than mounting AuthProvider here — the AuthProvider lives inside
 * Desktop and we don't want to double-mount it. The Landing has its own
 * narrow AuthProvider just so it can reuse the SignInDialog.
 *
 * Subscribes to onAuthStateChange so signing in via the Landing's CTA
 * swaps to Desktop without a hard refresh. */

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import Desktop from "../tools/_components/Desktop";
import Landing from "./Landing";

const WORKSPACES_KEY = "workspaces:list:v1";

type Mode = "loading" | "desktop" | "landing";

/** Synchronously check localStorage for an existing workspace. SSR-safe:
 *  during render on the server, `window` is undefined so we return false
 *  and let the effect take over after hydration. */
function hasLocalWorkspace(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

export default function HomeGate() {
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
    let cancelled = false;

    // 1. Local workspace shortcut — synchronous, no network.
    if (hasLocalWorkspace()) {
      setMode("desktop");
      return;
    }

    // 2. If Supabase isn't configured, there's no session to check.
    if (!isSupabaseConfigured()) {
      setMode("landing");
      return;
    }

    const supabase = getSupabase();

    // 2a. Async session check.
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setMode(data.user ? "desktop" : "landing");
    });

    // 3. Watch for sign-in / sign-out events. When the Landing's
    //    SignInDialog completes, we swap to Desktop without a reload.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        setMode("desktop");
      } else if (!hasLocalWorkspace()) {
        setMode("landing");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (mode === "loading") {
    return <div className="fixed inset-0 bg-app" aria-hidden="true" />;
  }

  if (mode === "desktop") {
    return <Desktop />;
  }

  return <Landing />;
}
