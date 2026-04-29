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
 * swaps to Desktop without a reload, and signing out flips back.
 *
 * `?next=/path` honored: deep-links from inner pages (e.g. /ai's
 * "Sign in" CTA) point at /?next=/ai. When a user arrives signed in,
 * or signs in afterward, we router.push to the target. The next URL
 * is sanitized to a same-origin path to prevent open-redirects. */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import Desktop from "../tools/_components/Desktop";
import Landing from "./Landing";

type Mode = "loading" | "desktop" | "landing";

/** Strip everything except a same-origin pathname (+ optional query/hash).
 *  Anything that looks like an absolute URL or protocol-relative is
 *  rejected. */
function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export default function HomeGate() {
  const [mode, setMode] = useState<Mode>("loading");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams?.get("next") ?? null);

  useEffect(() => {
    let cancelled = false;

    // No Supabase configured → there's no way to be signed in, show
    // Landing. (Used in local dev without env vars.)
    if (!isSupabaseConfigured()) {
      setMode("landing");
      return;
    }

    const supabase = getSupabase();

    const goNextOrDesktop = (signedIn: boolean) => {
      if (cancelled) return;
      if (signedIn && next && next !== "/") {
        router.replace(next);
        return;
      }
      setMode(signedIn ? "desktop" : "landing");
    };

    // Initial session check
    supabase.auth.getUser().then(({ data }) => {
      goNextOrDesktop(Boolean(data.user));
    });

    // Reactive sign-in / sign-out
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        goNextOrDesktop(Boolean(session?.user));
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, next]);

  if (mode === "loading") {
    return <div className="fixed inset-0 bg-app" aria-hidden="true" />;
  }
  if (mode === "desktop") {
    return <Desktop />;
  }
  return <Landing />;
}
