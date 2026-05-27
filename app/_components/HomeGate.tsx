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

interface Props {
  /** Server-side hint that a Supabase auth cookie is present. When true
   * we skip the marketing hero in the SSR fallback (the user is probably
   * signed in — showing them a "Sign in" CTA that bounces back through
   * /?signup=1 → / is broken UX). Doesn't validate the JWT, just
   * suppresses the wrong-state flash for known-likely-authed visitors. */
  likelyAuthed?: boolean;
}

export default function HomeGate({ likelyAuthed = false }: Props) {
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
    // SSR + first-paint fallback.
    //  - If we have a server-side hint the visitor is signed in
    //    (likelyAuthed), render a neutral background so there's no
    //    flash of the marketing "Sign in" hero before Desktop takes
    //    over. (2026-05-27 fix: clicking that flash hero bounced
    //    users through /?signup=1 → / and felt like the sign-in was
    //    broken.)
    //  - Otherwise, paint the marketing hero — crawlers, JS-disabled
    //    visitors, and genuinely-new arrivals see the value prop +
    //    CTAs instead of an empty <body>.
    if (likelyAuthed) {
      return <div className="fixed inset-0 bg-app" aria-hidden="true" />;
    }
    return <HomeSsrFallback />;
  }
  if (mode === "desktop") {
    return <Desktop />;
  }
  return <Landing />;
}

/* Static, server-renderable hero for the initial paint + crawlers.
 * Tokens-only colors so it matches whichever theme the user has.
 * Kept intentionally tiny — no images, no animations, no third-party
 * fonts — so it adds <1KB of HTML to the response body. */
function HomeSsrFallback() {
  return (
    <main
      className="fixed inset-0 bg-app text-app overflow-auto"
      data-ssr-fallback="home"
    >
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Your workspace, the way an operating system should feel.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
          Space Field is a multi-workspace desktop with native apps for real
          estate, finance, marketing, sales, and the rest of the work you
          actually do. Create workspaces, install tools, run them like apps,
          and let one AI assistant move across every one of them.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/?signup=1"
            className="rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </a>
          <a
            href="/waitlist"
            className="rounded-lg border border-app bg-app-elevated px-5 py-2.5 text-sm font-medium transition-colors hover:border-tool-accent"
          >
            Join the waitlist
          </a>
        </div>
        <noscript>
          <p className="mt-8 text-xs text-muted">
            JavaScript is required for the full desktop experience. The links
            above still work without it.
          </p>
        </noscript>
      </div>
    </main>
  );
}
