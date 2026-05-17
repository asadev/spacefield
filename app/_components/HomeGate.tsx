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
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import Landing from "./Landing";

/* Mobile-perf (Wave 4 Z2): the Desktop tree pulls in 50+ components for
 * the OS shell. Signed-out visitors — the long tail of mobile cold-load
 * traffic — never see it. Gating the import behind `dynamic` keeps the
 * OS-shell chunk out of the initial bundle for `/`. The loader is a
 * solid background so the visual is identical to the "loading" state
 * below (a 1-frame flash either way). */
const Desktop = dynamic(() => import("../tools/_components/Desktop"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-app" aria-hidden="true" />,
});

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

/** Read `?next=` from window.location instead of useSearchParams() so the
 *  home page can stay statically prerendered — useSearchParams() forces a
 *  CSR bailout that breaks `next build` on `/`. */
function readNextFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    return sanitizeNext(sp.get("next"));
  } catch {
    return null;
  }
}

export default function HomeGate() {
  const [mode, setMode] = useState<Mode>("loading");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const next = readNextFromLocation();

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
  }, [router]);

  if (mode === "loading") {
    return <div className="fixed inset-0 bg-app" aria-hidden="true" />;
  }
  if (mode === "desktop") {
    return <Desktop />;
  }
  return <Landing />;
}
