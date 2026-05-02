/* ─────────────────────────────────────────────────────────────────────────
 * Public viewer layout — bare HTML, NO Spacefield brand chrome.
 *
 * This is what visitors of toshare.net see. They've never heard of
 * Spacefield and shouldn't be marketed to. The shell is minimal: just a
 * footer with "Powered by toshare.net" (paid tier can hide it).
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
  // Override every Spacefield-branded field the root layout sets.
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
    <div className="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
        <main className="flex-1 px-4 py-10 sm:px-6 sm:py-16">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-600">
          <a href="https://toshare.net" className="hover:text-slate-700 dark:hover:text-slate-400">
            toshare.net
          </a>
        </footer>
      </div>
    </div>
  );
}
