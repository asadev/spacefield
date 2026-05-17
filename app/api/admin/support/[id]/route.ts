import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/[id]
 *   Returns: { ticket: SupportTicketRow }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.support.get.auth",
          fallback: "forbidden",
        }),
      },
      { status: 401 }
    );
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.support.get",
          userId: auth.userId,
          fallback: "support_get_failed",
        }),
      },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ticket: data });
}
