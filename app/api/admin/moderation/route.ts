import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/moderation?enabled=on|off&rule_kind=...&action=...&applies_to=...
 *
 * Admin-only JSON read of `moderation_rules`. Useful for the runtime
 * moderator that loads enabled rules and applies them to inbound text.
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
  const ruleKind = sp.get("rule_kind");
  const action = sp.get("action");
  const appliesTo = sp.get("applies_to");

  const admin = createAdminClient();
  let query = admin
    .from("moderation_rules")
    .select("*")
    .order("severity", { ascending: false })
    .order("updated_at", { ascending: false });

  if (enabled === "on") query = query.eq("enabled", true);
  else if (enabled === "off") query = query.eq("enabled", false);
  if (ruleKind) query = query.eq("rule_kind", ruleKind);
  if (action) query = query.eq("action", action);
  if (appliesTo) query = query.eq("applies_to", appliesTo);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
