import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/data-exports?status=pending&kind=gdpr_export
 *
 * Admin-only JSON read of `data_export_requests`. Mirrors the filters on
 * the `/admin/data-exports` page.
 */
export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const kind = sp.get("kind");
  const userId = sp.get("user_id");
  const limitRaw = sp.get("limit");
  const limit = Math.min(500, Math.max(1, Number(limitRaw) || 100));

  const admin = createAdminClient();
  let query = admin
    .from("data_export_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (kind) query = query.eq("kind", kind);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
