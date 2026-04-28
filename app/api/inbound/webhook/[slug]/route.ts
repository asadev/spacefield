/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/inbound/webhook/[slug]
 *
 * Public ingest URL. Any external system POSTs JSON here with header
 * `x-spacefield-signature: <hmac-sha256(rawBody, source.secret) hex>`.
 *
 * Fallback for systems that can't sign (Zapier, Make, etc.):
 *   ?token=<source.secret> in the URL — documented as less secure.
 *
 * CORS-open (any origin can POST). All other CRM routes are same-origin.
 *
 * Status codes:
 *   200 ok         — accepted | duplicate
 *   400 bad sig    — missing/invalid signature
 *   404            — slug unknown
 *   422            — payload validation failed
 *   500            — internal error
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import {
  ingestWebhookPayload,
  loadLeadSourceBySlug,
  verifyWebhookSignature,
} from "@/lib/crm/lead-sources/ingest";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "content-type, x-spacefield-signature, x-requested-with",
  "access-control-max-age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const source = await loadLeadSourceBySlug(slug);
  if (!source) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (source.kind !== "webhook") {
    return jsonResponse({ ok: false, error: "wrong_source_kind" }, 404);
  }

  // Read raw body once — needed both for HMAC verification and for
  // event-log archival. Re-parsing as JSON happens after signature.
  const raw = await req.text();

  // Signature: header preferred, ?token= fallback for Zapier/Make.
  const sigHeader = req.headers.get("x-spacefield-signature") ?? "";
  const tokenParam = req.nextUrl.searchParams.get("token") ?? "";
  let authorized = false;
  if (sigHeader) {
    authorized = await verifyWebhookSignature(raw, sigHeader, source.secret);
  } else if (tokenParam) {
    // Constant-time-ish comparison for the token fallback.
    authorized =
      tokenParam.length === source.secret.length &&
      tokenParam === source.secret;
  }
  if (!authorized) {
    return jsonResponse({ ok: false, error: "bad_signature" }, 400);
  }

  let payload: unknown;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 422);
  }

  const meta = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent") || null,
  };

  try {
    const result = await ingestWebhookPayload(source.id, payload, meta);
    if (result.status === "rejected") {
      return jsonResponse(
        {
          ok: false,
          status: result.status,
          reason: result.reason,
          leadId: result.leadId,
        },
        422
      );
    }
    if (result.status === "error") {
      return jsonResponse(
        {
          ok: false,
          status: result.status,
          reason: result.reason,
        },
        500
      );
    }
    return jsonResponse(
      {
        ok: true,
        status: result.status,
        leadId: result.leadId,
      },
      200
    );
  } catch (e) {
    return jsonResponse(
      { ok: false, error: (e as Error).message },
      500
    );
  }
}
