import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/alerts?enabled=on|off&condition_type=...
 *
 * Admin-only JSON read of `admin_alerts`. Useful for the eventual
 * scheduled evaluator that will iterate the enabled rows and decide
 * whether to fire.
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
  const enabled = sp.get("enabled");
  const conditionType = sp.get("condition_type");

  const admin = createAdminClient();
  let query = admin
    .from("admin_alerts")
    .select("*")
    .order("name", { ascending: true });

  if (enabled === "on") query = query.eq("enabled", true);
  else if (enabled === "off") query = query.eq("enabled", false);
  if (conditionType) query = query.eq("condition_type", conditionType);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
