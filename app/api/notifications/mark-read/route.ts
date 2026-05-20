import { NextResponse, type NextRequest } from "next/server";

import { markAllRead, markRead } from "@/lib/collab/notifications";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";

/* POST /api/notifications/mark-read
 *
 * Body: { id: uuid }      → mark that notification read
 *       { id: "all" }     → mark all unread notifications read for the user
 *
 * Thin wrapper over lib/collab/notifications. The parent
 * POST /api/notifications endpoint also accepts {ids:[]} / {all:true},
 * but this route gives the OS shell NotificationCenter the simpler
 * single-id contract specced in qa-d-notif-fake-seed.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data, error: userErr } = await supabase.auth.getUser();
  if (userErr || !data?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = data.user;

  let payload: { id?: string };
  try {
    payload = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const id = typeof payload?.id === "string" ? payload.id : "";
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  try {
    if (id === "all") {
      const updated = await markAllRead(user.id);
      return NextResponse.json({ ok: true, updated });
    }
    await markRead(id, user.id);
    return NextResponse.json({ ok: true, updated: 1 });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "notifications.mark_read",
          userId: user.id,
          fallback: "mark_read_failed",
        }),
      },
      { status: 400 }
    );
  }
}
