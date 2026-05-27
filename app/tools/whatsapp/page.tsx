"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   WhatsApp — standalone-route fallback
   ───────────────────────────────────────────────────────────────────────────
   Workspace users open WhatsApp inside a floating window via _app.tsx.
   This page.tsx exists for direct visits to /tools/whatsapp (deep links,
   mobile, share targets). It mounts the same _app component with live
   viewport size and the NativeAppProps shape.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import WhatsAppApp from "./_app";

export default function WhatsAppPage() {
  /* K-16: setting an explicit { w: 960, h: 640 } as the initial state
   * caused a server-vs-client hydration mismatch (React error #418) on
   * mobile viewports — the SSR HTML rendered the desktop-width layout
   * (compact=false), the first client render also rendered desktop, then
   * the useEffect re-measured and re-rendered compact=true on the next
   * tick. The intermediate desktop pass leaked into hydration diffs for
   * any descendant whose markup depends on `compact`. Now we hold null
   * until measurement so the first paint is a deterministic spinner —
   * which matches what the SSR pass emits. */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [resolved, setResolved] = useState<"dark" | "light">("light");

  useEffect(() => {
    const measure = () => {
      setSize({
        w: typeof window !== "undefined" ? window.innerWidth : 960,
        h: typeof window !== "undefined" ? window.innerHeight : 640,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setResolved(next);
    const obs = new MutationObserver(() => {
      const v = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      setResolved(v);
    });
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  if (!size) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app text-app">
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
          loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-app text-app">
      <div className="mx-auto" style={{ height: size.h }}>
        <WhatsAppApp
          windowId="standalone"
          width={size.w}
          height={size.h}
          resolved={resolved}
          openApp={() => undefined}
          closeWindow={() => undefined}
        />
      </div>
    </div>
  );
}
