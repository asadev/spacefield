/* POST /api/unsubscribe?t=<token>
 *
 * Gmail's RFC 8058 one-click endpoint. Mail clients that support
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` POST to this
 * URL with no body (or `List-Unsubscribe=One-Click` form-encoded)
 * and expect a 2xx. There is no redirect, no UI — Gmail shows its own
 * confirmation toast.
 *
 * We accept both POST (Gmail one-click) and GET (some clients send GET
 * when the user explicitly clicks the link). Both flip the matching
 * notification_prefs column to false via the same HMAC-verified path.
 *
 * Security:
 *   - No auth — token IS the auth (HMAC over user_id + kind + expiry).
 *   - We do NOT echo the token, user_id, or kind in the response body;
 *     a successful unsub returns plain "ok".
 *   - The route does not enumerate kinds or user_ids on failure — every
 *     bad-token branch returns the same 400 body.
 *
 * Note on rate limiting:
 *   This is gated by `middleware.ts` global rate limits (anonymous
 *   POSTs are capped). We don't add a route-specific limiter because
 *   real user traffic on this endpoint is tiny (one POST per user per
 *   unsub) and the HMAC verification is cheap.
 */

import { type NextRequest, NextResponse } from "next/server";

import {
  applyUnsubscribe,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return new NextResponse("missing token", { status: 400 });
  }
  const v = verifyUnsubscribeToken(token);
  if (!v.ok) {
    log.info("unsubscribe.reject", { reason: v.reason });
    return new NextResponse("invalid token", { status: 400 });
  }
  const res = await applyUnsubscribe(v.user_id, v.kind);
  if (!res.ok) {
    return new NextResponse("server error", { status: 500 });
  }
  return new NextResponse("ok", { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
