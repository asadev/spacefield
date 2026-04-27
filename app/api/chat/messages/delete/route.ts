import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* DELETE /api/chat/messages/delete?id=<uuid>
 *
 * Soft-delete: set deleted_at. RLS allows this when caller is the
 * author or is owner/admin of the workspace. We use a soft delete so
 * Realtime subscribers see an UPDATE event (deleted_at flipping)
 * rather than a DELETE — easier to reconcile in the client list.
 */

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  // We keep delete-via-update because the RLS update policy only
  // allows authors (intentional). Hard delete via DELETE policy still
  // works for admins/owners — but for v1 the soft-delete path covers
  // the visible 'remove' affordance for authors.
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, deleted_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found_or_forbidden" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, id: data.id });
}
