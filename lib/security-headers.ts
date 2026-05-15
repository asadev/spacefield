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
 *     site from third parties for the main app; SE-008 carves an
 *     exception for Share viewer paths and `/embed/*` which exist
 *     specifically to be iframed onto customer sites.
 *   - Referrer-Policy: strict-origin-when-cross-origin — same default
 *     browsers ship, made explicit so it survives older edge runtimes.
 *   - Permissions-Policy — blocks camera/mic/payment by default; FLoC
 *     opt-out via interest-cohort=(). Geo allowed for self so the
 *     Market Pulse tool can request user location.
 *   - Content-Security-Policy — Report-Only. SE-003 added a
 *     `report-uri` + `report-to` so violations surface in
 *     /admin/errors (sink: /api/security/csp-report). SE-004 dropped
 *     `'unsafe-eval'` from script-src; Tailwind doesn't need it and
 *     keeping it open is the highest-value rung on the CSP ladder.
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

const CSP_REPORT_PATH = "/api/security/csp-report";

/**
 * Report-Only CSP. Generous because we don't yet have a violation
 * reporter wired. Tighten once Sentry captures report-uri.
 *
 * SE-004 — `'unsafe-eval'` dropped. The only reason it was here was
 * "I haven't audited yet"; nothing in the current bundle needs eval.
 * `'unsafe-inline'` stays because Tailwind ships some inline.
 *
 * Sources we know need to be allowed:
 *   - script-src self + 'unsafe-inline' (Tailwind inline) + Vercel
 *     preview helpers + Paddle checkout + GA.
 *   - style-src self + 'unsafe-inline' (Tailwind ships some inline).
 *   - img-src open (Next/image + user uploads + external embeds).
 *   - connect-src Supabase + Anthropic + OpenAI + Paddle + Vercel.
 *   - frame-src Paddle checkout.
 *   - frame-ancestors self (matches X-Frame-Options).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://vercel.live https://*.vercel-scripts.com https://*.paddle.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://api.anthropic.com https://api.openai.com https://*.paddle.com https://*.vercel-insights.com https://vercel.live https://www.google-analytics.com",
  "frame-src 'self' https://*.paddle.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `report-uri ${CSP_REPORT_PATH}`,
  "report-to csp-endpoint",
].join("; ");

/* SE-003 — Reporting API endpoint group. Newer browsers prefer this
 * over the legacy `report-uri`; we ship both. `max_age` ~ 1 week. */
const REPORT_TO = JSON.stringify({
  group: "csp-endpoint",
  max_age: 10886400,
  endpoints: [{ url: CSP_REPORT_PATH }],
});

/* SE-008 — Share viewer prefixes + the generic `/embed` namespace
 * are designed to be iframed on customer sites. Adding XFO:SAMEORIGIN
 * + `frame-ancestors 'self'` to those responses breaks the entire
 * product. `isEmbedPath()` returns true for any path that should be
 * served WITHOUT the framing lockdown.
 *
 * - `/embed/*` — explicit embed namespace.
 * - `/p/*` `/q/*` `/r/*` `/b/*` `/d/*` — Share viewers (Proposal /
 *   Quote / Report / Brochure / Document, see lib/Share).
 */
const EMBED_PREFIXES = ["/embed", "/p/", "/q/", "/r/", "/b/", "/d/"];
const EMBED_EXACT = new Set(["/p", "/q", "/r", "/b", "/d", "/embed"]);

export function isEmbedPath(pathname: string): boolean {
  if (!pathname) return false;
  if (EMBED_EXACT.has(pathname)) return true;
  for (const p of EMBED_PREFIXES) {
    if (pathname === p) return true;
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

/* For embed paths we still want CSP, just without `frame-ancestors`. */
const CSP_REPORT_ONLY_EMBED = CSP_REPORT_ONLY.split("; ")
  .filter((d) => !d.startsWith("frame-ancestors"))
  .join("; ");

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
 *
 * `pathname` lets us drop X-Frame-Options + frame-ancestors for embed
 * paths (Share viewers + `/embed/*`). Callers that don't have a
 * pathname handy can omit it — the safe default is the lockdown.
 */
export function applySecurityHeaders(
  response: NextResponse,
  requestId: string,
  pathname?: string,
): NextResponse {
  // Hard-set HTTPS lock-in (HSTS only matters over HTTPS; harmless on http).
  response.headers.set("Strict-Transport-Security", HSTS);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);

  const embed = pathname ? isEmbedPath(pathname) : false;
  if (!embed) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      CSP_REPORT_ONLY,
    );
  } else {
    // SE-008 — embed paths intentionally omit XFO + frame-ancestors so
    // Share viewers + `/embed/*` can render on customer sites.
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      CSP_REPORT_ONLY_EMBED,
    );
  }

  // SE-003 — Reporting API endpoint advertisement. Browsers cache the
  // group for `max_age` seconds and POST violation reports to the
  // endpoint URL. Cheap to set on every response.
  response.headers.set("Report-To", REPORT_TO);

  // Correlation
  response.headers.set("X-Request-Id", requestId);
  return response;
}
