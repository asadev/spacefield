/* ─────────────────────────────────────────────────────────────────────────
 * Public viewer layout — bare HTML, NO Spacefield brand chrome.
 *
 * This is what visitors of share.example.com see. They've never heard of
 * Spacefield and shouldn't be marketed to. The shell is minimal: just a
 * footer with "Powered by share.example.com" (paid tier can hide it).
 * ───────────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Share",
  description: "A page someone shared with you.",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
        <main className="flex-1 px-4 py-10 sm:px-6 sm:py-16">{children}</main>
        <footer className="border-t border-slate-200 px-4 py-4 text-xs text-slate-500 dark:border-slate-800">
          Powered by{" "}
          <a href="https://share.example.com" className="font-medium hover:underline">
            share.example.com
          </a>
        </footer>
      </div>
    </div>
  );
}
