import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/chat/read
 *   body: { channel_id }
 *   returns: { ok: true, last_read_at }
 *
 * Used to clear the unread badge when a member opens / scrolls to the
 * bottom of a channel.
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: { channel_id?: string };
  try {
    parsed = (await req.json()) as typeof parsed;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const channelId = parsed.channel_id;
  if (!channelId) {
    return NextResponse.json({ error: "missing channel_id" }, { status: 400 });
  }

  const lastReadAt = new Date().toISOString();
  const { error } = await supabase
    .from("chat_read_state")
    .upsert(
      { user_id: user.id, channel_id: channelId, last_read_at: lastReadAt },
      { onConflict: "user_id,channel_id" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, last_read_at: lastReadAt });
}
