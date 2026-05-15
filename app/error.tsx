"use client";

/* SC-004 — Previously rendered `error.message` directly. In production
 * that surfaces raw error strings from server actions / Supabase /
 * downstream services to end users, leaking schema details, query
 * fragments, and stack-frame paths. We now show only `error.digest`
 * (Next's opaque ref that ties the client view back to the server log)
 * and a generic message. The full error is still in server logs. */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050507] px-6">
      <div className="text-center max-w-md">
        <p className="text-[0.6rem] uppercase tracking-[0.25em] text-gray-500 mb-4">Error</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-4">
          Something went wrong
        </h1>
        <p className="text-sm text-gray-400 mb-4 leading-relaxed">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-[0.65rem] font-mono text-gray-500 mb-8 break-all">
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="border border-white/10 bg-white/[0.09] px-7 py-4 text-[0.75rem] uppercase tracking-[0.15em] text-white transition-colors hover:bg-white/[0.14]"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
