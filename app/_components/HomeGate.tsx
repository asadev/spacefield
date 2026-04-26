"use client";

/* HomeGate — decides whether to render the marketing Landing or the
 * Desktop OS for visitors hitting `/`.
 *
 * Policy (per product decision):
 *   - Signed out → ALWAYS see the marketing Landing. No anonymous
 *     workspace access. Local-only state (if it exists from earlier
 *     visits) is preserved but not shown until the user signs in.
 *   - Signed in  → Desktop.
 *
 * Subscribes to onAuthStateChange so signing in via Landing's CTA
 * swaps to Desktop without a reload, and signing out flips back. */

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import Desktop from "../tools/_components/Desktop";
import Landing from "./Landing";

type Mode = "loading" | "desktop" | "landing";

export default function HomeGate() {
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
    let cancelled = false;

    // No Supabase configured → there's no way to be signed in, show
    // Landing. (Used in local dev without env vars.)
    if (!isSupabaseConfigured()) {
      setMode("landing");
      return;
    }

    const supabase = getSupabase();

    // Initial session check
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setMode(data.user ? "desktop" : "landing");
    });

    // Reactive sign-in / sign-out
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setMode(session?.user ? "desktop" : "landing");
      }
    );

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
