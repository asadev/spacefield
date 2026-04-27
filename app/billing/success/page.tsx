import Link from "next/link";
import { getPolarCheckout } from "@/lib/polar";

/* /billing/success
 *
 *   Polar redirects here after a successful checkout. The URL has a
 *   `checkout_id={CHECKOUT_ID}` query param (Polar substitutes the
 *   token automatically). We fetch the checkout from Polar to confirm
 *   it's marked confirmed/succeeded so we can give the user immediate
 *   visual confirmation — the actual entitlement flip happens via the
 *   webhook (subscription.created/updated), which usually lands within
 *   seconds.
 *
 *   We don't write to the DB from this page — the webhook is the only
 *   authoritative path for tier/addon state changes. This page is
 *   purely informational.
 *
 *   On error (unknown checkout, API down) we still render a friendly
 *   message — Polar will retry the webhook regardless.
 */

export const dynamic = "force-dynamic";

interface SearchParams {
  checkout_id?: string | string[];
}

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const rawId = params.checkout_id;
  const checkoutId = Array.isArray(rawId) ? rawId[0] : rawId;

  let confirmed = false;
  let kindLabel: string | null = null;
  let errorMessage: string | null = null;

  if (checkoutId) {
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
          (Note: we couldn&apos;t reach Polar to verify the receipt — that&apos;s normal in
          rare cases. The webhook will still process your purchase.)
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
