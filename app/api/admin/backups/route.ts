import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backups?kind=manual&scope=full&status=completed
 *
 * Admin-only JSON read of `backup_snapshots`. Mirrors the filters on
 * the `/admin/backups` page.
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
  const kind = sp.get("kind");
  const scope = sp.get("scope");
  const status = sp.get("status");
  const limitRaw = sp.get("limit");
  const limit = Math.min(500, Math.max(1, Number(limitRaw) || 100));

  const admin = createAdminClient();
  let query = admin
    .from("backup_snapshots")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (kind) query = query.eq("kind", kind);
  if (scope) query = query.eq("scope", scope);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
