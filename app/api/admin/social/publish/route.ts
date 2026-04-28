import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/app/admin/_lib";
import { publishSocialPost } from "@/lib/meta-publish";

/* POST /api/admin/social/publish
 *   body: { id: string }
 *   returns: { post } on success, { error, post? } on failure
 *
 * Idempotent. The actual publish flow lives in lib/meta-publish.ts so
 * the cron route can reuse it without re-running the admin auth dance.
 */

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
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

  const result = await publishSocialPost(parsed.id);
  revalidatePath("/admin/social");
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, post: result.post ?? null },
      { status: 500 }
    );
  }
  return NextResponse.json({ post: result.post });
}
