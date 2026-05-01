/* Root loading boundary. Next.js streams this immediately while the
 * matching page server-renders, so users on slow connections get a
 * visible heartbeat instead of a blank white frame.
 *
 * Kept intentionally minimal: dark background, a quiet spinner, no
 * brand chrome. Most routes have their own loading skeletons that
 * take over once they mount; this is just the bridge. */
export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="flex min-h-screen items-center justify-center bg-[#050507]"
    >
      <span className="sr-only">Loading…</span>
      <span
        aria-hidden="true"
        className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/65"
      />
    </main>
  );
}
