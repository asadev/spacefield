/* not-found BOUNDARY for the (share) route group.
 *
 * When any share viewer calls notFound(), Next.js walks up looking for
 * the nearest not-found.tsx file. Without this, it falls through to
 * app/not-found.tsx — the spacefield root 404 with "Back to Space Field"
 * CTAs. We want the share-branded one instead.
 */

export default function ShareNotFound() {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Link not found</h1>
      <p className="text-sm text-slate-500">
        This share link is invalid, expired, or has been removed by its owner.
      </p>
    </div>
  );
}
