/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/inbound/form/[slug]
 *
 * Accepts JSON or application/x-www-form-urlencoded from the public
 * hosted form at `/f/<slug>`. No signature — the form schema in
 * `config.fields` is the authoritative validator.
 *
 * Each form field's `key` becomes the body key. Multi-value fields
 * (multi-select, checkbox groups) come through as repeated keys in
 * urlencoded bodies; we coalesce those into string[].
 *
 * CORS-open so the form can also be embedded as an `<iframe>` or fetched
 * from any origin.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  ingestFormSubmission,
  loadLeadSourceBySlug,
} from "@/lib/crm/lead-sources/ingest";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-requested-with",
  "access-control-max-age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function normalizeBody(
  raw: unknown
): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) => String(x));
    } else if (v === null || v === undefined) {
      // skip
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;

  // 10 submissions/min per IP. This route is auth-less and CORS-open,
  // so it's the most exposed surface — gate before we hit the DB to
  // resolve the slug. Use the rate-limit jsonResponse helper below so
  // the 429 still carries CORS headers; bots may not care, but legit
  // browser clients shouldn't see CORS errors instead of a 429.
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`ip:${ip}:inbound-form`, 10, 60);
  if (!allowed) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: "rate_limited" }),
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "content-type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  const source = await loadLeadSourceBySlug(slug);
  if (!source) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (source.kind !== "form") {
    return jsonResponse({ ok: false, error: "wrong_source_kind" }, 404);
  }

  const contentType = req.headers.get("content-type") ?? "";
  let fieldValues: Record<string, string | string[]> = {};
  try {
    if (contentType.includes("application/json")) {
      const raw = await req.json();
      fieldValues = normalizeBody(raw);
    } else {
      // form-urlencoded or multipart — both come through formData().
      const fd = await req.formData();
      const acc: Record<string, string | string[]> = {};
      fd.forEach((value, key) => {
        if (value instanceof File) return; // forms don't accept file uploads in v1
        const existing = acc[key];
        if (existing === undefined) {
          acc[key] = value;
        } else if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          acc[key] = [existing, value];
        }
      });
      fieldValues = acc;
    }
  } catch {
    return jsonResponse({ ok: false, error: "invalid_body" }, 422);
  }

  // Honeypot — `_hp_company` is a hidden field on the rendered form that
  // real users never see (and never fill). Spam bots auto-fill every input
  // they find. If it's non-empty, silently pretend the submission worked
  // so the bot moves on; never log verbosely or 4xx — bots learn from
  // rejections and tune around them.
  const hp = fieldValues["_hp_company"];
  const hpValue = Array.isArray(hp) ? hp.join("") : hp;
  if (typeof hpValue === "string" && hpValue.trim().length > 0) {
    console.warn(`[form/${slug}] honeypot tripped, dropping submission`);
    return jsonResponse({ ok: true }, 200);
  }
  // Strip the honeypot key so it never reaches the schema validator.
  delete fieldValues["_hp_company"];

  const meta = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent") || null,
  };

  try {
    const result = await ingestFormSubmission(source.id, fieldValues, meta);
    if (result.status === "rejected") {
      return jsonResponse(
        { ok: false, status: result.status, reason: result.reason },
        422
      );
    }
    if (result.status === "error") {
      return jsonResponse(
        { ok: false, status: result.status, reason: result.reason },
        500
      );
    }
    return jsonResponse(
      { ok: true, status: result.status, leadId: result.leadId },
      200
    );
  } catch (e) {
    return jsonResponse(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "inbound.form.ingest",
          fallback: "ingest_failed",
        }),
      },
      500
    );
  }
}
