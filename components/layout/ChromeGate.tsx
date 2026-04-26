"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

/**
 * Hides the global chrome (Nav / Footer / SiteBanner / GeoRedirect) on
 * workspace-style routes that have their own full-screen layout:
 *  - /workspace and /workspace/* — the desktop OS (current home)
 *  - /tools and /tools/* — legacy desktop route + standalone tool pages
 *  - any route loaded inside the desktop iframe (carries ?frame=1)
 * Standalone visits to /solutions/tools/<slug> still get the global chrome.
 */
function ChromeGateInner({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const sp = useSearchParams();
  const framed = sp?.get("frame") === "1";
  const isToolsRoute = pathname === "/tools" || pathname.startsWith("/tools/");
  const isWorkspaceRoute =
    pathname === "/workspace" || pathname.startsWith("/workspace/");
  const hide = isToolsRoute || isWorkspaceRoute || framed;
  if (hide) return null;
  return <>{children}</>;
}

export default function ChromeGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ChromeGateInner>{children}</ChromeGateInner>
    </Suspense>
  );
}
