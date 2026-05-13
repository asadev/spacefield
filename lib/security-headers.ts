/**
 * Centralised security headers + request-ID for every middleware response.
 *
 * Single source of truth so the policy doesn't drift between routes.
 * Called from middleware.ts on the final outgoing response.
 *
 * Header rollout decisions (2026-05-13):
 *   - HSTS — 2 years + includeSubDomains + preload. Spacefield is
 *     HTTPS-only via Vercel; safe to lock in long-lived.
 *   - X-Content-Type-Options: nosniff — defence against MIME-sniff XSS.
 *   - X-Frame-Options: SAMEORIGIN — clickjacking. We do not frame our
 *     site from third parties; toShare opens new tabs, not iframes.
 *   - Referrer-Policy: strict-origin-when-cross-origin — same default
 *     browsers ship, made explicit so it survives older edge runtimes.
 *   - Permissions-Policy — blocks camera/mic/payment by default; FLoC
 *     opt-out via interest-cohort=(). Geo allowed for self so the
 *     Market Pulse tool can request user location.
 *   - Content-Security-Policy — shipped as **Report-Only** for now.
 *     Anything that violates the policy is logged in dev-tools but
 *     not blocked. Once we have a Sentry/Datadog wired we'll capture
 *     the report-uri stream and flip to enforcing. This is the
 *     standard rollout pattern (Stripe, Linear, GitHub all started
 *     report-only for weeks).
 *
 * Request ID: every response gets an `X-Request-Id` header. If the
 * client already sent one (proxy chain), we honour it; otherwise we
 * generate a UUID. Downstream logs can correlate by this id.
 */

import { NextResponse } from "next/server";

const HSTS = "max-age=63072000; includeSubDomains; preload";

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=(self)",
  "payment=()",
  "usb=()",
  "magnetometer=()",
  "accelerometer=()",
  "gyroscope=()",
  "interest-cohort=()",
].join(", ");

/**
 * Report-Only CSP. Generous because we don't yet have a violation
 * reporter wired. Tighten once Sentry captures report-uri.
 *
 * Sources we know need to be allowed:
 *   - script-src self + 'unsafe-inline'/'unsafe-eval' until we audit;
 *     plus Vercel preview helpers and Paddle checkout.
 *   - style-src self + 'unsafe-inline' (Tailwind ships some inline).
 *   - img-src open (Next/image + user uploads + external embeds).
 *   - connect-src Supabase + Anthropic + OpenAI + Paddle + Vercel.
 *   - frame-src Paddle checkout.
 *   - frame-ancestors self (matches X-Frame-Options).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-scripts.com https://*.paddle.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://api.anthropic.com https://api.openai.com https://*.paddle.com https://*.vercel-insights.com https://vercel.live https://www.google-analytics.com",
  "frame-src 'self' https://*.paddle.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Generate a request ID. Honours an inbound `x-request-id` if the
 * client/proxy supplied one (lets edge → fn chains share the same id).
 */
export function resolveRequestId(inbound: string | null): string {
  if (inbound && /^[a-zA-Z0-9_-]{8,128}$/.test(inbound)) return inbound;
  // crypto is available in the Edge runtime
  return crypto.randomUUID();
}

/**
 * Attach the standard security headers + request-ID to a response.
 * Returns the same response for chaining.
 */
export function applySecurityHeaders(
  response: NextResponse,
  requestId: string,
): NextResponse {
  // Hard-set HTTPS lock-in (HSTS only matters over HTTPS; harmless on http).
  response.headers.set("Strict-Transport-Security", HSTS);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  // Report-only — observe first, enforce later.
  response.headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  // Correlation
  response.headers.set("X-Request-Id", requestId);
  return response;
}
