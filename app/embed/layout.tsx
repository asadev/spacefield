/* ─────────────────────────────────────────────────────────────────────────
 * Embed layout — bare shell, no Spacefield chrome.
 *
 * Customers iframe these widgets onto random websites; the page should
 * render predictably regardless of how the parent site is themed. We
 * lock to a light palette via inline styles and don't pull in any of the
 * Spacefield providers (Theme, CommandPalette, Toaster, etc).
 *
 * The root layout is the one Next.js uses, but each sub-tree can wrap
 * children with its own. We deliberately keep this lightweight so the
 * widget bundle stays small on slow customer networks.
 * ───────────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Spacefield embed" },
  description: "",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#ffffff",
        color: "#0f172a",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        WebkitFontSmoothing: "antialiased",
        padding: "16px",
      }}
    >
      {children}
      <div
        style={{
          marginTop: "12px",
          textAlign: "right",
          fontSize: "11px",
          color: "#94a3b8",
        }}
      >
        <a
          href="https://spacefield.co"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          Powered by Spacefield
        </a>
      </div>
    </div>
  );
}
