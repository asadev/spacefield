import type { ReactNode } from "react";

/* Solutions tool pages are standalone — direct visits show the tool with
 * theme support and nothing else. The workspace at / mounts most tools as
 * native React components (no iframe), but iframe-fallback tools still
 * load this route with ?frame=1. */
export default function SolutionsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-app">{children}</div>;
}
