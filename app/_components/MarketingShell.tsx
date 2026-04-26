"use client";

/* Shared shell for the static marketing pages (about / contact /
 * privacy / terms). Just a centered max-width container with a back
 * link to the workspace and consistent typography. */

import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}

export default function MarketingShell({ eyebrow, title, children }: Props) {
  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-3xl px-6 py-12 lg:py-20">
        <Link
          href="/"
          className="text-[0.72rem] uppercase tracking-[0.14em] text-secondary transition-colors hover:text-app"
        >
          ← Back to workspace
        </Link>
        <header className="mt-8">
          {eyebrow && (
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              {eyebrow}
            </span>
          )}
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-app sm:text-4xl">
            {title}
          </h1>
        </header>
        <div className="prose-sf mt-8 space-y-5 text-secondary">{children}</div>
        <footer className="mt-16 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-app pt-6 text-[0.72rem] uppercase tracking-[0.14em] text-muted">
          <Link href="/about" className="hover:text-app">
            About
          </Link>
          <Link href="/contact" className="hover:text-app">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-app">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-app">
            Terms
          </Link>
          <span className="ml-auto text-muted">
            © {new Date().getFullYear()} Space Field
          </span>
        </footer>
      </div>
      <style jsx global>{`
        .prose-sf h2 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text);
          margin-top: 2rem;
          margin-bottom: 0.5rem;
        }
        .prose-sf p {
          font-size: 0.95rem;
          line-height: 1.65;
        }
        .prose-sf ul {
          list-style: disc;
          padding-left: 1.25rem;
        }
        .prose-sf li {
          font-size: 0.95rem;
          line-height: 1.6;
          margin-top: 0.25rem;
        }
        .prose-sf a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </main>
  );
}
