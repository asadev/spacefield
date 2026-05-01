import Link from "next/link";
import type { Metadata } from "next";

/* /not-found — custom 404 surface. Next.js renders this whenever a
 * route or notFound() call doesn't resolve. Same dark visual language
 * as app/error.tsx so 404 vs unhandled-error feel like siblings. */

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you're looking for doesn't exist on Space Field.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050507] px-6">
      <div className="max-w-md text-center">
        <p className="mb-4 text-[0.6rem] uppercase tracking-[0.25em] text-gray-500">
          404
        </p>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-white">
          Page not found
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-gray-400">
          The link you followed may be broken or the page may have moved. Try
          heading back to the desktop or pricing.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="border border-white/10 bg-white/[0.09] px-7 py-4 text-[0.75rem] uppercase tracking-[0.15em] text-white transition-colors hover:bg-white/[0.14]"
          >
            Back to Space Field
          </Link>
          <Link
            href="/pricing"
            className="border border-transparent px-7 py-4 text-[0.75rem] uppercase tracking-[0.15em] text-gray-400 transition-colors hover:text-white"
          >
            See pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
