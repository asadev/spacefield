import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/admin/social/list
 *   query: ?status=draft|scheduled|publishing|published|failed (optional)
 *          ?limit=200 (default 200, max 500)
 *   returns: { posts: [...] }
 *
 * Admin-only listing for the /admin/social page. Newest first. We don't
 * paginate aggressively because admin volumes are tiny — this is one
 * person posting from one panel.
 */

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const status = req.nextUrl.searchParams.get("status");
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const admin = createAdminClient();
  let q = admin
    .from("social_posts")
    .select(
      "id, channel, status, body, attachment_ids, link_url, scheduled_at, meta_post_id, meta_permalink, insights, insights_at, failure_reason, created_by, created_at, published_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data ?? [] });
}
