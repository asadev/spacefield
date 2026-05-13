import Link from "next/link";
import type { ReactNode } from "react";

const LEGAL_NAV = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/dpa", label: "Data Processing Agreement" },
  { href: "/legal/aup", label: "Acceptable Use Policy" },
  { href: "/legal/subprocessors", label: "Subprocessors" },
  { href: "/legal/security", label: "Trust & security" },
  { href: "/legal/accessibility", label: "Accessibility" },
  { href: "/legal/cookies", label: "Cookies" },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8 border-b border-app pb-6">
          <Link
            href="/"
            className="text-[0.6rem] uppercase tracking-[0.25em] text-faint hover:text-app"
          >
            ← Space Field
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Legal</h1>
          <p className="mt-1 text-sm text-secondary">
            Policies, agreements, and the things you should know.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Legal pages" className="space-y-1 text-sm">
            {LEGAL_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="block rounded-md px-2 py-1.5 text-secondary transition-colors hover:bg-app-elevated hover:text-app"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <article className="prose prose-sm max-w-none">{children}</article>
        </div>
      </div>
    </main>
  );
}
