import "server-only";

/* lib/billing/index.ts — billing entrypoint.
 *
 * Paddle is the only payment provider. The earlier Polar.sh wiring was
 * removed once Paddle's merchant review cleared and we committed to a
 * single processor (Polar required Stripe Connect, which doesn't accept
 * UAE individuals).
 *
 * Paddle's recommended flow is client-side overlay checkout. This
 * module's `createCheckout()` returns a small payload that the browser
 * feeds straight into `Paddle.Checkout.open(...)`.
 */

import { paddleCheckout } from "./paddle";

export type BillingProvider = "paddle";

export const ACTIVE_PROVIDER: BillingProvider = "paddle";

export interface CheckoutInput {
  kind: "tier" | "addon";
  tier?: "pro" | "team";
  addon_gb?: 500 | 2048 | 10240;
  workspaceId: string;
  userId: string;
  userEmail: string;
  /** Origin to derive success/return URL from. */
  origin: string;
}

export interface PaddleCheckoutPayload {
  price_id: string;
  customer_email: string;
  custom_data: Record<string, string>;
}

export interface CheckoutResult {
  provider: BillingProvider;
  /** Same-page success URL ('/billing/success?...') if the caller wants it. */
  url?: string;
  session_id?: string;
  /** Feed this into Paddle.Checkout.open() on the client. */
  paddle?: PaddleCheckoutPayload;
}

export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  return paddleCheckout(input);
}
