"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Files Manager — standalone-route SEO fallback
   ───────────────────────────────────────────────────────────────────────────
   Workspace users open this tool inside a floating window — _app.tsx is the
   in-window component. This page.tsx exists for direct visits to
   /tools/files-manager (search engines, deep links, share targets).
   It mounts the same _app component, feeding it live viewport size and the
   workspace-Window NativeAppProps shape.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import FilesManagerApp from "./_app";

export default function FilesManagerPage() {
  const [size, setSize] = useState({ w: 1100, h: 720 });
  const [resolved, setResolved] = useState<"dark" | "light">("light");

  useEffect(() => {
    const measure = () => {
      setSize({
        w: typeof window !== "undefined" ? window.innerWidth : 1100,
        h: typeof window !== "undefined" ? window.innerHeight : 720,
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
        <FilesManagerApp
          windowId="standalone"
          width={size.w}
          height={size.h}
          resolved={resolved}
          openApp={() => {
            /* standalone: no in-workspace window manager */
          }}
          closeWindow={() => {
            /* standalone: nothing to close */
          }}
        />
      </div>
    </div>
  );
}
