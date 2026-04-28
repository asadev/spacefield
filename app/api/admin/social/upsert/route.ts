import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

/* POST /api/admin/social/upsert
 *   body: {
 *     id?: string,
 *     channel: 'facebook' | 'instagram',
 *     body: string,
 *     attachment_ids?: string[],
 *     link_url?: string | null,
 *     scheduled_at?: string | null   // ISO; null = draft / publish-now
 *   }
 *   returns: { post }
 *
 * Creates a new draft, or updates an existing draft / scheduled row.
 * Refuses to mutate posts that are already publishing/published —
 * those are immutable from the admin's perspective once they're out
 * (use delete + recreate for a re-edit story; out of scope today).
 */

const MAX_BODY_LEN_FB = 5000;
const MAX_BODY_LEN_IG = 2200;
const MAX_ATTACHMENTS = 10;

type Channel = "facebook" | "instagram";
type Status = "draft" | "scheduled" | "publishing" | "published" | "failed";

type UpsertBody = {
  id?: string;
  channel?: Channel;
  body?: string;
  attachment_ids?: string[];
  link_url?: string | null;
  scheduled_at?: string | null;
};

type SocialPostRow = {
  id: string;
  channel: Channel;
  status: Status;
  body: string;
  attachment_ids: string[];
  link_url: string | null;
  scheduled_at: string | null;
  meta_post_id: string | null;
  meta_permalink: string | null;
  insights: Record<string, unknown>;
  insights_at: string | null;
  failure_reason: string | null;
  created_by: string;
  created_at: string;
  published_at: string | null;
};

export async function POST(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  let parsed: UpsertBody;
  try {
    parsed = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!parsed.channel || !["facebook", "instagram"].includes(parsed.channel)) {
    return NextResponse.json(
      { error: "channel must be facebook or instagram" },
      { status: 400 }
    );
  }
  const body = (parsed.body ?? "").toString();
  const max = parsed.channel === "facebook" ? MAX_BODY_LEN_FB : MAX_BODY_LEN_IG;
  if (body.length > max) {
    return NextResponse.json(
      { error: `body too long: ${body.length} / ${max}` },
      { status: 400 }
    );
  }

  const attachments = Array.isArray(parsed.attachment_ids)
    ? parsed.attachment_ids.filter((s): s is string => typeof s === "string")
    : [];
  if (attachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `too many attachments (max ${MAX_ATTACHMENTS})` },
      { status: 400 }
    );
  }

  // Instagram requires at least one image; Meta will not accept a
  // text-only IG media container. Catch this early so the admin doesn't
  // burn a publish attempt to learn it.
  if (parsed.channel === "instagram" && attachments.length === 0) {
    return NextResponse.json(
      { error: "instagram posts require at least one image attachment" },
      { status: 400 }
    );
  }

  let scheduledAt: string | null = null;
  if (parsed.scheduled_at) {
    const t = new Date(parsed.scheduled_at);
    if (Number.isNaN(t.getTime())) {
      return NextResponse.json(
        { error: "scheduled_at is not a valid datetime" },
        { status: 400 }
      );
    }
    scheduledAt = t.toISOString();
  }
  const status: Status = scheduledAt ? "scheduled" : "draft";

  const linkUrl =
    parsed.channel === "facebook" && parsed.link_url
      ? parsed.link_url
      : null;

  const admin = createAdminClient();

  if (parsed.id) {
    const { data: existing, error: readErr } = await admin
      .from("social_posts")
      .select("id, status")
      .eq("id", parsed.id)
      .maybeSingle();
    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "post_not_found" }, { status: 404 });
    }
    const ex = existing as { id: string; status: Status };
    if (
      ex.status === "publishing" ||
      ex.status === "published"
    ) {
      return NextResponse.json(
        { error: `cannot edit a ${ex.status} post` },
        { status: 409 }
      );
    }
    const { data: updated, error: upErr } = await admin
      .from("social_posts")
      .update({
        channel: parsed.channel,
        body,
        attachment_ids: attachments,
        link_url: linkUrl,
        scheduled_at: scheduledAt,
        // Reset status from failed → draft/scheduled on edit so it
        // can be retried.
        status,
        failure_reason: null,
      })
      .eq("id", parsed.id)
      .select("*")
      .single();
    if (upErr || !updated) {
      return NextResponse.json(
        { error: upErr?.message ?? "update failed" },
        { status: 500 }
      );
    }
    revalidatePath("/admin/social");
    return NextResponse.json({ post: updated as SocialPostRow });
  }

  const { data: inserted, error: insErr } = await admin
    .from("social_posts")
    .insert({
      channel: parsed.channel,
      body,
      attachment_ids: attachments,
      link_url: linkUrl,
      scheduled_at: scheduledAt,
      status,
      created_by: auth.userId,
    })
    .select("*")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "insert failed" },
      { status: 500 }
    );
  }

  revalidatePath("/admin/social");
  return NextResponse.json({ post: inserted as SocialPostRow });
}
