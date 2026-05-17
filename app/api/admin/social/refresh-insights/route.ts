import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostInsights } from "@/lib/meta";

/* POST /api/admin/social/refresh-insights
 *   body: { id: string }
 *   returns: { post }
 *
 * Pulls the small `{ likes, comments, reach, impressions }` slice from
 * Meta and writes it onto the row. Used both manually (refresh button
 * on the admin row) and by an eventual scheduled job — the API shape
 * is identical so the cron can call it the same way.
 */

type Channel = "facebook" | "instagram";

export async function POST(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.social.refresh_insights.auth",
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
  const { data: row, error: readErr } = await admin
    .from("social_posts")
    .select("id, channel, status, meta_post_id")
    .eq("id", parsed.id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      {
        error: safeErrorMessage(readErr, {
          source: "admin.social.refresh_insights.read",
          userId: auth.userId,
          fallback: "post_read_failed",
        }),
      },
      { status: 500 }
    );
  }
  if (!row) {
    return NextResponse.json({ error: "post_not_found" }, { status: 404 });
  }
  const r = row as {
    id: string;
    channel: Channel;
    status: string;
    meta_post_id: string | null;
  };
  if (r.status !== "published" || !r.meta_post_id) {
    return NextResponse.json(
      { error: "post is not published yet" },
      { status: 400 }
    );
  }

  let insights;
  try {
    insights = await getPostInsights(r.meta_post_id, r.channel);
  } catch (err) {
    return NextResponse.json(
      {
        error: safeErrorMessage(err, {
          source: "admin.social.refresh_insights.meta",
          userId: auth.userId,
          fallback: "meta_error",
        }),
      },
      { status: 502 }
    );
  }

  const { data: updated, error: upErr } = await admin
    .from("social_posts")
    .update({
      insights,
      insights_at: new Date().toISOString(),
    })
    .eq("id", r.id)
    .select("*")
    .single();
  if (upErr || !updated) {
    return NextResponse.json(
      {
        error: safeErrorMessage(upErr ?? new Error("update failed"), {
          source: "admin.social.refresh_insights.update",
          userId: auth.userId,
          fallback: "update_failed",
        }),
      },
      { status: 500 }
    );
  }

  revalidatePath("/admin/social");
  return NextResponse.json({ post: updated });
}
