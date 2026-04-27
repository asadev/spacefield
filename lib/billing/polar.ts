import "server-only";

/* lib/billing/polar.ts — Polar.sh implementation of the billing abstraction.
 *
 * Pre-existing logic (originally inlined in /api/billing/checkout/route.ts)
 * lifted into this module. The route handler now just calls
 * createCheckout() from lib/billing/index.ts which dispatches based on
 * the active provider.
 */

import { createPolarCheckout } from "@/lib/polar";
import {
  POLAR_TIER_PRODUCTS,
  POLAR_ADDON_PRODUCTS,
} from "@/app/_data/polar-products";
import type { CheckoutInput, CheckoutResult } from "./index";

export async function polarCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  let productId: string;
  const metadata: Record<string, string | number> = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    kind: input.kind,
  };

  if (input.kind === "tier") {
    if (!input.tier) throw new Error("tier is required for kind=tier");
    productId = POLAR_TIER_PRODUCTS[input.tier].product_id;
    metadata.tier = input.tier;
  } else {
    if (!input.addon_gb) throw new Error("addon_gb is required for kind=addon");
    productId = POLAR_ADDON_PRODUCTS[input.addon_gb].product_id;
    metadata.addon_gb = input.addon_gb;
  }

  const successUrl = `${input.origin}/billing/success?provider=polar&checkout_id={CHECKOUT_ID}`;

  const checkout = await createPolarCheckout({
    productId,
    successUrl,
    customerEmail: input.userEmail,
    metadata,
  });

  return {
    provider: "polar",
    url: checkout.url,
    session_id: checkout.id,
  };
}
