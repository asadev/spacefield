/* ─────────────────────────────────────────────────────────────────────────
 * Public viewer layout — bare HTML, NO Spacefield brand chrome.
 *
 * This is what visitors of toshare.net see. They've never heard of
 * Spacefield and shouldn't be marketed to. The shell is minimal: just a
 * footer with "Powered by toshare.net" (paid tier can hide it).
 *
 * IMPORTANT: We force a self-contained LIGHT theme via inline styles
 * instead of relying on Tailwind `dark:` variants. The Spacefield root
 * sets `data-theme="dark"` on <html> by default for anonymous visitors,
 * which made `dark:` variants fire AND inherit the spacefield body's
 * color tokens — leading to dark-on-dark unreadable text. Public share
 * pages should look clean and identical regardless of the visitor's
 * theme preference. Light mode for everyone.
 * ───────────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  // `absolute` overrides the root layout's "%s | Space Field" template
  // so titles on toshare.net don't leak the spacefield brand.
  title: { absolute: "toShare" },
  description: "",
  metadataBase: new URL("https://toshare.net"),
  robots: { index: false, follow: false },
  openGraph: {
    title: "toShare",
    description: "",
    siteName: "toShare",
    url: "https://toshare.net",
    images: [],
    type: "website",
  },
  twitter: { title: "toShare", description: "", images: [] },
  alternates: { canonical: "https://toshare.net" },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#ffffff",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: "768px",
          margin: "0 auto",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <main style={{ flex: 1, padding: "40px 16px" }} className="sm:!p-16">
          {children}
        </main>
        <footer
          style={{
            padding: "24px 16px",
            textAlign: "center",
            fontSize: "12px",
            color: "#94a3b8",
          }}
        >
          <a
            href="https://toshare.net"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            toshare.net
          </a>
        </footer>
      </div>
    </div>
  );
}
