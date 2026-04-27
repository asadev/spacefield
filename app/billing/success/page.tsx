import Link from "next/link";

/* /billing/success
 *
 *   Paddle's overlay redirects here (or pops back to a success URL
 *   after the overlay closes). Paddle.js's `checkout.completed` event
 *   already fired client-side; we just need to render confirmation.
 *   The webhook is the source of truth for the entitlement flip —
 *   usually lands within seconds.
 *
 *   We never write to the DB from this page — the webhook is the only
 *   authoritative path for tier/addon state. This page is purely
 *   informational.
 */

export const dynamic = "force-dynamic";

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-app">Payment received</h1>
      <p className="mt-3 text-sm text-secondary">
        Your plan is being activated. It usually takes a few seconds.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/tools"
          className="inline-flex items-center justify-center rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Go to your workspace
        </Link>
        <Link
          href="/pricing"
          className="inline-flex items-center justify-center rounded-lg border border-app bg-app px-5 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
        >
          Back to pricing
        </Link>
      </div>
    </main>
  );
}
