import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support
 *   ?status=open|in_progress|waiting_user|resolved|closed
 *   ?priority=low|normal|high|urgent
 *   ?assigned=<uuid>|unassigned
 *   ?q=<subject substring>
 *   ?limit=<n>&offset=<n>
 *
 * Returns: { rows: SupportTicketRow[], total: number }
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
  const priority = sp.get("priority");
  const assigned = sp.get("assigned");
  const q = sp.get("q");
  const limit = Math.min(200, Number(sp.get("limit")) || 50);
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const admin = createAdminClient();
  let query = admin
    .from("support_tickets")
    .select("*", { count: "exact" })
    .order("last_response_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (assigned === "unassigned") query = query.is("assigned_to", null);
  else if (assigned) query = query.eq("assigned_to", assigned);
  if (q) query = query.ilike("subject", `%${q}%`);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}
