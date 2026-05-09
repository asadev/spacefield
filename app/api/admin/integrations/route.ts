import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/integrations?category=&status=&enabled=on|off
 *
 * Admin-only JSON read of `integrations`. Same filters as the UI.
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
  const admin = createAdminClient();
  let query = admin
    .from("integrations")
    .select("*", { count: "exact" })
    .order("category", { ascending: true })
    .order("display_name", { ascending: true });

  const category = sp.get("category");
  if (category) query = query.eq("category", category);
  const status = sp.get("status");
  if (status) query = query.eq("status", status);
  const enabled = sp.get("enabled");
  if (enabled === "on") query = query.eq("enabled", true);
  else if (enabled === "off") query = query.eq("enabled", false);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [], count: count ?? 0 });
}
