import "server-only";

/* lib/polar.ts — small helper around the Polar.sh REST API.
 *
 * Why a wrapper:
 *   - Single place that reads the API key (lazily, so missing env in
 *     CI doesn't kill the build — only request-time fails).
 *   - Single toggle for production vs sandbox base URL via
 *     POLAR_SANDBOX=true.
 *   - Centralised error-shape so callers can `if (!ok) throw new
 *     Error(message)` without stringifying random JSON.
 *
 * We intentionally do NOT use Polar's official Node SDK. The SDK
 * pulls in a chunky tree and we only need three endpoints.
 */

const PROD_BASE = "https://api.polar.sh";
const SANDBOX_BASE = "https://sandbox-api.polar.sh";

/** Lazy: throws at request time (not module load) if missing. */
export function getPolarKey(): string {
  const key = process.env.POLAR_API_KEY;
  if (!key) {
    throw new Error("POLAR_API_KEY is not set");
  }
  return key;
}

/** Lazy webhook secret read — webhook handler validates per-request. */
export function getPolarWebhookSecret(): string {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("POLAR_WEBHOOK_SECRET is not set");
  }
  return secret;
}

export function polarBaseUrl(): string {
  return process.env.POLAR_SANDBOX === "true" ? SANDBOX_BASE : PROD_BASE;
}

interface PolarFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * Make an authenticated request to the Polar API. Returns parsed JSON
 * on 2xx, throws an Error with a descriptive message otherwise.
 */
export async function polarFetch<T = unknown>(
  path: string,
  opts: PolarFetchOptions = {}
): Promise<T> {
  const url = `${polarBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getPolarKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — keep null and surface raw text in the error.
  }
  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed)
        : text;
    throw new Error(`Polar ${opts.method ?? "GET"} ${path} failed (${res.status}): ${detail}`);
  }
  return parsed as T;
}

/* ───────── typed helpers used by the app ───────── */

export interface PolarCheckout {
  id: string;
  url: string;
  status: string;
  product_id?: string | null;
  customer_email?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateCheckoutInput {
  productId: string;
  successUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string | number | undefined>;
}

export async function createPolarCheckout(input: CreateCheckoutInput): Promise<PolarCheckout> {
  // Polar expects metadata values as strings — coerce.
  const metadata: Record<string, string> = {};
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      if (v !== undefined && v !== null) metadata[k] = String(v);
    }
  }
  return polarFetch<PolarCheckout>("/v1/checkouts/", {
    method: "POST",
    body: {
      products: [input.productId],
      success_url: input.successUrl,
      customer_email: input.customerEmail,
      metadata,
    },
  });
}

export async function getPolarCheckout(checkoutId: string): Promise<PolarCheckout> {
  return polarFetch<PolarCheckout>(`/v1/checkouts/${encodeURIComponent(checkoutId)}`);
}
