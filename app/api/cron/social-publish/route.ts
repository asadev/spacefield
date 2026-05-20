import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
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
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 25;

type ScheduledRow = { id: string };

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

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
