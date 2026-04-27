/* Polar.sh product + price IDs — generated 2026-04-27.
 *
 * These IDs are produced by `POST /v1/products/` against the live Polar
 * organization (id `d2fcd5e6-e3cd-4e45-9952-65b464cc8665`). Captured at
 * creation time and pinned here so:
 *
 *   - The checkout API knows which Polar product/price to spin up a
 *     session against, given a tier slug or an addon GB delta.
 *   - The webhook handler knows how to map an inbound `product_id` to
 *     either a tier_id (Pro/Team) or an addon_gb (500/2048/10240).
 *
 * If we re-create these in Polar (say, after wiping the sandbox) the
 * IDs change — re-run the bootstrap curls and replace this file. Do
 * NOT regenerate at runtime; we want the values pinned in source.
 *
 * Enterprise is intentionally absent — that's a "contact sales" flow,
 * no Polar product.
 */

export interface PolarTierProduct {
  product_id: string;
  price_id: string;
  tier_id: "pro" | "team";
}

export interface PolarAddonProduct {
  product_id: string;
  price_id: string;
  addon_gb: 500 | 2048 | 10240;
}

export const POLAR_TIER_PRODUCTS: Readonly<Record<"pro" | "team", PolarTierProduct>> = {
  pro: {
    product_id: "5d9561ba-bb46-4bfe-9bb4-f3894a866ce0",
    price_id: "692dd53f-514d-42f7-a870-d8e8346aa691",
    tier_id: "pro",
  },
  team: {
    product_id: "9b0f70b9-c827-41e5-96bb-74140f1ce263",
    price_id: "887c4067-3bcf-4740-81d1-1afee1b44c5a",
    tier_id: "team",
  },
} as const;

export const POLAR_ADDON_PRODUCTS: Readonly<Record<500 | 2048 | 10240, PolarAddonProduct>> = {
  500: {
    product_id: "138821a7-cd1b-4348-b52d-5e74006f7c8b",
    price_id: "23a51e82-a209-45ab-baa3-2f4046716fd3",
    addon_gb: 500,
  },
  2048: {
    product_id: "811fb437-7c3d-45b2-b216-f2c123c9d850",
    price_id: "3fc8e923-e4cd-4985-9a19-9e1bedd377fc",
    addon_gb: 2048,
  },
  10240: {
    product_id: "23a25a87-cee9-4dd5-a737-414c10d7ea60",
    price_id: "f92c2bc0-2099-478c-bdb6-aff67b871e3f",
    addon_gb: 10240,
  },
} as const;

/**
 * Reverse lookup: given a Polar product_id from a webhook payload,
 * tell us whether it's a tier subscription (and which tier) or an
 * add-on (and how many GB). Returns null if the product is unknown
 * (e.g. a manually-created Polar product we haven't wired in code).
 */
export type PolarProductMatch =
  | { kind: "tier"; tier_id: "pro" | "team" }
  | { kind: "addon"; addon_gb: 500 | 2048 | 10240 }
  | null;

export function matchPolarProduct(productId: string): PolarProductMatch {
  for (const t of Object.values(POLAR_TIER_PRODUCTS)) {
    if (t.product_id === productId) return { kind: "tier", tier_id: t.tier_id };
  }
  for (const a of Object.values(POLAR_ADDON_PRODUCTS)) {
    if (a.product_id === productId) return { kind: "addon", addon_gb: a.addon_gb };
  }
  return null;
}
