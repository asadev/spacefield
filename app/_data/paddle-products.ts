/* Paddle product + price IDs — generated 2026-04-28.
 *
 * These IDs come from `POST /products` + `POST /prices` against the
 * live Paddle API (production endpoint). Paddle's pricing model is:
 * a Product is the catalog entry, and one or more Prices attach to it
 * for different cadences/regions. We use a single recurring monthly
 * price per product.
 *
 * Pinned in source so:
 *   - The checkout abstraction knows which price_id to spin up a
 *     Paddle.js overlay against, given a tier slug or addon GB delta.
 *   - The webhook handler maps an inbound `items[].price.product_id`
 *     to either a tier_id (Pro/Team) or an addon_gb (500/2048/10240).
 *
 * If the Paddle products are recreated, re-run scripts/paddle-bootstrap
 * (or just curl the API) and replace these values.
 *
 * Enterprise is intentionally absent — that's a "contact sales" flow,
 * no Paddle product.
 */

export interface PaddleTierProduct {
  product_id: string;
  price_id: string;
  tier_id: "pro" | "team";
}

export interface PaddleAddonProduct {
  product_id: string;
  price_id: string;
  addon_gb: 500 | 2048 | 10240;
}

export const PADDLE_TIER_PRODUCTS: Readonly<Record<"pro" | "team", PaddleTierProduct>> = {
  pro: {
    product_id: "pro_01kq8m8qvb84t446129y4fy686",
    price_id: "pri_01kq8m8r8r4evy59ps5a3nhzww",
    tier_id: "pro",
  },
  team: {
    product_id: "pro_01kq8m8rm7vrf0rpxc7w1mxyjz",
    price_id: "pri_01kq8m8rz3ym1m303wwvq2zjeg",
    tier_id: "team",
  },
} as const;

export const PADDLE_ADDON_PRODUCTS: Readonly<Record<500 | 2048 | 10240, PaddleAddonProduct>> = {
  500: {
    product_id: "pro_01kq8m8se8dr56jdaanhbv4rqm",
    price_id: "pri_01kq8m8sxg08zp0cd2f0cd9raz",
    addon_gb: 500,
  },
  2048: {
    product_id: "pro_01kq8m8tbjc3ndsjdvs0jkmg43",
    price_id: "pri_01kq8m8tp29haqrht42kk6pby7",
    addon_gb: 2048,
  },
  10240: {
    product_id: "pro_01kq8m8v26xqhb9xcxy52xr41v",
    price_id: "pri_01kq8m8vca1w30vef63rv4rfgq",
    addon_gb: 10240,
  },
} as const;

export type PaddleProductMatch =
  | { kind: "tier"; tier_id: "pro" | "team" }
  | { kind: "addon"; addon_gb: 500 | 2048 | 10240 }
  | null;

/**
 * Reverse lookup: given a Paddle product_id from a webhook payload,
 * tell us whether it's a tier subscription (and which tier) or an
 * add-on (and how many GB). Returns null if the product is unknown.
 */
export function matchPaddleProduct(productId: string): PaddleProductMatch {
  for (const t of Object.values(PADDLE_TIER_PRODUCTS)) {
    if (t.product_id === productId) return { kind: "tier", tier_id: t.tier_id };
  }
  for (const a of Object.values(PADDLE_ADDON_PRODUCTS)) {
    if (a.product_id === productId) return { kind: "addon", addon_gb: a.addon_gb };
  }
  return null;
}
