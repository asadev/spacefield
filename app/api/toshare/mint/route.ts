/* Authenticated mint endpoint.
 *
 * Tools POST { type, payload, sourceTool, workspaceId?, customSlug? }.
 * Returns { ok, url, linkId, slug } or { ok:false, error }.
 *
 * Hardening (V-3):
 *   - rate-limit: 30 mints / 10 min keyed by user (falls back to IP if
 *     somehow unauthenticated past the RPC's own auth gate)
 *   - reserved-slug guard: reject customSlug that would shadow a
 *     first-party route (signin, admin, api, …) before we even call
 *     mintLink.
 */

import { NextRequest, NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { withIdempotency } from "@/lib/idempotency";
import { safeErrorMessage } from "@/lib/safe-error";
import { mintLink } from "@/lib/toshare/server";
import type { ToShareType } from "@/lib/toshare/types";

export const runtime = "nodejs";

const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "signin",
  "admin",
  "api",
  "spacefield",
  "toshare",
  "logout",
  "login",
  "settings",
  "billing",
  "checkout",
  "support",
  "help",
]);

export const POST = withApiHandler(
  async (req: NextRequest) => {
    try {
      const body = await req.json().catch(() => null);
      if (
        !body ||
        typeof body.type !== "string" ||
        typeof body.payload !== "object"
      ) {
        return NextResponse.json(
          { ok: false, error: "invalid payload" },
          { status: 400 }
        );
      }

      const customSlug =
        typeof body.customSlug === "string" ? body.customSlug : undefined;
      if (customSlug && RESERVED_SLUGS.has(customSlug.toLowerCase())) {
        return NextResponse.json(
          { ok: false, error: "slug is reserved" },
          { status: 400 }
        );
      }

      // Idempotency-Key support: a client retrying after a network blip
      // can pass the same key and receive the previously-minted link
      // instead of creating a duplicate share. We namespace as
      // `toshare:<key>` so keys from other call sites can't collide.
      const idempotencyKey = req.headers.get("idempotency-key") ?? "";
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const supabaseServiceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE ||
        "";

      type MintResponse =
        | { ok: true; url?: string; linkId?: string; slug?: string }
        | { ok: false; error: string; status: number };

      const wrapped = await withIdempotency<MintResponse>(
        {
          key: idempotencyKey ? `toshare:${idempotencyKey}` : "",
          supabase: { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey },
        },
        async () => {
          const result = await mintLink({
            type: body.type as ToShareType,
            payload: body.payload,
            sourceTool:
              typeof body.sourceTool === "string" ? body.sourceTool : "unknown",
            workspaceId:
              typeof body.workspaceId === "string"
                ? body.workspaceId
                : undefined,
            customSlug,
          });
          if (!result.ok) {
            return { ok: false, error: result.error ?? "mint_failed", status: 400 };
          }
          return {
            ok: true,
            url: result.url,
            linkId: result.link?.id,
            slug: result.link?.slug,
          };
        },
      );

      if (!wrapped.ok) {
        return NextResponse.json(
          { ok: false, error: wrapped.error },
          { status: wrapped.status }
        );
      }
      return NextResponse.json({
        ok: true,
        url: wrapped.url,
        linkId: wrapped.linkId,
        slug: wrapped.slug,
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: safeErrorMessage(err, {
            source: "toshare.mint",
            fallback: "mint_failed",
          }),
        },
        { status: 500 }
      );
    }
  },
  {
    source: "toshare.mint",
    rateLimit: { count: 30, window_sec: 600 },
  }
);
