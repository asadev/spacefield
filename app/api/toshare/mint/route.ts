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

      const result = await mintLink({
        type: body.type as ToShareType,
        payload: body.payload,
        sourceTool:
          typeof body.sourceTool === "string" ? body.sourceTool : "unknown",
        workspaceId:
          typeof body.workspaceId === "string" ? body.workspaceId : undefined,
        customSlug,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        url: result.url,
        linkId: result.link?.id,
        slug: result.link?.slug,
      });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "unknown" },
        { status: 500 }
      );
    }
  },
  {
    source: "toshare.mint",
    rateLimit: { count: 30, window_sec: 600 },
  }
);
