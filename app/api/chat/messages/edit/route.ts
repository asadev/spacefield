import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/chat/messages/edit
 *   body: { id, body }
 *   returns: { message }
 *
 * RLS already restricts updates to user_id = auth.uid().
 */

const MAX_BODY_LEN = 8000;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: { id?: string; body?: string };
  try {
    parsed = (await req.json()) as typeof parsed;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const id = parsed.id;
  const body = (parsed.body ?? "").toString().slice(0, MAX_BODY_LEN);
  if (!id || body.trim().length === 0) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(
      "id, channel_id, workspace_id, user_id, body, attachments, reply_to, edited_at, deleted_at, created_at"
    )
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

  return NextResponse.json({ message: data });
}
