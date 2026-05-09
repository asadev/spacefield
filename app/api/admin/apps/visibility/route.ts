import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/admin/apps/visibility?slug=X&uid=Y&ws_id=Z
 *   Calls public.app_visible(app_slug, uid, ws_id) and returns the verdict
 *   JSON. Used by the per-app page's visibility tester and any external
 *   tooling (curl) admins want to script.
 *
 *   ws_id is optional. uid is optional too — when omitted, the RPC defaults
 *   to auth.uid(), which is the admin themselves.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  const uid = req.nextUrl.searchParams.get("uid")?.trim() || null;
  const wsId = req.nextUrl.searchParams.get("ws_id")?.trim() || null;
  if (!slug) {
    return NextResponse.json({ error: "missing slug" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("app_visible", {
    app_slug: slug,
    uid,
    ws_id: wsId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slug, uid, ws_id: wsId, result: data });
}
