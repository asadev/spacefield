/* Authenticated mint endpoint.
 *
 * Tools POST { type, payload, sourceTool, workspaceId?, customSlug? }.
 * Returns { ok, url, linkId, slug } or { ok:false, error }.
 */

import { NextRequest, NextResponse } from "next/server";
import { mintLink } from "@/lib/toshare/server";
import type { ToShareType } from "@/lib/toshare/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.type !== "string" || typeof body.payload !== "object") {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }
    const result = await mintLink({
      type: body.type as ToShareType,
      payload: body.payload,
      sourceTool: typeof body.sourceTool === "string" ? body.sourceTool : "unknown",
      workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : undefined,
      customSlug: typeof body.customSlug === "string" ? body.customSlug : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
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
}
