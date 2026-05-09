"use client";

/* Small client island for the maintenance page's retry button. We can't
 * use a plain <a href={current}> because that would be a no-op when the
 * URL is already /maintenance. Reload via location.reload() so the
 * middleware re-checks maintenance_active() and routes back to the
 * originally-requested path once the toggle is flipped off. */
export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="border border-white/10 bg-white/[0.09] px-7 py-4 text-[0.75rem] uppercase tracking-[0.15em] text-white transition-colors hover:bg-white/[0.14]"
    >
      Try again
    </button>
  );
}
