import "server-only";

/* lib/billing/paddle.ts — Paddle.com implementation of the billing abstraction.
 *
 * Paddle's recommended checkout is client-side: a Paddle.js overlay
 * opened with `Paddle.Checkout.open({ items, customer, customData })`.
 * The server's job is small:
 *
 *   1. Resolve which price_id to use from PADDLE_PRODUCTS, given the
 *      requested tier or add-on GB delta.
 *   2. Stamp custom_data so the webhook can map back to user_id +
 *      workspace_id + kind. Paddle echoes this on subscription.created.
 *   3. Return the payload to the browser. The TierCard / StorageSection
 *      client component then loads Paddle.js and opens the overlay.
 *
 * We don't pre-create the Paddle customer here — Paddle.js creates it
 * lazily when the overlay opens. That's one less round-trip while
 * still keeping the server as the source of truth for which price the
 * user can buy.
 */

import {
  PADDLE_TIER_PRODUCTS,
  PADDLE_ADDON_PRODUCTS,
} from "@/app/_data/paddle-products";
import type { CheckoutInput, CheckoutResult } from "./index";

export async function paddleCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  let priceId: string;
  const customData: Record<string, string> = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    kind: input.kind,
  };

  if (input.kind === "tier") {
    if (!input.tier) throw new Error("tier is required for kind=tier");
    priceId = PADDLE_TIER_PRODUCTS[input.tier].price_id;
    customData.tier = input.tier;
  } else {
    if (!input.addon_gb) throw new Error("addon_gb is required for kind=addon");
    priceId = PADDLE_ADDON_PRODUCTS[input.addon_gb].price_id;
    customData.addon_gb = String(input.addon_gb);
  }

  return {
    provider: "paddle",
    paddle: {
      price_id: priceId,
      customer_email: input.userEmail,
      custom_data: customData,
    },
  };
}
