import Link from "next/link";
import { getPolarCheckout } from "@/lib/polar";

/* /billing/success
 *
 *   Both providers redirect (or in Paddle's case, pop back to a
 *   success URL after the overlay closes) here. Search params:
 *
 *     - provider=polar  + checkout_id=<polar_id>  → fetch checkout
 *       from Polar to confirm the status server-side.
 *     - provider=paddle (no id) → Paddle.js's `checkout.completed`
 *       event already fired client-side; we just need to render
 *       confirmation. The webhook is the source of truth for the
 *       entitlement flip — usually lands within seconds.
 *
 *   We never write to the DB from this page — both webhooks are the
 *   only authoritative path for tier/addon state. This page is purely
 *   informational.
 */

export const dynamic = "force-dynamic";

interface SearchParams {
  checkout_id?: string | string[];
  provider?: string | string[];
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const checkoutId = pickFirst(params.checkout_id);
  const provider = pickFirst(params.provider) ?? (checkoutId ? "polar" : "paddle");

  let confirmed = provider === "paddle";
  let kindLabel: string | null = null;
  let errorMessage: string | null = null;

  if (provider === "polar" && checkoutId) {
    try {
      const checkout = await getPolarCheckout(checkoutId);
      const status = checkout.status ?? "";
      confirmed = status === "succeeded" || status === "confirmed";
      const meta = checkout.metadata ?? {};
      const kind = typeof meta.kind === "string" ? meta.kind : null;
      const tier = typeof meta.tier === "string" ? meta.tier : null;
      const addonGb = typeof meta.addon_gb === "string" ? meta.addon_gb : null;
      if (kind === "tier" && tier) {
        kindLabel = `Spacefield ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
      } else if (kind === "addon" && addonGb) {
        const gb = Number(addonGb);
        if (gb >= 1024) kindLabel = `+${(gb / 1024).toFixed(0)} TB storage add-on`;
        else kindLabel = `+${gb} GB storage add-on`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Could not confirm checkout.";
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-app">
        {confirmed ? "Payment received" : "Thanks!"}
      </h1>
      <p className="mt-3 text-sm text-secondary">
        {confirmed && kindLabel
          ? `Your ${kindLabel} is being activated. It usually takes a few seconds.`
          : "Your plan is being activated. It usually takes a few seconds."}
      </p>
      {errorMessage && (
        <p className="mt-3 text-xs text-muted">
          (Note: we couldn&apos;t reach the payment provider to verify the receipt — that&apos;s
          normal in rare cases. The webhook will still process your purchase.)
        </p>
      )}
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
