import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { publishSocialPost } from "@/lib/meta-publish";

/* GET /api/cron/social-publish
 *
 * Wired in vercel.json to run every 5 minutes. Picks up any
 *   status='scheduled' AND scheduled_at <= now()
 * rows and publishes them.
 *
 * Concurrency safety: publishSocialPost() does an atomic
 *   UPDATE ... WHERE status IN (...) RETURNING *
 * so even if two cron invocations overlap (or the manual button
 * races the cron), only one wins the row.
 *
 * Auth: Vercel adds an `Authorization: Bearer <CRON_SECRET>` header
 * to scheduled invocations. We accept either:
 *   - that header (production), or
 *   - calls from the Vercel cron user-agent (`vercel-cron/1.0`).
 * Manual hits without either are rejected to keep this from being
 * a wide-open trigger.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 25;

type ScheduledRow = { id: string };

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("social_posts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ScheduledRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, picked: 0 });
  }

  // Sequential rather than parallel: each post hits the Meta API,
  // and IG specifically rate-limits the media + media_publish pair.
  // 25 posts × ~2s = well under the 60s function ceiling.
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const r of rows) {
    const out = await publishSocialPost(r.id);
    results.push({
      id: r.id,
      ok: out.ok,
      error: out.ok ? undefined : out.error,
    });
  }

  return NextResponse.json({
    ok: true,
    picked: rows.length,
    results,
  });
}

function isAuthorizedCronCall(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("vercel-cron")) return true;
  // Allow the special header Vercel sets on scheduled invocations.
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}
