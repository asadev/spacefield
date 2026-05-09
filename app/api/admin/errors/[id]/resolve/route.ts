import { NextResponse, type NextRequest } from "next/server";

import { resolveSingle } from "@/app/admin/errors/[id]/_actions";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/errors/[id]/resolve
 *
 * Convenience wrapper around the `resolveSingle` server action so that
 * client-side code (e.g. detail page after a refetch) can mark a row
 * resolved without using a form submission. `assertAdmin` runs inside
 * the action.
 *
 * 401 — not signed in / not admin
 * 400 — missing id (shouldn't happen given the route shape)
 * 200 — `{ ok: true, id, resolved_at }`
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  try {
    const result = await resolveSingle(id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status =
      msg === "not signed in" || msg === "not authorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
