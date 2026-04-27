import "server-only";

/* lib/billing/index.ts — provider-agnostic billing abstraction.
 *
 * Polar.sh wiring shipped first (commit 0f4b453). Polar uses Stripe
 * Connect for payouts, which doesn't accept UAE individuals. Paddle
 * has its own merchant infrastructure that does. Asad's Paddle
 * account is under review; while it's reviewed, we add Paddle
 * alongside Polar behind this small abstraction. A single env var
 * (BILLING_PROVIDER) flips the active provider with no code changes.
 *
 * Both providers' code paths stay live so we can switch back if
 * Paddle review goes sideways.
 *
 * The shape of CheckoutResult is union-ish on purpose:
 *   - Polar returns a hosted-checkout `url` — the client redirects.
 *   - Paddle returns a `paddle: { price_id, custom_data, customer_email }`
 *     payload that the client feeds into Paddle.js's overlay checkout.
 *
 * The /api/billing/checkout route returns the result as-is; clients
 * branch on `provider`.
 */

import { paddleCheckout } from "./paddle";
import { polarCheckout } from "./polar";

export type BillingProvider = "paddle" | "polar";

export const ACTIVE_PROVIDER: BillingProvider =
  (process.env.BILLING_PROVIDER as BillingProvider) === "polar" ? "polar" : "paddle";

export interface CheckoutInput {
  kind: "tier" | "addon";
  tier?: "pro" | "team";
  addon_gb?: 500 | 2048 | 10240;
  workspaceId: string;
  userId: string;
  userEmail: string;
  /** Origin to derive success/return URL from (Polar uses this; Paddle's overlay uses its own success event). */
  origin: string;
}

export interface PaddleCheckoutPayload {
  price_id: string;
  customer_email: string;
  custom_data: Record<string, string>;
}

export interface CheckoutResult {
  provider: BillingProvider;
  /** Polar: hosted-checkout URL. Paddle: same-page success URL ('/billing/success?...'). */
  url?: string;
  session_id?: string;
  /** Paddle-only: feed this into Paddle.Checkout.open() on the client. */
  paddle?: PaddleCheckoutPayload;
}

export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  if (ACTIVE_PROVIDER === "paddle") return paddleCheckout(input);
  return polarCheckout(input);
}
