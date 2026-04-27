import "server-only";

/* lib/paddle.ts — small helper around the Paddle.com REST API.
 *
 * Why a wrapper:
 *   - Single place that reads the API key (lazily, so missing env in
 *     CI doesn't kill the build — only request-time fails).
 *   - Single toggle for production vs sandbox base URL via
 *     PADDLE_ENVIRONMENT=sandbox.
 *   - Centralised error-shape so callers can `if (!ok) throw new
 *     Error(message)` without stringifying random JSON.
 *
 * Mirror of lib/polar.ts so swapping providers stays mechanical.
 *
 * We intentionally do NOT use Paddle's official SDK. The SDK pulls in
 * a chunky tree and we only need a handful of endpoints (products,
 * prices, customers, transactions for hosted-checkout-link creation).
 */

const PROD_BASE = "https://api.paddle.com";
const SANDBOX_BASE = "https://sandbox-api.paddle.com";

/** Lazy: throws at request time (not module load) if missing. */
export function getPaddleKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) {
    throw new Error("PADDLE_API_KEY is not set");
  }
  return key;
}

/** Lazy webhook secret read — webhook handler validates per-request. */
export function getPaddleWebhookSecret(): string {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("PADDLE_WEBHOOK_SECRET is not set");
  }
  return secret;
}

export function paddleBaseUrl(): string {
  return process.env.PADDLE_ENVIRONMENT === "sandbox" ? SANDBOX_BASE : PROD_BASE;
}

interface PaddleFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * Make an authenticated request to the Paddle API. Returns parsed JSON
 * on 2xx, throws an Error with a descriptive message otherwise. Every
 * request includes the required `Paddle-Version: 1` header.
 */
export async function paddleFetch<T = unknown>(
  path: string,
  opts: PaddleFetchOptions = {}
): Promise<T> {
  const url = `${paddleBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getPaddleKey()}`,
      "Paddle-Version": "1",
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
    throw new Error(`Paddle ${opts.method ?? "GET"} ${path} failed (${res.status}): ${detail}`);
  }
  return parsed as T;
}

/* ───────── typed helpers used by the app ───────── */

export interface PaddleCustomer {
  id: string;
  email: string;
  name?: string | null;
}

export interface PaddleListResponse<T> {
  data: T[];
  meta?: { request_id?: string; pagination?: { next?: string; has_more?: boolean } };
}

export interface PaddleResource<T> {
  data: T;
  meta?: { request_id?: string };
}

/**
 * Find or create a Paddle customer for the given email. Customers in
 * Paddle are unique per email at the account level. We look up first,
 * create on miss.
 */
export async function findOrCreatePaddleCustomer(email: string): Promise<PaddleCustomer> {
  const list = await paddleFetch<PaddleListResponse<PaddleCustomer>>(
    `/customers?email=${encodeURIComponent(email)}`
  );
  if (list.data && list.data.length > 0) {
    return list.data[0];
  }
  const created = await paddleFetch<PaddleResource<PaddleCustomer>>("/customers", {
    method: "POST",
    body: { email },
  });
  return created.data;
}
