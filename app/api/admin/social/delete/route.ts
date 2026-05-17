import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

/* DELETE /api/admin/social/delete
 *   body: { id: string }
 *   returns: { ok: true }
 *
 * Hard-deletes the social_posts row. Does NOT unpublish the post on
 * Meta — that's a separate concern and intentionally handled with a
 * different button later (so a click can't accidentally nuke a live
 * post on the user's actual Page).
 */

export async function DELETE(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.social.delete.auth",
          fallback: "forbidden",
        }),
      },
      { status: 403 }
    );
  }

  let parsed: { id?: string };
  try {
    parsed = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!parsed.id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("social_posts")
    .delete()
    .eq("id", parsed.id);
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.social.delete",
          userId: auth.userId,
          fallback: "social_delete_failed",
        }),
      },
      { status: 500 }
    );
  }

  revalidatePath("/admin/social");
  return NextResponse.json({ ok: true });
}
