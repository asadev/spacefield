import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/[id]/messages
 *   Returns: { rows: SupportMessageRow[] }
 *
 * Admin sees all messages on the ticket including internal notes.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_messages")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
