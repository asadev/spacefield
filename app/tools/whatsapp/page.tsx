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
  const [size, setSize] = useState({ w: 960, h: 640 });
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
