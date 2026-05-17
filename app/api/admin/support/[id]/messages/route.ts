import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
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
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.support.messages.list.auth",
          fallback: "forbidden",
        }),
      },
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
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.support.messages.list",
          userId: auth.userId,
          fallback: "support_messages_list_failed",
        }),
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ rows: data ?? [] });
}
