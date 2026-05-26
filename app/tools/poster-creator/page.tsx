/* ═══════════════════════════════════════════════════════════════════════════
   /tools/poster-creator — public route
   ───────────────────────────────────────────────────────────────────────────
   2026-05-27 (Agent D): rebuilt to mirror the post-2026-04-30 stance that
   tools have NO standalone pages — direct /tools/* visits get redirected
   through the workspace shell by middleware (`shellRedirectForStandaloneTool`
   in middleware.ts). This page exists only as a routing target; the actual
   UI lives in `_app.tsx` and is loaded as an iframe inside the OS Window.

   When the OS shell *does* iframe this page (the request carries the
   `frame=1` marker), we mount the same default-export from _app.tsx so the
   iframe sees the native app.
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import { useEffect, useState } from "react";
import PosterCreatorApp from "./_app";
import type { NativeAppProps } from "../_data/tools-list";

export default function PosterCreatorPage() {
  // Used when the request is iframed by the OS shell (middleware passes
  // frame=1 through and skips the redirect). Outside the iframe, middleware
  // already redirected the visitor to `/?app=poster-creator`, so this
  // branch effectively never renders.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    function update() {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!size) return null;

  const props: NativeAppProps = {
    windowId: "poster-creator-standalone",
    width: size.w,
    height: size.h,
    initialParams: undefined,
    initialParamsKey: 0,
    resolved: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
    openApp: (slug: string) => {
      try {
        window.location.href = `/?app=${encodeURIComponent(slug)}`;
      } catch {}
    },
    closeWindow: () => {
      try {
        window.history.back();
      } catch {}
    },
  };

  return (
    <div className="fixed inset-0">
      <PosterCreatorApp {...props} />
    </div>
  );
}
